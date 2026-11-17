import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type {
  ButtonAction,
  CatalogField,
  FooterButton,
  HostActionDescriptor,
  ValueSource,
  WidgetDescriptor,
} from '../../shared/model';
import { Button, FieldErrorScope, IconButton, Input, Select, useFieldError } from '../ui';
import { createId } from './operations';
import { ValueSourceEditor } from './ValueSourceEditor';
import { WidgetInvocationEditor } from './WidgetInvocationEditor';

function HostParametersEditor({
  params = {},
  action,
  fields,
  onChange,
}: {
  params?: Record<string, ValueSource>;
  action?: HostActionDescriptor;
  fields: CatalogField[];
  onChange: (params: Record<string, ValueSource>) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const paramsError = useFieldError('params');
  const hasMissingParameter = action?.inputs?.some(
    (input) => input.required && !Object.hasOwn(params, input.name),
  );
  const add = (name: string) => {
    const key = name.trim();
    if (
      !/^[A-Za-z_$][\w$]*(\.(?:[A-Za-z_$][\w$]*|\d+))*$/.test(key) ||
      key.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part)) ||
      Object.hasOwn(params, key)
    ) {
      setError('Укажите уникальное имя параметра: латиница, цифры, точки, $ или _.');
      return;
    }
    const input = action?.inputs?.find((item) => item.name === key);
    const source: ValueSource = {
      kind: 'literal',
      value:
        input?.defaultValue !== undefined
          ? input.defaultValue
          : input?.type === 'boolean'
            ? false
            : input?.type === 'number'
              ? 0
              : input?.type === 'json'
                ? {}
                : '',
    };
    onChange({ ...params, [key]: source });
    setName('');
    setError('');
  };
  return (
    <div className="builder-widget-invocation">
      <h4>Параметры действия</h4>
      {paramsError && (hasMissingParameter || Object.keys(params).length === 0) && (
        <p className="builder-editor-error" role="alert">
          {paramsError}
        </p>
      )}
      <p className="builder-property-copy">
        Передайте свои значения или данные карточки. Идентификатор объекта доступен как $context.entityId.
      </p>
      {Object.entries(params).map(([key, source]) => (
        <div className="builder-invocation-row" key={key}>
          <div className="builder-invocation-heading">
            <strong>{action?.inputs?.find((item) => item.name === key)?.label ?? key}</strong>
            <IconButton
              label={`Удалить параметр действия ${key}`}
              onClick={() => {
                const next = { ...params };
                delete next[key];
                onChange(next);
              }}
            >
              <X size={13} />
            </IconButton>
          </div>
          {action?.inputs?.find((item) => item.name === key)?.description && (
            <p className="builder-property-copy">
              {action.inputs.find((item) => item.name === key)?.description}
            </p>
          )}
          <ValueSourceEditor
            label={key}
            path={`params.${key}`}
            source={source}
            fields={fields}
            onChange={(next) => onChange({ ...params, [key]: next })}
          />
        </div>
      ))}
      {action?.inputs?.some((item) => !Object.hasOwn(params, item.name)) && (
        <Select
          label="Добавить параметр действия из контракта"
          value=""
          options={[
            { value: '', label: 'Параметры контракта' },
            ...(action.inputs ?? [])
              .filter((item) => !Object.hasOwn(params, item.name))
              .map((item) => ({
                value: item.name,
                label: `${item.label}${item.required ? ' · обязательный' : ''}`,
              })),
          ]}
          onChange={(event) => {
            if (event.target.value) add(event.target.value);
          }}
        />
      )}
      <Input
        label="Имя нового параметра действия"
        value={name}
        placeholder="Например, requestId"
        onChange={(event) => setName(event.target.value)}
      />
      <Button size="sm" disabled={!name.trim()} onClick={() => add(name)}>
        <Plus size={13} />
        Добавить параметр действия
      </Button>
      {error && (
        <p className="builder-editor-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FooterButtonsEditor({
  buttons,
  widgets,
  actions = [],
  fields = [],
  onChange,
}: {
  buttons: FooterButton[];
  widgets: WidgetDescriptor[];
  actions?: HostActionDescriptor[];
  fields?: CatalogField[];
  onChange: (buttons: FooterButton[]) => void;
}) {
  const change = (id: string, update: Partial<FooterButton>) =>
    onChange(buttons.map((button) => (button.id === id ? { ...button, ...update } : button)));
  const hostParams = (actionId: string): Record<string, ValueSource> =>
    Object.fromEntries(
      (actions.find((action) => action.id === actionId)?.inputs ?? [])
        .filter((input) => input.required || input.defaultValue !== undefined)
        .map((input) => [
          input.name,
          {
            kind: 'literal',
            value:
              input.defaultValue !== undefined
                ? input.defaultValue
                : input.type === 'boolean'
                  ? false
                  : input.type === 'number'
                    ? 0
                    : input.type === 'json'
                      ? {}
                      : '',
          },
        ]),
    );
  const move = (index: number, delta: number) => {
    const next = [...buttons];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const newAction = (kind: ButtonAction['kind']): ButtonAction =>
    kind === 'openWidget'
      ? { kind, widgetId: widgets[0]?.id ?? '' }
      : kind === 'host'
        ? { kind, actionId: actions[0]?.id ?? '', params: hostParams(actions[0]?.id ?? '') }
        : { kind };
  return (
    <div className="builder-actions-editor">
      <p className="builder-property-copy">
        Отдельные кнопки всегда видны внизу карточки. Например, «Согласовать» или «Закрыть». Меню «Действия»
        настраивается отдельно ниже.
      </p>
      {buttons.map((button, index) => (
        <FieldErrorScope path={`buttons[${index}]`} key={button.id}>
          <div className="builder-action-settings">
            <div className="builder-action-heading">
              <strong>Кнопка {index + 1}</strong>
              <div>
                <IconButton
                  label={`Поднять кнопку «${button.label}»`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={13} />
                </IconButton>
                <IconButton
                  label={`Опустить кнопку «${button.label}»`}
                  disabled={index === buttons.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={13} />
                </IconButton>
                <IconButton
                  label={`Удалить кнопку «${button.label}»`}
                  onClick={() => onChange(buttons.filter((item) => item.id !== button.id))}
                >
                  <X size={13} />
                </IconButton>
              </div>
            </div>
            <Input
              label="Название кнопки"
              path="label"
              required
              maxLength={120}
              value={button.label}
              onChange={(event) => change(button.id, { label: event.target.value })}
            />
            <Select
              label="Стиль кнопки"
              path="variant"
              value={button.variant ?? 'secondary'}
              options={[
                { value: 'primary', label: 'Акцентная' },
                { value: 'secondary', label: 'Обычная' },
                { value: 'ghost', label: 'Без фона' },
                { value: 'danger', label: 'Опасное действие' },
              ]}
              onChange={(event) =>
                change(button.id, { variant: event.target.value as FooterButton['variant'] })
              }
            />
            <FieldErrorScope path="action">
              <Select
                label="Действие кнопки"
                path="kind"
                value={button.action.kind}
                options={[
                  { value: 'refresh', label: 'Обновить данные карточки' },
                  { value: 'close', label: 'Закрыть карточку' },
                  { value: 'openWidget', label: 'Открыть микрофронт' },
                  { value: 'host', label: 'Выполнить действие приложения' },
                ]}
                onChange={(event) =>
                  change(button.id, { action: newAction(event.target.value as ButtonAction['kind']) })
                }
              />
              {button.action.kind === 'openWidget' && (
                <>
                  <Select
                    label="Микрофронт кнопки"
                    path="widgetId"
                    value={button.action.widgetId}
                    options={[
                      { value: '', label: 'Выберите внешний виджет' },
                      ...widgets.map((widget) => ({ value: widget.id, label: widget.name })),
                    ]}
                    onChange={(event) =>
                      change(button.id, { action: { kind: 'openWidget', widgetId: event.target.value } })
                    }
                  />
                  <WidgetInvocationEditor
                    key={`${button.id}-${button.action.widgetId}`}
                    value={button.action}
                    widget={widgets.find(
                      (widget) => widget.id === (button.action as { widgetId: string }).widgetId,
                    )}
                    fields={fields}
                    onChange={({ props, events }) => {
                      if (button.action.kind === 'openWidget')
                        change(button.id, { action: { ...button.action, props, events } });
                    }}
                  />
                </>
              )}
              {button.action.kind === 'host' && (
                <>
                  <Select
                    label="Действие приложения"
                    path="actionId"
                    value={button.action.actionId}
                    options={[
                      { value: '', label: 'Выберите действие' },
                      ...actions.map((action) => ({ value: action.id, label: action.name })),
                    ]}
                    onChange={(event) =>
                      change(button.id, {
                        action: {
                          kind: 'host',
                          actionId: event.target.value,
                          params: hostParams(event.target.value),
                        },
                      })
                    }
                  />
                  {!actions.length && (
                    <p className="builder-property-copy">
                      В каталоге пока нет действий хоста. Разработчик подключает их через реестр приложения.
                    </p>
                  )}
                  <p className="builder-field-description">
                    {
                      actions.find((action) => action.id === (button.action as { actionId: string }).actionId)
                        ?.description
                    }
                  </p>
                  <HostParametersEditor
                    key={`${button.id}-${button.action.actionId}`}
                    params={button.action.params}
                    action={actions.find(
                      (action) => action.id === (button.action as { actionId: string }).actionId,
                    )}
                    fields={fields}
                    onChange={(params) => {
                      if (button.action.kind === 'host')
                        change(button.id, { action: { ...button.action, params } });
                    }}
                  />
                </>
              )}
            </FieldErrorScope>
          </div>
        </FieldErrorScope>
      ))}
      <Button
        size="sm"
        disabled={buttons.length >= 6}
        onClick={() =>
          onChange([
            ...buttons,
            {
              id: createId('footer-button'),
              label: 'Обновить',
              variant: 'secondary',
              action: { kind: 'refresh' },
            },
          ])
        }
      >
        <Plus size={14} />
        Добавить кнопку
      </Button>
      {buttons.length >= 6 && (
        <p className="builder-property-copy">
          Можно добавить до шести отдельных кнопок. Остальные действия разместите в меню.
        </p>
      )}
    </div>
  );
}
