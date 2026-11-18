import test from 'node:test';
import assert from 'node:assert/strict';
import type { ContentNode, FieldDefinition, SectionNode, SplitTemplate } from '../shared/model';
import {
  insertContentNode,
  locateField,
  locateNode,
  moveContentNode,
  moveFieldDefinition,
  fieldDropContainers,
  nodeContainers,
} from '../src/builder/operations';
import { editorSelection, fieldSelectionClass } from '../src/runtime/editorSelection';
import { dragPreviewSize, measureDragPreview, nextKeyboardDropZone } from '../src/builder/dragAndDrop';

const text = (id: string): ContentNode => ({
  id,
  type: 'text',
  title: id,
  binding: '',
  source: { kind: 'literal', value: id },
  collapsible: false,
});
const field = (id: string): FieldDefinition => ({ id, label: id, binding: 'value', format: 'text' });
const section = (id: string, children: ContentNode[] = []): SectionNode => ({
  id,
  type: 'section',
  title: id,
  collapsible: true,
  defaultOpen: true,
  children,
});
function definition(
  nodes: ContentNode[] = [text('a'), section('group', [text('b')]), text('c')],
): SplitTemplate {
  return {
    schemaVersion: 1,
    id: 'split',
    name: 'Test',
    entityType: 'request',
    header: {
      titleBinding: 'entity.title',
      subtitleBinding: 'entity.subtitle',
      statusBinding: 'entity.status',
      showStatus: false,
      fields: [field('header-field')],
    },
    shell: { minWidth: 600, defaultWidth: 840, maxWidthPercent: 70 },
    tabs: [
      { id: 'main', title: 'Main', nodes },
      { id: 'other', title: 'Other', nodes: [] },
    ],
    footer: { show: true, text: '' },
  };
}

test('dragging reorders siblings using pre-removal indexes and keeps IDs/data immutable for undo', () => {
  const source = definition();
  const before = structuredClone(source);
  const result = moveContentNode(source, 'a', { containerId: 'main', index: 3 });
  assert.equal(result.error, undefined);
  assert.deepEqual(
    result.definition.tabs[0].nodes.map((node) => node.id),
    ['group', 'c', 'a'],
  );
  assert.equal(result.selectedId, 'a');
  assert.deepEqual(source, before);
  assert.deepEqual(locateNode(result.definition, 'a')?.node, text('a'));
  const noOp = moveContentNode(source, 'a', { containerId: 'main', index: 1 });
  assert.equal(noOp.definition, source);
});

test('nodes move into and out of sections and across tabs without regenerating field IDs', () => {
  const source = definition([
    { id: 'fields', type: 'fields', title: 'Fields', columns: 1, fields: [field('stable-field')] },
    section('group'),
  ]);
  const inside = moveContentNode(source, 'fields', { containerId: 'group', index: 0 });
  assert.equal(locateField(inside.definition, 'stable-field')?.ownerId, 'fields');
  assert.equal(locateNode(inside.definition, 'fields')?.path, '$.tabs[0].nodes[0].children[0]');
  const outside = moveContentNode(inside.definition, 'fields', { containerId: 'other', index: 0 });
  assert.equal(locateNode(outside.definition, 'fields')?.tab.id, 'other');
  assert.equal(locateField(outside.definition, 'stable-field')?.field.id, 'stable-field');
  assert.equal((locateNode(outside.definition, 'group')?.node as SectionNode).children.length, 0);
});

test('moving a section into itself or descendants is rejected and invalid targets are harmless', () => {
  const source = definition([section('outer', [section('inner', [text('leaf')])])]);
  for (const target of ['outer', 'inner']) {
    const result = moveContentNode(source, 'outer', { containerId: target, index: 0 });
    assert.equal(result.definition, source);
    assert.match(result.error!, /самого себя/);
  }
  assert.equal(moveContentNode(source, 'outer', { containerId: 'missing', index: 0 }).definition, source);
  assert.equal(moveContentNode(source, 'outer', { containerId: 'main', index: -1 }).definition, source);
  assert.equal(moveContentNode(source, 'missing', { containerId: 'main', index: 0 }).definition, source);
  assert.deepEqual(
    nodeContainers(source, 'outer').map((item) => item.value),
    ['main', 'other'],
  );
});

