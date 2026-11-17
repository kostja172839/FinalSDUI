import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../shared/catalog';
import { seedEntities, seedTemplates } from '../shared/seeds';
import { safePath, validateTemplate } from '../shared/validation';
import { resolveSplit } from '../server/resolve';
import type { ContentNode, SectionNode } from '../shared/model';

test('all shipped definitions compile and all example entities have 20+ events', () => {
  for (const record of seedTemplates)
    assert.deepEqual(
      validateTemplate(record.draft).filter((i) => i.severity === 'error'),
      [],
    );
  assert.equal(seedEntities.length, 3);
  for (const entity of seedEntities)
    assert.ok(((entity.data.collections as Record<string, unknown>).events as unknown[]).length >= 20);
});

test('validator reports unknown nodes but accepts safe data paths outside the advisory catalog', () => {
  const definition = structuredClone(seedTemplates[0].draft);
  definition.tabs[0].nodes[0] = {
    id: 'bad-block',
    title: 'Unknown',
    type: 'execute-code',
  } as unknown as ContentNode;
  assert.ok(validateTemplate(definition).some((i) => i.nodeId === 'bad-block' && i.path.endsWith('.type')));
  definition.tabs[0].nodes[0] = {
    id: 'bad-data',
    type: 'text',
    title: 'Unknown data',
    binding: 'asset.secretToken',
    collapsible: true,
  };
  assert.equal(
    validateTemplate(definition).some((i) => i.nodeId === 'bad-data'),
    false,
  );
});

test('widgets are registry entries with explicit embedded or external placement', () => {
  const definition = structuredClone(seedTemplates[0].draft);
  definition.tabs[0].nodes.push({
    id: 'widget',
    type: 'widget',
    title: 'History',
    widgetId: 'asset-history',
    height: 300,
  });
  assert.equal(validateTemplate(definition).filter((i) => i.severity === 'error').length, 0);
  (definition.tabs[0].nodes.at(-1) as { widgetId: string }).widgetId = 'https://untrusted.example/widget.js';
  assert.ok(validateTemplate(definition).some((i) => i.nodeId === 'widget' && i.severity === 'error'));
  definition.footer.widgetId = 'asset-history';
  assert.ok(validateTemplate(definition).some((i) => i.path === '$.footer.widgetId'));
});

test('client capabilities reject unsupported node and widget implementations', () => {
  const issues = validateTemplate(seedTemplates[0].draft, { nodeTypes: ['fields'], widgetIds: [] });
  assert.ok(issues.some((i) => i.path.endsWith('.type')));
  assert.ok(issues.some((i) => i.path === '$.footer.widgetId'));
  assert.deepEqual(
    validateTemplate(seedTemplates[0].draft, {
      nodeTypes: catalog.nodeTypes,
      widgetIds: catalog.widgets.map((w) => w.id),
    }).filter((i) => i.severity === 'error'),
    [],
  );
});

test('recursive structures, duplicate IDs and unsafe bindings are rejected', () => {
  const definition = structuredClone(seedTemplates[0].draft);
  const cycle: SectionNode = {
    id: 'cycle',
    title: 'Cycle',
    type: 'section',
    collapsible: true,
    defaultOpen: true,
    children: [],
  };
  cycle.children.push(cycle);
  definition.tabs[0].nodes = [cycle];
  assert.ok(validateTemplate(definition).some((i) => i.message.includes('циклическая')));
  const duplicate = structuredClone(seedTemplates[0].draft);
  duplicate.tabs[0].nodes[1].id = duplicate.tabs[0].nodes[0].id;
  assert.ok(validateTemplate(duplicate).some((i) => i.message.includes('уже используется')));
  duplicate.header.titleBinding = 'asset.__proto__.polluted';
  assert.ok(validateTemplate(duplicate).some((i) => i.message.includes('Недопустимый путь')));
  assert.equal(safePath({ asset: {} }, 'asset.__proto__.polluted'), undefined);
  assert.equal(safePath({ asset: {} }, 'asset.toString'), undefined);
});

test('nested blocks have bounded depth', () => {
  const definition = structuredClone(seedTemplates[0].draft);
  let nodes = definition.tabs[0].nodes;
  for (let i = 0; i < 12; i++) {
    const section: SectionNode = {
      id: `level-${i}`,
      title: 'Section',
      type: 'section',
      collapsible: true,
      defaultOpen: true,
      children: [],
    };
    nodes.splice(0, nodes.length, section);
    nodes = section.children;
  }
  assert.ok(validateTemplate(definition).some((i) => i.message.includes('Превышен предел')));
});

test('preview scenarios do not mutate real entity fixtures and errors have block scope', () => {
  const before = structuredClone(seedEntities);
  const empty = resolveSplit(seedTemplates[0].draft, 'asset-001', 'draft', 'empty');
  assert.deepEqual((empty.data.collections as Record<string, unknown>).events, []);
  assert.equal((empty.data.entity as Record<string, unknown>).inventoryNumber, null);
  const errors = resolveSplit(seedTemplates[0].draft, 'asset-001', 'draft', 'error');
  assert.ok(errors.errors.some((e) => e.nodeId === 'events-table'));
  assert.ok(errors.errors.every((e) => e.nodeId && e.message));
  const long = resolveSplit(seedTemplates[0].draft, 'asset-001', 'draft', 'long');
  assert.ok(String((long.data.entity as Record<string, unknown>).description).length > 1000);
  assert.deepEqual(seedEntities, before);
});
