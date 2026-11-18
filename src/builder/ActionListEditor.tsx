import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { CatalogField, SplitAction, WidgetDescriptor } from '../../shared/model';
import { Button, IconButton, Input, Select, Toggle, FieldErrorScope } from '../ui';
import { createId } from './operations';
import { WidgetInvocationEditor } from './WidgetInvocationEditor';
import { BoundPropsEditor } from './ComponentPropsEditor';
import { getActionPresentationDescriptors } from '../../shared/action-presentation';

export function ActionListEditor({
  actions,
  widgets,
  placement,
  fields = [],
  onChange,
}: {
  actions: SplitAction[];
  widgets: WidgetDescriptor[];
  placement: 'header' | 'footer';
  fields?: CatalogField[];
  onChange: (actions: SplitAction[]) => void;
}) {
  const create = (): SplitAction => ({
    id: createId('action'),
    label: widgets[0]?.name ?? 'Открыть виджет',
    kind: 'openWidget',
    widgetId: widgets[0]?.id ?? '',
  });
  const change = (id: string, update: Partial<SplitAction>) =>
    onChange(actions.map((action) => (action.id === id ? { ...action, ...update } : action)));
  const move = (index: number, delta: number) => {
    const next = [...actions];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="builder-actions-editor">
      <Toggle
        label={placement === 'header' ? 'Показывать меню в шапке' : 'Показывать меню внизу'}
        checked={actions.length > 0}
        disabled={!widgets.length}
        onChange={(checked) => onChange(checked ? [create()] : [])}
      />
      {!widgets.length && <p className="builder-property-copy">В каталоге пока нет виджетов для перехода.</p>}
      {actions.map((action, index) => (
        <FieldErrorScope key={action.id} path={`actions[${index}]`}>
          <div className="builder-action-settings">
            <div className="builder-action-heading">
              <strong>Действие {index + 1}</strong>
              <div>
                <IconButton
                  label={`Поднять действие «${action.label}»`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={13} />
                </IconButton>
                <IconButton
                  label={`Опустить действие «${action.label}»`}
                  disabled={index === actions.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={13} />
                </IconButton>
                <IconButton
                  label={`Удалить действие «${action.label}»`}
                  onClick={() => onChange(actions.filter((item) => item.id !== action.id))}
                >
                  <X size={13} />
                </IconButton>
              </div>
            </div>
            <Input
              label="Название действия"
              path="label"
              required
              maxLength={2000}
              value={action.label}
              onChange={(event) => change(action.id, { label: event.target.value })}
            />
            <Select
              label="Открыть виджет"
              path="widgetId"
              value={action.widgetId}
              options={widgets.map((widget) => ({ value: widget.id, label: widget.name }))}
              onChange={(event) => change(action.id, { widgetId: event.target.value, props: {}, events: {} })}
            />
            <p className="builder-field-description">
              {widgets.find((widget) => widget.id === action.widgetId)?.description}
            </p>
            <WidgetInvocationEditor
              key={`${action.id}-${action.widgetId}`}
              value={action}
              widget={widgets.find((widget) => widget.id === action.widgetId)}
              fields={fields}
              onChange={({ props, events }) => change(action.id, { props, events })}
            />
            <BoundPropsEditor
              title="Подпись и доступность действия"
              pathPrefix="presentation"
              descriptors={getActionPresentationDescriptors()}
              configured={action.presentation}
              legacy={{ label: action.label, variant: 'ghost' }}
              fields={fields}
              onChange={(presentation) => change(action.id, { presentation })}
            />
          </div>
        </FieldErrorScope>
      ))}
      {actions.length > 0 && (
        <Button
          size="sm"
          disabled={actions.length >= 12 || !widgets.length}
          onClick={() => onChange([...actions, create()])}
        >
          <Plus size={14} />
          Добавить действие
        </Button>
      )}
      <p className="builder-property-copy">
        {placement === 'header'
          ? 'Меню открывается по кнопке с тремя точками рядом с заголовком.'
          : 'Кнопка «Действия» закреплена внизу; список открывается вверх.'}{' '}
        Каждый пункт передаёт виджету контекст текущего объекта.
      </p>
    </div>
  );
}