test('palette insertion and moves enforce depth, sibling and total node limits', () => {
  let nested = section('level-8');
  for (let level = 7; level >= 1; level--) nested = section(`level-${level}`, [nested]);
  const deep = definition([nested, text('movable')]);
  assert.equal(moveContentNode(deep, 'movable', { containerId: 'level-8', index: 0 }).definition, deep);
  const siblings = definition(Array.from({ length: 100 }, (_, i) => text(`item-${i}`)));
  assert.equal(
    insertContentNode(siblings, text('overflow'), { containerId: 'main', index: 100 }).definition,
    siblings,
  );
  const full = definition(Array.from({ length: 100 }, (_, i) => text(`first-${i}`)));
  full.tabs[1].nodes = Array.from({ length: 100 }, (_, i) => text(`second-${i}`));
  full.tabs.push({ id: 'empty-tab', title: 'Empty', nodes: [] });
  assert.equal(
    insertContentNode(full, text('overflow'), { containerId: 'empty-tab', index: 0 }).definition,
    full,
  );
  const inserted = insertContentNode(definition([]), text('new'), { containerId: 'other', index: 0 });
  assert.equal(inserted.selectedId, 'new');
  assert.equal(inserted.definition.tabs[1].nodes[0].id, 'new');
});

test('palette insertion rejects collisions with header fields and nested field IDs', () => {
  const source = definition();
  assert.equal(
    insertContentNode(source, text('header-field'), { containerId: 'main', index: 0 }).definition,
    source,
  );
  const duplicateFields: ContentNode = {
    id: 'new-fields',
    type: 'fields',
    title: 'Fields',
    columns: 1,
    fields: [field('same'), field('same')],
  };
  assert.equal(
    insertContentNode(source, duplicateFields, { containerId: 'main', index: 0 }).definition,
    source,
  );
});

test('field selection resolves header, groups, metrics, records and table columns with exact paths', () => {
  const source = definition([
    section('group', [
      { id: 'fields', type: 'fields', title: 'Fields', columns: 1, fields: [field('field')] },
      { id: 'metrics', type: 'metrics', title: 'Metrics', columns: 1, items: [field('metric')] },
      {
        id: 'records',
        type: 'recordList',
        title: 'Records',
        columns: 1,
        binding: 'rows',
        itemTitle: { kind: 'binding', path: 'name' },
        fields: [field('record-field')],
      },
      {
        id: 'table',
        type: 'table',
        title: 'Table',
        binding: 'rows',
        columns: [field('column')],
        searchable: false,
        pageSize: 10,
      },
    ]),
  ]);
  assert.equal(locateField(source, 'header-field')?.path, '$.header.fields[0]');
  assert.equal(locateField(source, 'field')?.path, '$.tabs[0].nodes[0].children[0].fields[0]');
  assert.equal(locateField(source, 'metric')?.collection, 'items');
  assert.equal(locateField(source, 'record-field')?.ownerId, 'records');
  assert.equal(locateField(source, 'column')?.collection, 'columns');
  assert.equal(locateField(source, 'column')?.tab?.id, 'main');
  assert.equal(locateField(source, 'missing'), undefined);
});

test('field capture selects exact IDs without navigating links; public runtime stays inert', () => {
  let selected = '';
  let stopped = false;
  let prevented = false;
  const props = editorSelection('field', 'Document', 'field', (id) => {
    selected = id;
  });
  props.onClickCapture!({
    target: { closest: (selector: string) => (selector === 'a[href]' ? {} : null) },
    stopPropagation: () => {
      stopped = true;
    },
    preventDefault: () => {
      prevented = true;
    },
  } as never);
  assert.equal(selected, 'field');
  assert.equal(stopped, true);
  assert.equal(prevented, true);
  assert.match(
    fieldSelectionClass('field', 'field', () => {}),
    /is-field-selected/,
  );
  const runtime = editorSelection('field', 'Document');
  assert.equal(runtime.onClickCapture, undefined);
  assert.equal(runtime.role, undefined);
  assert.equal(runtime.tabIndex, undefined);
  assert.equal(fieldSelectionClass('field', 'field'), '');
  selected = '';
  stopped = false;
  prevented = false;
  props.onClickCapture!({
    target: { closest: (selector: string) => (selector === '[data-editor-drag-handle]' ? {} : null) },
    stopPropagation: () => {
      stopped = true;
    },
    preventDefault: () => {
      prevented = true;
    },
  } as never);
  assert.equal(selected, '');
  assert.equal(stopped, false);
  assert.equal(prevented, false);
});

