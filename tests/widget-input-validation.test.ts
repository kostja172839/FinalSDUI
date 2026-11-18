import test from 'node:test';
import assert from 'node:assert/strict';
import type { Catalog, SplitTemplate, WidgetDescriptor, WidgetNode } from '../shared/model';
import { catalog } from '../shared/catalog';
import { seedTemplates } from '../shared/seeds';
import { validateTemplate } from '../shared/validation';
import { validateResolvedData } from '../shared/data-validation';
import { resolveWidgetInput } from '../shared/values';
import { validateWidgetInputs, validateWidgetInputSources } from '../shared/widget-input-validation';
import { resolveSplit } from '../server/resolve';

const context = { entityId: 'demo-flow', entityType: 'task', instanceId: 'preview', locale: 'ru-RU' };
const taskman = catalog.widgets.find((widget) => widget.id === 'taskman-history')!;
const node = (): WidgetNode => ({
  id: 'task-history',
  type: 'widget',
  title: 'История статусов',
  height: 240,
  widgetId: taskman.id,
});
function definition(widget = node()): SplitTemplate {
  const result = structuredClone(seedTemplates[0].draft);
  result.tabs = [{ id: 'widgets', title: 'Виджеты', nodes: [widget] }];
  return result;
}
const errors = (value: unknown, customCatalog: Catalog = catalog) =>
  validateTemplate(value, { catalog: customCatalog }).filter((issue) => issue.severity === 'error');

test('actual Taskman flowId is required before the template can be compiled', () => {
  const issue = errors(definition()).find((item) => item.path === '$.tabs[0].nodes[0].props.flowId');
  assert.ok(issue);
  assert.equal(issue.nodeId, 'task-history');
  assert.match(issue.message, /ID процесса/);
  assert.deepEqual(
    errors(definition({ ...node(), props: { flowId: { kind: 'literal', value: 'flow-17' } } })),
    [],
  );
});

test('known widget inputs use strict text/finite-number/boolean/JSON types without coercion', () => {
  const descriptor: WidgetDescriptor = {
    id: 'typed',
    name: 'Типы',
    description: '',
    mode: 'embedded',
    version: '1',
    inputs: [
      { name: 'name', label: 'Название', type: 'text', required: true },
      { name: 'count', label: 'Количество', type: 'number', required: true },
      { name: 'enabled', label: 'Доступен', type: 'boolean', required: true },
      { name: 'payload', label: 'Данные', type: 'json', required: true },
    ],
  };
  const valid = { name: 'Виджет', count: 0, enabled: false, payload: [] };
  assert.deepEqual(validateWidgetInputs(descriptor, valid), []);
  for (const [name, value] of [
    ['name', 7],
    ['name', ' '],
    ['count', '3'],
    ['count', Infinity],
    ['enabled', 'false'],
    ['enabled', 0],
    ['payload', () => undefined],
    ['payload', new Set()],
  ] as const) {
    const issues = validateWidgetInputs(descriptor, { ...valid, [name]: value });
    assert.equal(issues.length, 1, name);
    assert.equal(issues[0].name, name);
  }
  const before = structuredClone(valid);
  validateWidgetInputs(descriptor, valid);
  assert.deepEqual(valid, before);
});

test('descriptor defaults are authoring suggestions rather than implicit runtime values', () => {
  const descriptor: WidgetDescriptor = {
    ...taskman,
    inputs: [
      { name: 'flowId', label: 'ID процесса', type: 'text', required: true, defaultValue: 'suggested' },
      { name: 'optionalFlag', label: 'Флаг', type: 'boolean', defaultValue: true },
    ],
  };
  assert.deepEqual(
    validateWidgetInputSources(descriptor, {}).map((issue) => issue.name),
    ['flowId'],
  );
  assert.deepEqual(
    validateWidgetInputs(descriptor, {}).map((issue) => issue.name),
    ['flowId'],
  );
  assert.deepEqual(validateWidgetInputs(descriptor, { flowId: 'explicit' }), []);
  assert.deepEqual(validateWidgetInputs(undefined, {}), []);
});

test('nested descriptor inputs accept ancestor literals and defer ancestor bindings until resolution', () => {
  const descriptor: WidgetDescriptor = {
    ...taskman,
    inputs: [{ name: 'buttons.cancel.label', label: 'Подпись закрытия', type: 'text', required: true }],
  };
  assert.deepEqual(
    validateWidgetInputSources(descriptor, {
      buttons: { kind: 'literal', value: { cancel: { label: 'Закрыть' } } },
    }),
    [],
  );
  assert.deepEqual(
    validateWidgetInputSources(descriptor, {
      buttons: { kind: 'binding', path: 'response.buttons' },
    }),
    [],
  );
  assert.equal(
    validateWidgetInputs(descriptor, { buttons: { cancel: { label: false } } })[0].name,
    'buttons.cancel.label',
  );
  assert.equal(
    validateWidgetInputSources(descriptor, {
      buttons: { kind: 'literal', value: {} },
    })[0].name,
    'buttons.cancel.label',
  );
});

