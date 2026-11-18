import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Catalog, CatalogField, ContentNode, JsonValue, ValueSource } from '../../shared/model';
import { getComponentPropDescriptors, type ComponentPropDescriptor } from '../../shared/component-props';
import { isJsonValue } from '../../shared/values';
import { Button, IconButton, Select } from '../ui';
import { ValueSourceEditor } from './ValueSourceEditor';

export function ComponentPropsEditor({
  node,
  catalog,
  onChange,
}: {
  node: ContentNode;
  catalog: Catalog;
  onChange: (props: Record<string, ValueSource> | undefined) => void;
}) {
  return (
    <BoundPropsEditor
      descriptors={getComponentPropDescriptors(node.type)}
      configured={node.props}
      legacy={node as unknown as Record<string, unknown>}
      fields={catalog.fields}
      onChange={onChange}
    />
  );
}

export function BoundPropsEditor({
  descriptors,
  configured = {},
  legacy = {},
  fields,
  onChange,
  title = 'Параметры компонента',
  pathPrefix = 'props',
}: {
  descriptors: ComponentPropDescriptor[];
  configured?: Record<string, ValueSource>;
  legacy?: Record<string, unknown>;
  fields: CatalogField[];
  onChange: (props: Record<string, ValueSource> | undefined) => void;
  title?: string;
  pathPrefix?: string;
}) {
  const [adding, setAdding] = useState('');
  if (!descriptors.length) return null;
  const available = descriptors.filter((descriptor) => !Object.hasOwn(configured, descriptor.name));
  const descriptor = available.find((item) => item.name === adding);
  const initialValue = (): JsonValue => {
    if (!descriptor) return '';
    const current = legacy[descriptor.name];
    if (current !== undefined && isJsonValue(current)) return current as JsonValue;
    return (
      descriptor.defaultValue ??
      descriptor.values?.[0] ??
      (descriptor.type === 'boolean'
        ? true
        : descriptor.type === 'number'
          ? (descriptor.min ?? 0)
          : descriptor.type === 'json'
            ? {}
            : '')
    );
  };
  return (
    <section className="builder-setting-group">
      <h3>{title}</h3>
      <div className="builder-setting-stack">
        <p className="builder-property-copy">
          Каждый параметр можно задать значением или связать с любым полем API. Здесь заданные значения имеют
          приоритет над основными настройками блока.
        </p>
        {Object.entries(configured).map(([name, source]) => {
          const meta = descriptors.find((item) => item.name === name);
          return (
            <div className="builder-setting-stack" key={name}>
              <div className="builder-inline-row">
                <strong>{meta?.label ?? name}</strong>
                <IconButton
                  label={`Удалить параметр «${meta?.label ?? name}»`}
                  onClick={() => {
                    const next = { ...configured };
                    delete next[name];
                    onChange(Object.keys(next).length ? next : undefined);
                  }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
              <ValueSourceEditor
                label={meta?.label ?? name}
                path={`${pathPrefix}.${name}`}
                source={source}
                fields={fields}
                hint={
                  meta?.description ??
                  (meta?.values ? `Допустимые значения: ${meta.values.join(', ')}.` : undefined)
                }
                onChange={(value) => onChange({ ...configured, [name]: value })}
              />
            </div>
          );
        })}
        {available.length > 0 && (
          <>
            <Select
              label="Добавить параметр компонента"
              value={descriptor ? adding : ''}
              options={[
                { value: '', label: 'Выберите настройку' },
                ...available.map((item) => ({ value: item.name, label: item.label })),
              ]}
              onChange={(event) => setAdding(event.target.value)}
            />
            <Button
              size="sm"
              disabled={!descriptor}
              onClick={() => {
                if (!descriptor) return;
                onChange({ ...configured, [descriptor.name]: { kind: 'literal', value: initialValue() } });
                setAdding('');
              }}
            >
              <Plus size={14} />
              Добавить настройку
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
