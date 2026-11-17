import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type {
  CatalogField,
  ValueSource,
  WidgetDescriptor,
  WidgetEventBinding,
  WidgetInvocation,
} from '../../shared/model';
import { Button, IconButton, Input, Select } from '../ui';
import { ValueSourceEditor } from './ValueSourceEditor';

const safeKey = (key: string) =>
  /^[A-Za-z_$][\w$]*(\.(?:[A-Za-z_$][\w$]*|\d+))*$/.test(key) &&
  !key.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part));

export function WidgetInvocationEditor({
  value,
  widget,
  fields = [],
  onChange,
}: {
  value: WidgetInvocation;
  widget?: WidgetDescriptor;
  fields?: CatalogField[];
  onChange: (value: WidgetInvocation) => void;
}) {
  const [parameter, setParameter] = useState('');
  const [eventName, setEventName] = useState('');
  const [error, setError] = useState('');
  const props = value.props ?? {};
  const events = value.events ?? {};
  const updateProp = (name: string, source: ValueSource) =>
    onChange({ ...value, props: { ...props, [name]: source } });
  const updateEvent = (name: string, event: WidgetEventBinding) =>
    onChange({ ...value, events: { ...events, [name]: event } });
  const addProp = (name: string) => {
    const key = name.trim();
    if (!safeKey(key) || Object.hasOwn(props, key)) {
      setError('Укажите уникальное имя параметра: латиница, цифры, точки, $ или _.');
      return;
    }
    const descriptor = widget?.inputs?.find((item) => item.name === key);
    const initial: ValueSource =
      descriptor?.defaultValue !== undefined
        ? { kind: 'literal', value: descriptor.defaultValue }
        : {
            kind: 'literal',
            value:
              descriptor?.type === 'boolean'
                ? false
                : descriptor?.type === 'number'
                  ? 0
                  : descriptor?.type === 'json'
                    ? {}
                    : '',
          };
    updateProp(key, initial);
    setParameter('');
    setError('');
  };
  const addEvent = (name: string) => {
    const key = name.trim();
    if (!safeKey(key) || Object.hasOwn(events, key)) {
      setError('Укажите уникальное имя обработчика, например onClose или buttons.cancel.handler.');
      return;
    }
    updateEvent(
      key,
      /close|opened/i.test(key)
        ? { type: 'close' }
        : /change/i.test(key)
          ? { type: 'refresh' }
          : { type: 'host', name: key },
    );
    setEventName('');
    setError('');
  };
  return (
    <div className="builder-widget-invocation">
      {widget?.connectorName && (
        <p className="builder-connector-name">
          Компонент в хосте <code>{widget.connectorName}</code>
        </p>
      )}
      <h4>Данные микрофронта</h4>
      <p className="builder-property-copy">
        Параметры передаются в data. Значения можно задать явно или взять из данных карточки. Контекст
        доступен как $context.entityId и $context.entityType.
      </p>
      {Object.entries(props).map(([name, source]) => (
        <div className="builder-invocation-row" key={name}>
          <div className="builder-invocation-heading">
            <strong>{widget?.inputs?.find((item) => item.name === name)?.label ?? name}</strong>
            <IconButton
              label={`Удалить параметр ${name}`}
              onClick={() => {
                const copy = { ...props };
                delete copy[name];
                onChange({ ...value, props: copy });
              }}
            >
              <X size={13} />
            </IconButton>
          </div>
          <code>{name}</code>
          {widget?.inputs?.find((item) => item.name === name)?.description && (
            <p className="builder-property-copy">
              {widget.inputs.find((item) => item.name === name)?.description}
            </p>
          )}
          <ValueSourceEditor
            label={name}
            path={`props.${name}`}
            source={source}
            fields={fields}
            onChange={(next) => updateProp(name, next)}
          />
        </div>
      ))}
      {widget?.inputs?.some((item) => !Object.hasOwn(props, item.name)) && (
        <Select
          label="Добавить известный параметр"
          value=""
          options={[
            { value: '', label: 'Параметры контракта' },
            ...(widget.inputs ?? [])
              .filter((item) => !Object.hasOwn(props, item.name))
              .map((item) => ({
                value: item.name,
                label: `${item.label}${item.required ? ' · обязательный' : ''}`,
              })),
          ]}
          onChange={(event) => {
            if (event.target.value) addProp(event.target.value);
          }}
        />
      )}
      <Input
        label="Имя нового параметра"
        value={parameter}
        placeholder="Например, flowId или buttons.cancel.label"
        onChange={(event) => setParameter(event.target.value)}
      />
      <Button size="sm" disabled={!parameter.trim()} onClick={() => addProp(parameter)}>
        <Plus size={13} />
        Добавить параметр
      </Button>
      <h4>События микрофронта</h4>
      <p className="builder-property-copy">
        Функции создаёт фронтовый адаптер. Выберите, что выполнить при событии; код в шаблоне не нужен.
      </p>
      {Object.entries(events).map(([name, event]) => (
        <div className="builder-invocation-row" key={name}>
          <div className="builder-invocation-heading">
            <strong>{name}</strong>
            <IconButton
              label={`Удалить событие ${name}`}
              onClick={() => {
                const copy = { ...events };
                delete copy[name];
                onChange({ ...value, events: copy });
              }}
            >
              <X size={13} />
            </IconButton>
          </div>
          <Select
            label={`Обработать: ${name}`}
            value={event.type}
            options={[
              { value: 'close', label: 'Закрыть виджет' },
              { value: 'refresh', label: 'Обновить данные карточки' },
              { value: 'host', label: 'Вызвать обработчик хоста' },
            ]}
            onChange={(e) =>
              updateEvent(
                name,
                e.target.value === 'host'
                  ? { type: 'host', name: '' }
                  : { type: e.target.value as 'close' | 'refresh' },
              )
            }
          />
          {event.type === 'host' && (
            <Input
              label={`Обработчик хоста: ${name}`}
              path={`events.${name}.name`}
              required
              error={
                !safeKey(event.name)
                  ? 'Укажите имя зарегистрированного обработчика без выражений и служебных свойств.'
                  : undefined
              }
              value={event.name}
              hint="Имя обработчика, зарегистрированного разработчиком в адаптере."
              onChange={(e) => updateEvent(name, { type: 'host', name: e.target.value })}
            />
          )}
        </div>
      ))}
      {widget?.events?.some((item) => !Object.hasOwn(events, item.name)) && (
        <Select
          label="Добавить известное событие"
          value=""
          options={[
            { value: '', label: 'События контракта' },
            ...(widget.events ?? [])
              .filter((item) => !Object.hasOwn(events, item.name))
              .map((item) => ({ value: item.name, label: item.label })),
          ]}
          onChange={(event) => {
            if (event.target.value) addEvent(event.target.value);
          }}
        />
      )}
      <Input
        label="Имя нового события"
        value={eventName}
        placeholder="Например, onClose или setOpened"
        onChange={(event) => setEventName(event.target.value)}
      />
      <Button size="sm" disabled={!eventName.trim()} onClick={() => addEvent(eventName)}>
        <Plus size={13} />
        Добавить событие
      </Button>
      {error && (
        <p className="builder-editor-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
