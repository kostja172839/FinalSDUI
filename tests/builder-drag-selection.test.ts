import test from 'node:test';
import assert from 'node:assert/strict';
import type { ContentNode, FieldDefinition, SectionNode, SplitTemplate } from '../shared/model';
import {
  insertContentNode,
  locateField,
  locateNode,
  moveContentNode,
  nodeContainers,
} from '../src/builder/operations';
import { editorSelection, fieldSelectionClass } from '../src/runtime/editorSelection';
import { nextKeyboardDropZone } from '../src/builder/dragAndDrop';

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
    target: { closest: () => ({}) },
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
