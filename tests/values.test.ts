import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../shared/catalog';
import type { SplitTemplate, WidgetContext } from '../shared/model';
import { seedTemplates } from '../shared/seeds';
import { validateTemplate } from '../shared/validation';
import { isJsonValue, isSafeBinding, readPath, resolveValue, resolveWidgetInput } from '../shared/values';
import { resolveSplit } from '../server/resolve';

const errors = (value: unknown) => validateTemplate(value).filter((issue) => issue.severity === 'error');
const context: WidgetContext = {
  entityId: 'custom-001',
  entityType: 'claim',
  instanceId: 'instance',
  locale: 'ru-RU',
};

function arbitraryDefinition(): SplitTemplate {
  const template = structuredClone(seedTemplates[0].draft);
  template.entityType = 'claim';
  template.header.titleSource = { kind: 'binding', path: 'response.application.subject' };
  template.header.subtitleSource = { kind: 'literal', value: 'Любой текст аналитика' };
  template.header.statusSource = { kind: 'binding', path: 'response.current.state' };
  template.tabs = [
    {
      id: 'custom-tab',
      title: 'Сведения',
      nodes: [
        {
          id: 'custom-fields',
          type: 'fields',
          title: 'Данные заявки',
          columns: 2,
          fields: [
            {
              id: 'custom-zero',
              label: 'Ноль',
              binding: '',
              source: { kind: 'literal', value: 0 },
              format: 'number',
            },
            {
              id: 'custom-flag',
              label: 'Логическое',
              binding: '',
              source: { kind: 'literal', value: false },
              format: 'text',
            },
            {
              id: 'custom-person',
              label: 'Заявитель',
              binding: 'response.application.people.0.name',
              format: 'person',
            },
          ],
        },
        {
          id: 'custom-text',
          type: 'text',
          title: 'Примечание',
          binding: '',
          source: { kind: 'literal', value: 'Свободное описание' },
          collapsible: false,
        },
        {
          id: 'custom-table',
          type: 'table',
          title: 'Документы',
          binding: 'response.documents',
          searchable: true,
          pageSize: 10,
          columns: [{ id: 'custom-column', label: 'Документ', binding: 'details.caption', format: 'text' }],
        },
      ],
    },
  ];
  return template;
}

test('arbitrary API paths, entity types, literals and row paths do not depend on the sample catalog', () => {
  const template = arbitraryDefinition();
  assert.deepEqual(errors(template), []);
  const data = {
    response: {
      application: { subject: 'Новая заявка', people: [{ name: 'Мария' }] },
      current: { state: 'На согласовании' },
      documents: [{ details: { caption: 'Договор' } }],
    },
  };
  const document = resolveSplit(template, 'custom-001', 'draft', 'normal', undefined, {
    data,
    entityVersion: '42',
  });
  assert.equal(document.entityVersion, '42');
  assert.deepEqual(document.data, data);
  assert.equal(resolveValue(data, template.header.titleSource), 'Новая заявка');
  assert.equal(readPath(data, 'response.application.people.0.name'), 'Мария');
  const table = template.tabs[0].nodes[2];
  assert.ok(table.type === 'table');
  const rows = resolveValue(data, table.source, table.binding) as unknown[];
  assert.equal(resolveValue(rows[0], table.columns[0].source, table.columns[0].binding), 'Договор');
  assert.notEqual(document.data, data);
});

test('literal values preserve null, false, zero, empty text, arrays and objects', () => {
  for (const value of [null, false, 0, '', ['a', 2], { href: '/contract/7', label: 'Договор' }])
    assert.deepEqual(resolveValue({ old: 'ignored' }, { kind: 'literal', value }, 'old'), value);
  assert.equal(resolveValue({ old: 'legacy' }, undefined, 'old'), 'legacy');
});

test('paths never evaluate expressions, follow prototypes or accept empty segments', () => {
  const data = { rows: [{ amount: 0 }], custom: { 'сложное-имя': false } };
  assert.equal(readPath(data, 'rows.0.amount'), 0);
  assert.equal(readPath(data, 'custom.сложное-имя'), false);
  for (const path of [
    '__proto__.polluted',
    'rows.constructor',
    'rows.0.__proto__',
    'rows[0].amount',
    'rows..amount',
    'process.exit()',
    '',
    ' rows',
  ]) {
    assert.equal(isSafeBinding(path), false, path);
    assert.equal(readPath(data, path), undefined, path);
  }
  assert.equal(readPath({}, 'toString'), undefined);
});