test('keyboard moves skip original no-op places, deduplicate surfaces, and advance on repeated arrows', () => {
  const zone = (id: string, index: number, top: number, surface = 'tree') => ({
    id,
    target: { containerId: 'main', index },
    surface,
    rect: { left: surface === 'tree' ? 80 : 500, top, width: 220, height: 36 },
  });
  const zones = [
    zone('first', 0, 100),
    zone('previous', 1, 170),
    zone('original', 2, 240),
    zone('after-original', 3, 310),
    zone('preview-original', 2, 10, 'preview'),
    zone('duplicate-previous', 1, 172),
    zone('after', 4, 380),
  ];
  const options = { source: { containerId: 'main', index: 2 }, surface: 'tree', origin: { x: 10, y: 10 } };
  const first = nextKeyboardDropZone(zones, { ...options, code: 'ArrowUp' });
  assert.equal(first?.id, 'previous');
  const second = nextKeyboardDropZone(zones, { ...options, code: 'ArrowUp', currentId: first?.id });
  assert.equal(second?.id, 'first');
  const reverse = nextKeyboardDropZone(zones, { ...options, code: 'ArrowDown', currentId: second?.id });
  assert.equal(reverse?.id, 'previous');
  assert.equal(
    nextKeyboardDropZone(zones, { ...options, code: 'ArrowDown', currentId: reverse?.id })?.id,
    'original',
  );
  assert.equal(nextKeyboardDropZone(zones, { ...options, code: 'ArrowDown' })?.id, 'after');
});

test('drag previews retain the measured frame size rather than the tiny activator dimensions', () => {
  assert.deepEqual(dragPreviewSize({ width: 562.67, height: 116.79 }, { width: 1280, height: 720 }), {
    width: 562.67,
    height: 116.79,
  });
  assert.deepEqual(dragPreviewSize({ width: 20, height: 28 }, { width: 1280, height: 720 }), {
    width: 120,
    height: 36,
  });
  assert.deepEqual(dragPreviewSize({ width: 2000, height: 1800 }, { width: 1280, height: 720 }), {
    width: 1248,
    height: 640,
  });
  const source = { getBoundingClientRect: () => ({ width: 562.67, height: 116.79 }) as DOMRect };
  assert.deepEqual(measureDragPreview(source, null, { width: 1280, height: 720 }), {
    width: 562.67,
    height: 116.79,
  });
  assert.deepEqual(measureDragPreview(source, { width: 20, height: 28 }, { width: 1280, height: 720 }), {
    width: 562.67,
    height: 116.79,
  });
  assert.equal(measureDragPreview(null, null, { width: 1280, height: 720 }), undefined);
});

test('small root fields reorder and move through header/root groups with stable IDs and immutable undo state', () => {
  const source = definition([
    {
      id: 'fields',
      type: 'fields',
      title: 'Fields',
      columns: 2,
      fields: [
        field('one'),
        { ...field('two'), validation: { required: true }, source: { kind: 'literal', value: 0 } },
      ],
    },
    {
      id: 'root-other',
      type: 'fields',
      title: 'Root B',
      columns: 1,
      fields: [field('root-existing')],
    },
  ]);
  const snapshot = structuredClone(source);
  const reordered = moveFieldDefinition(source, 'one', { kind: 'field', ownerId: 'fields', index: 2 });
  assert.deepEqual(
    locateField(reordered.definition, 'one')?.fields.map((field) => field.id),
    ['two', 'one'],
  );
  const header = moveFieldDefinition(reordered.definition, 'two', {
    kind: 'field',
    ownerId: '$header',
    index: 1,
  });
  assert.equal(header.error, undefined);
  assert.equal(locateField(header.definition, 'two')?.ownerId, '$header');
  const destination = moveFieldDefinition(header.definition, 'two', {
    kind: 'field',
    ownerId: 'root-other',
    index: 0,
  });
  assert.equal(destination.selectedId, 'two');
  assert.equal(locateField(destination.definition, 'two')?.ownerId, 'root-other');
  assert.deepEqual(locateField(destination.definition, 'two')?.field, locateField(source, 'two')?.field);
  assert.deepEqual(source, snapshot);
});