test('required bound input is checked against actual API data and trusted runtime context', () => {
  const widget = { ...node(), props: { flowId: { kind: 'binding' as const, path: 'response.flowId' } } };
  const template = definition(widget);
  assert.deepEqual(errors(template), []);
  const missing = validateResolvedData(template, { response: {} }, context).find(
    (issue) => issue.nodeId === widget.id,
  );
  assert.ok(missing);
  assert.equal(missing.path, '$.tabs[0].nodes[0].props.flowId');
  assert.equal(missing.dataPath, 'response.flowId');
  assert.match(
    validateResolvedData(template, { response: { flowId: false } }, context).find(
      (issue) => issue.nodeId === widget.id,
    )!.message,
    /текст/,
  );
  assert.equal(
    validateResolvedData(template, { response: { flowId: 'flow-17' } }, context).filter(
      (issue) => issue.nodeId === widget.id,
    ).length,
    0,
  );

  widget.props.flowId.path = '$context.entityId';
  assert.equal(
    validateResolvedData(template, {}, context).filter((issue) => issue.nodeId === widget.id).length,
    0,
  );
  assert.equal(validateResolvedData(template, {}).filter((issue) => issue.nodeId === widget.id).length, 0);
});

test('widget validation leaves nested callback declarations and arbitrary extra props unchanged', () => {
  const invocation = {
    props: {
      flowId: { kind: 'binding' as const, path: '$context.entityId' },
      customData: { kind: 'literal' as const, value: { arbitrary: ['value', 3, false] } },
    },
    events: { 'buttons.cancel.handler': { type: 'close' as const } },
  };
  const before = structuredClone(invocation);
  const input = resolveWidgetInput(invocation, {}, context);
  assert.deepEqual(validateWidgetInputSources(taskman, invocation.props), []);
  assert.deepEqual(validateWidgetInputs(taskman, input.data), []);
  assert.deepEqual(input.events, invocation.events);
  assert.deepEqual(invocation, before);
});

test('literal input diagnostics point to the actual prop editor and external invocations use the same contract', () => {
  const widget = {
    ...node(),
    props: {
      flowId: { kind: 'literal' as const, value: 3 },
      isStepper: { kind: 'literal' as const, value: 'true' },
    },
  };
  const issues = errors(definition(widget));
  assert.ok(issues.some((issue) => issue.path === '$.tabs[0].nodes[0].props.flowId'));
  assert.ok(issues.some((issue) => issue.path === '$.tabs[0].nodes[0].props.isStepper'));

  const external = { ...taskman, id: 'external-history', mode: 'external' as const };
  const customCatalog = { ...catalog, widgets: [...catalog.widgets, external] };
  const template = definition({ ...node(), props: { flowId: { kind: 'literal', value: 'flow' } } });
  template.header.actions = [
    {
      id: 'open-history',
      kind: 'openWidget',
      label: 'Открыть историю',
      widgetId: external.id,
    },
  ];
  assert.ok(
    errors(template, customCatalog).some(
      (issue) => issue.path === '$.header.actions[0].props.flowId' && issue.nodeId === '$header',
    ),
  );
});

test('enterprise descriptors drive resolved and server validation instead of the demo catalog', () => {
  const enterprise: WidgetDescriptor = {
    id: 'enterprise-widget',
    name: 'Рабочий виджет',
    description: '',
    mode: 'embedded',
    version: '1',
    inputs: [{ name: 'token', label: 'Идентификатор', type: 'text', required: true }],
  };
  const customCatalog = { ...catalog, widgets: [...catalog.widgets, enterprise] };
  const widget: WidgetNode = {
    ...node(),
    widgetId: enterprise.id,
    props: { token: { kind: 'binding', path: 'entity.token' } },
  };
  const template = definition(widget);
  const badData = { entity: { title: 'Карточка', token: false } };
  assert.deepEqual(errors(template, customCatalog), []);
  assert.ok(
    validateResolvedData(template, badData, context, customCatalog).some(
      (issue) => issue.nodeId === widget.id && issue.path.endsWith('.props.token'),
    ),
  );
  const resolved = resolveSplit(
    template,
    'demo-entity',
    'draft',
    'normal',
    { catalog: customCatalog },
    {
      data: badData,
    },
  );
  assert.ok(resolved.errors.some((error) => error.nodeId === widget.id && error.message.includes('текст')));
  const valid = resolveSplit(
    template,
    'demo-entity',
    'draft',
    'normal',
    { catalog: customCatalog },
    {
      data: { entity: { title: 'Карточка', token: 'token-17' } },
    },
  );
  assert.deepEqual(valid.errors, []);
});
