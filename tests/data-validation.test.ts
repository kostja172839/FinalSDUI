import test from 'node:test';
import assert from 'node:assert/strict';
import type { FieldDefinition, FieldsNode, SplitTemplate } from '../shared/model';
import { canonicalizeDefinition, readPath } from '../shared/values';
import { validateFieldValue, validateResolvedData } from '../shared/data-validation';
import { validateTemplate } from '../shared/validation';
import { contractExampleData, contractExampleDefinition, seedTemplates } from '../shared/seeds';

const errors = (value: unknown) => validateTemplate(value).filter((issue) => issue.severity === 'error');
function fieldsDefinition(fields: FieldDefinition[]): SplitTemplate {
  const definition = structuredClone(seedTemplates[0].draft);
  definition.tabs = [
    {
      id: 'tab',
      title: 'Сведения',
      nodes: [{ id: 'facts', title: 'Поля', type: 'fields', columns: 2, fields }],
    },
  ];
  return definition;
}
const field = (
  format: FieldDefinition['format'],
  validation?: FieldDefinition['validation'],
): FieldDefinition => ({ id: 'value', label: 'Значение', binding: 'entity.value', format, validation });

test('neutral entity and collection namespaces retain legacy reads without overwriting explicit roots', () => {
  const canonical = { entity: { title: 'Договор' }, collections: { events: [{ id: 'event' }] } };
  assert.equal(readPath(canonical, 'asset.title'), 'Договор');
  assert.equal(readPath(canonical, 'events.0.id'), 'event');
  const legacy = { asset: { title: 'Старый объект' }, events: [{ id: 'legacy-event' }] };
  assert.equal(readPath(legacy, 'entity.title'), 'Старый объект');
  assert.equal(readPath(legacy, 'collections.events.0.id'), 'legacy-event');
  assert.equal(
    readPath({ ...canonical, asset: { title: 'Явный старый ключ' } }, 'asset.title'),
    'Явный старый ключ',
  );
  assert.equal(readPath({ ...canonical, asset: null }, 'asset.title'), undefined);
  assert.equal(readPath({ ...legacy, entity: null }, 'entity.title'), undefined);
  assert.equal(readPath({ ...canonical, events: [] }, 'events.0.id'), undefined);
});

test('canonical authoring projection changes known root bindings only and never a saved snapshot', () => {
  const definition = fieldsDefinition([field('text')]);
  definition.header.titleBinding = 'asset.title';
  (definition.tabs[0].nodes[0] as FieldsNode).fields[0].binding = 'asset.value';
  definition.header.subtitleSource = { kind: 'literal', value: 'asset.title remains text' };
  definition.tabs[0].nodes.push({
    id: 'rows',
    type: 'table',
    title: 'Строки',
    binding: 'events',
    searchable: false,
    pageSize: 5,
    columns: [{ id: 'nested', label: 'Вложенное', binding: 'asset.name', format: 'text' }],
  });
  const before = structuredClone(definition);
  const projected = canonicalizeDefinition(definition);
  assert.equal(projected.header.titleBinding, 'entity.title');
  assert.equal((projected.tabs[0].nodes[0] as FieldsNode).fields[0].binding, 'entity.value');
  const table = projected.tabs[0].nodes[1];
  assert.ok(table.type === 'table');
  assert.equal(table.binding, 'collections.events');
  assert.equal(table.columns[0].binding, 'asset.name');
  assert.deepEqual(projected.header.subtitleSource, before.header.subtitleSource);
  assert.deepEqual(definition, before);
  assert.deepEqual(canonicalizeDefinition(projected), projected);
});

test('all rich components and header fields have valid generic definitions and resolved sample data', () => {
  assert.deepEqual(errors(contractExampleDefinition), []);
  assert.deepEqual(validateResolvedData(contractExampleDefinition, contractExampleData), []);
  const nodeTypes = contractExampleDefinition.tabs.flatMap((tab) => tab.nodes.map((node) => node.type));
  for (const type of ['callout', 'metrics', 'recordList', 'documents'])
    assert.ok(nodeTypes.includes(type as never));
});

test('field rule declarations reject malformed bounds and literal values before publication', () => {
  const invalid = field('number', { min: 10, max: 2 });
  invalid.source = { kind: 'literal', value: 'not a number' };
  assert.ok(errors(fieldsDefinition([invalid])).some((issue) => issue.path.endsWith('.validation.max')));
  assert.ok(errors(fieldsDefinition([invalid])).some((issue) => issue.path.endsWith('.source.value')));
  invalid.validation = {
    required: 'yes',
    minLength: -1,
    maxLength: 1.5,
    min: Infinity,
  } as unknown as FieldDefinition['validation'];
  for (const key of ['required', 'minLength', 'maxLength', 'min'])
    assert.ok(
      errors(fieldsDefinition([invalid])).some((issue) => issue.path.endsWith(`.validation.${key}`)),
      key,
    );
  invalid.validation = { minLength: 20, maxLength: 2 };
  assert.ok(
    errors(fieldsDefinition([invalid])).some((issue) => issue.path.endsWith('.validation.maxLength')),
  );
});