test('field transfer guards required groups, capacity and metric/table families', () => {
  const source = definition([
    { id: 'fields', type: 'fields', title: 'Fields', columns: 1, fields: [field('only')] },
    {
      id: 'metric-a',
      type: 'metrics',
      title: 'Metrics A',
      columns: 1,
      items: [{ ...field('metric-one'), suffix: 'с НДС' }, field('metric-two')],
    },
    { id: 'metric-b', type: 'metrics', title: 'Metrics B', columns: 1, items: [field('metric-three')] },
    {
      id: 'table',
      type: 'table',
      title: 'Table',
      binding: 'rows',
      columns: [field('column')],
      searchable: false,
      pageSize: 10,
    },
  ]);
  assert.match(
    moveFieldDefinition(source, 'only', { kind: 'field', ownerId: '$header', index: 0 }).error!,
    /хотя бы одно/,
  );
  assert.equal(
    moveFieldDefinition(source, 'metric-one', { kind: 'field', ownerId: '$header', index: 0 }).definition,
    source,
  );
  const metric = moveFieldDefinition(source, 'metric-one', { kind: 'field', ownerId: 'metric-b', index: 1 });
  assert.equal(metric.error, undefined);
  assert.equal(
    (locateField(metric.definition, 'metric-one')?.field as FieldDefinition & { suffix: string }).suffix,
    'с НДС',
  );
  assert.deepEqual(fieldDropContainers(source, 'column'), []);
  assert.equal(
    moveFieldDefinition(source, 'column', { kind: 'field', ownerId: '$header', index: 0 }).definition,
    source,
  );
  assert.deepEqual(
    fieldDropContainers(source, 'metric-one').map((owner) => owner.ownerId),
    ['metric-a', 'metric-b'],
  );
  const full = definition([
    { id: 'fields', type: 'fields', title: 'Fields', columns: 1, fields: [field('one'), field('two')] },
  ]);
  full.header.fields = Array.from({ length: 12 }, (_, index) => field(`header-${index}`));
  assert.match(
    moveFieldDefinition(full, 'one', { kind: 'field', ownerId: '$header', index: 12 }).error!,
    /12/,
  );
  assert.equal(
    moveFieldDefinition(full, 'one', { kind: 'field', ownerId: 'missing', index: 0 }).definition,
    full,
  );
  assert.equal(
    moveFieldDefinition(full, 'one', { kind: 'field', ownerId: 'fields', index: -1 }).definition,
    full,
  );
});

test('field transfer does not silently change root and collection-row binding scopes', () => {
  const source = definition([
    {
      id: 'root-fields',
      type: 'fields',
      title: 'Root',
      columns: 1,
      fields: [{ ...field('root-amount'), binding: 'entity.amount' }, field('root-other')],
    },
    {
      id: 'row-a',
      type: 'recordList',
      title: 'Rows A',
      columns: 1,
      binding: 'rowsA',
      itemTitle: { kind: 'binding', path: 'name' },
      fields: [{ ...field('row-amount'), binding: 'amount' }, field('row-other')],
    },
    {
      id: 'row-b',
      type: 'recordList',
      title: 'Rows B',
      columns: 1,
      binding: 'rowsB',
      itemTitle: { kind: 'binding', path: 'name' },
      fields: [],
    },
  ]);
  for (const [fieldId, ownerId] of [
    ['root-amount', 'row-a'],
    ['row-amount', 'root-fields'],
    ['row-amount', '$header'],
    ['row-amount', 'row-b'],
  ]) {
    const result = moveFieldDefinition(source, fieldId, { kind: 'field', ownerId, index: 0 });
    assert.equal(
      result.definition,
      source,
      `${fieldId} → ${ownerId} must preserve the original binding scope`,
    );
    assert.match(result.error!, /источник|списк/);
  }
  assert.deepEqual(
    fieldDropContainers(source, 'root-amount').map((owner) => owner.ownerId),
    ['$header', 'root-fields'],
  );
  assert.deepEqual(
    fieldDropContainers(source, 'row-amount').map((owner) => owner.ownerId),
    ['row-a'],
  );
  const reordered = moveFieldDefinition(source, 'row-amount', { kind: 'field', ownerId: 'row-a', index: 2 });
  assert.equal(reordered.error, undefined);
  assert.deepEqual(
    locateField(reordered.definition, 'row-amount')?.fields.map((field) => field.id),
    ['row-other', 'row-amount'],
  );
  assert.equal(locateField(reordered.definition, 'row-amount')?.field.binding, 'amount');
});
