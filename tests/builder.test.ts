import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../shared/catalog';
import { seedTemplates } from '../shared/seeds';
import { validateTemplate } from '../shared/validation';
import type { ContentNode, DocumentsNode, MetricsNode } from '../shared/model';
import { createNode, duplicateNode } from '../src/builder/operations';

test('new constructor blocks start with neutral values and compile without domain-specific field bindings', () => {
  const definition = structuredClone(seedTemplates[0].draft);
  definition.tabs = [
    {
      id: 'neutral-blocks',
      title: 'Компоненты',
      nodes: (['callout', 'metrics', 'recordList', 'documents'] as const).map((type) =>
        createNode(type, { ...catalog, fields: [], datasets: [] }),
      ),
    },
  ];
  assert.deepEqual(
    validateTemplate(definition).filter((issue) => issue.severity === 'error'),
    [],
  );
  assert.ok(definition.tabs[0].nodes.every((node) => !JSON.stringify(node).includes('asset.')));
});

test('duplicating sections renews field, metric and document action IDs without modifying the source', () => {
  const metric = createNode('metrics', catalog) as MetricsNode;
  const documents = createNode('documents', catalog) as DocumentsNode;
  documents.action = {
    id: 'document-action',
    label: 'Открыть',
    kind: 'openWidget',
    widgetId: catalog.widgets.find((widget) => widget.mode === 'external')!.id,
  };
  const section: ContentNode = {
    id: 'original-section',
    type: 'section',
    title: 'Раздел',
    collapsible: true,
    defaultOpen: true,
    children: [metric, documents],
  };
  const before = structuredClone(section);
  const duplicate = duplicateNode(section);
  assert.deepEqual(section, before);
  assert.notEqual(duplicate.id, section.id);
  assert.equal(duplicate.type, 'section');
  if (duplicate.type !== 'section') throw new Error('Expected section');
  assert.notEqual((duplicate.children[0] as MetricsNode).items[0].id, metric.items[0].id);
  assert.notEqual((duplicate.children[1] as DocumentsNode).action!.id, documents.action.id);
  const definition = structuredClone(seedTemplates[0].draft);
  definition.tabs = [{ id: 'duplicated-blocks', title: 'Компоненты', nodes: [section, duplicate] }];
  assert.deepEqual(
    validateTemplate(definition).filter((issue) => issue.severity === 'error'),
    [],
  );
});