test('value validators distinguish valid zero/false, real calendar dates, numeric bounds and safe links', () => {
  assert.deepEqual(validateFieldValue(field('number', { required: true, min: 0, max: 100 }), 0), []);
  assert.deepEqual(validateFieldValue(field('text', { required: true }), false), []);
  assert.ok(validateFieldValue(field('number'), false).length);
  assert.ok(validateFieldValue(field('number', { min: 0 }), -1).length);
  assert.ok(validateFieldValue(field('money', { max: 50 }), 51).length);
  assert.ok(validateFieldValue(field('text', { required: true }), '   ').length);
  assert.deepEqual(validateFieldValue(field('date'), '2024-02-29'), []);
  assert.ok(validateFieldValue(field('date'), '2025-02-29').length);
  assert.ok(validateFieldValue(field('date'), '2026-13-01').length);
  assert.ok(validateFieldValue(field('date'), '10/02/2026').length);
  assert.ok(validateFieldValue(field('link'), 'javascript:alert(1)').length);
  assert.ok(validateFieldValue(field('link'), '//outside.example/file').length);
  assert.deepEqual(validateFieldValue(field('link'), { label: 'Документ', href: '/documents/1' }), []);
  assert.equal(validateFieldValue(field('text', { minLength: 3 }), 'ab').length, 1);
  assert.equal(validateFieldValue(field('text', { maxLength: 1 }), '😀').length, 0);
});

test('resolved issues identify exact field and row and preserve canonical data paths for JSON navigation', () => {
  const definition = fieldsDefinition([field('money', { required: true, min: 0 })]);
  definition.tabs[0].nodes.push({
    id: 'rows',
    type: 'table',
    title: 'Таблица',
    binding: 'collections.rows',
    searchable: false,
    pageSize: 5,
    columns: [
      {
        id: 'row-amount',
        label: 'Сумма',
        binding: 'amount',
        format: 'number',
        validation: { required: true },
      },
    ],
  });
  const issues = validateResolvedData(definition, {
    entity: { title: 'Карточка', value: -2 },
    collections: { rows: [{ amount: 0 }, { amount: 'bad' }] },
  });
  assert.ok(
    issues.some(
      (issue) => issue.nodeId === 'facts' && issue.fieldId === 'value' && issue.dataPath === 'entity.value',
    ),
  );
  const rowIssue = issues.find((issue) => issue.nodeId === 'rows');
  assert.equal(rowIssue?.itemIndex, 1);
  assert.equal(rowIssue?.fieldId, 'row-amount');
  assert.equal(rowIssue?.path, '$.tabs[0].nodes[1].rows[1].columns[0]');
  assert.equal(rowIssue?.dataPath, 'collections.rows.1.amount');
  const legacy = fieldsDefinition([{ ...field('number'), binding: 'asset.value' }]);
  assert.equal(
    validateResolvedData(legacy, { entity: { title: 'Заголовок', value: 'bad' } })[0].dataPath,
    'entity.value',
  );
});

test('hidden nodes and absent optional fields do not generate data validation errors', () => {
  const definition = fieldsDefinition([field('number')]);
  const node = definition.tabs[0].nodes[0];
  node.visibleWhen = { binding: 'entity.visible', operator: 'equals', value: 'true' };
  assert.deepEqual(
    validateResolvedData(definition, { entity: { title: 'Заголовок', visible: false, value: 'bad' } }),
    [],
  );
  delete node.visibleWhen;
  assert.deepEqual(validateResolvedData(definition, { entity: { title: 'Заголовок' } }), []);
});

test('rich list schemas reject unsafe links and malformed arrays without failing valid unrelated blocks', () => {
  const definition = structuredClone(contractExampleDefinition);
  const list = definition.tabs[3].nodes[0];
  assert.ok(list.type === 'documents');
  list.itemHref = { kind: 'literal', value: 'javascript:alert(1)' };
  assert.ok(errors(definition).some((issue) => issue.path.endsWith('.itemHref.value')));
  list.source = { kind: 'literal', value: [null] };
  assert.ok(errors(definition).some((issue) => issue.path.endsWith('.source.value[0]')));
  const data = structuredClone(contractExampleData);
  (data.collections as Record<string, unknown>).counterparties = [null, { name: '', taxId: '123' }];
  const issues = validateResolvedData(contractExampleDefinition, data);
  assert.ok(issues.some((issue) => issue.nodeId === 'counterparty-list' && issue.itemIndex === 0));
  assert.ok(
    issues.some(
      (issue) =>
        issue.nodeId === 'counterparty-list' && issue.itemIndex === 1 && issue.path.endsWith('.itemTitle'),
    ),
  );
  assert.ok(issues.every((issue) => issue.nodeId === 'counterparty-list'));
});