test('widget parameters resolve arbitrary values, nested names and current context without mutating data', () => {
  const original = { response: { file: { id: 'doc-7', name: 'Акт' }, counter: 0 } };
  const input = resolveWidgetInput(
    {
      props: {
        file: { kind: 'binding', path: 'response.file' },
        flowId: { kind: 'binding', path: '$context.entityId' },
        'buttons.cancel.label': { kind: 'literal', value: 'Закрыть' },
        readonly: { kind: 'literal', value: false },
        counter: { kind: 'binding', path: 'response.counter' },
      },
      events: { 'buttons.cancel.handler': { type: 'close' } },
    },
    original,
    context,
  );
  assert.deepEqual(input.data, {
    file: original.response.file,
    flowId: context.entityId,
    buttons: { cancel: { label: 'Закрыть' } },
    readonly: false,
    counter: 0,
  });
  (input.data.file as { name: string }).name = 'Изменено виджетом';
  assert.equal(original.response.file.name, 'Акт');
  assert.deepEqual(input.events, { 'buttons.cancel.handler': { type: 'close' } });
});

test('literal and invocation validation rejects executable shapes, unsafe names and conflicting paths', () => {
  for (const source of [
    { kind: 'literal' },
    { kind: 'literal', value: () => null },
    { kind: 'javascript', value: 'alert(1)' },
    { kind: 'binding', path: 'a.constructor' },
  ]) {
    const template = arbitraryDefinition();
    template.header.titleSource = source as SplitTemplate['header']['titleSource'];
    assert.ok(errors(template).some((issue) => issue.path.startsWith('$.header.titleSource')));
  }
  const template = arbitraryDefinition();
  template.header.actions = [
    {
      id: 'custom-action',
      kind: 'openWidget',
      label: 'Открыть',
      widgetId: 'asset-editor',
      props: {
        'buttons.cancel': { kind: 'literal', value: {} },
        'buttons.cancel.label': { kind: 'literal', value: 'Закрыть' },
      },
      events: { onClose: { type: 'host', name: 'print' } },
    },
  ];
  assert.ok(errors(template).some((issue) => issue.path.endsWith('buttons.cancel.label')));
  template.header.actions[0].props = JSON.parse('{"__proto__.polluted":{"kind":"literal","value":true}}');
  assert.ok(errors(template).some((issue) => issue.path.includes('__proto__')));
  template.header.actions[0].props = {};
  template.header.actions[0].events = { onClose: { type: 'host', name: 'process.exit()' } };
  assert.ok(errors(template).some((issue) => issue.path.endsWith('.name')));
});

test('JSON validation accepts shared values but rejects cycles, functions, prototype keys and unbounded depth', () => {
  const shared = { value: 1 };
  assert.equal(isJsonValue({ a: shared, b: shared }), true);
  const cycle: { child?: unknown } = {};
  cycle.child = cycle;
  assert.equal(isJsonValue(cycle), false);
  assert.equal(isJsonValue(JSON.parse('{"constructor":{}}')), false);
  assert.equal(isJsonValue({ fn: () => true }), false);
  assert.equal(isJsonValue(new Date()), false);
  let deep: unknown = 'leaf';
  for (let i = 0; i < 30; i++) deep = { deep };
  assert.equal(isJsonValue(deep), false);
});

test('an injected catalog registers enterprise widgets while leaving data paths unrestricted', () => {
  const template = arbitraryDefinition();
  template.header.actions = [
    { id: 'private-action', kind: 'openWidget', label: 'История', widgetId: 'private-history' },
  ];
  assert.ok(errors(template).some((issue) => issue.path.endsWith('.widgetId')));
  const privateCatalog = {
    ...catalog,
    widgets: [
      {
        id: 'private-history',
        name: 'История',
        description: 'Доверенный микрофронт',
        mode: 'external' as const,
        version: '1',
        connectorName: '@Enterprise/custom/history',
      },
    ],
  };
  template.footer.actions = [];
  delete template.footer.widgetId;
  delete template.footer.actionLabel;
  assert.deepEqual(
    validateTemplate(template, { catalog: privateCatalog }).filter((issue) => issue.severity === 'error'),
    [],
  );
});
