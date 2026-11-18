import test from 'node:test';
import assert from 'node:assert/strict';
import type { ErpTableNode, SplitTemplate, WidgetRuntimeEvent } from '../shared/model';
import { seedTemplates } from '../shared/seeds';
import { canonicalizeDefinition } from '../shared/values';
import { validateTemplate } from '../shared/validation';
import { validateResolvedData } from '../shared/data-validation';
import {
  createErpTableCallbacks,
  resolveErpTableInput,
  safeErpTableUrl,
} from '../src/runtime/erp-table-data';

const context = { entityId: 'claim-91', entityType: 'claim', instanceId: 'split-42', locale: 'ru-RU' };
const table = (): ErpTableNode => ({
  id: 'registry',
  type: 'erpTable',
  title: 'Связанные документы',
  height: 480,
  tableUrl: { kind: 'literal', value: '/api/table/claim-documents' },
});
const definitionWithTable = (node: ErpTableNode): SplitTemplate => ({
  ...structuredClone(seedTemplates[0].draft),
  tabs: [{ id: 'registry-tab', title: 'Реестр', nodes: [node] }],
});

test('ERP table resolves URL and arbitrary opaque filters without inventing metadata or altering private shapes', () => {
  const node = table();
  const filters = [{ anyPrivateShape: { codes: [1, 'a'], negate: false } }];
  node.options = {
    defaultQueryFiltres: filters,
    techFilters: [],
    defaultSelectRows: ['row-a', 0],
    paginationSize: { size: 'xs', slots: 11 },
  };
  const original = structuredClone(node);
  const result = resolveErpTableInput(node, {}, context);
  assert.equal(result.data.tableUrl, '/api/table/claim-documents');
  assert.deepEqual(result.data.defaultQueryFiltres, filters);
  assert.deepEqual(result.data.defaultSelectRows, new Set(['row-a', 0]));
  (result.data.defaultSelectRows as Set<unknown>).add('local-only');
  (
    result.data.defaultQueryFiltres as { anyPrivateShape: { codes: unknown[] } }[]
  )[0].anyPrivateShape.codes.push('local-only');
  assert.deepEqual(node, original);
});

test('ERP table dynamic parameters use arbitrary API paths and trusted context, overriding same-name static options', () => {
  const node = table();
  node.tableUrl = { kind: 'binding', path: 'response.registryUrl' };
  node.options = { customParams: { mode: 'query' }, enableFilters: true };
  node.props = {
    'customParams.taskCode': { kind: 'binding', path: 'response.taskCode' },
    'mfAdditionalProps.entityId': { kind: 'binding', path: '$context.entityId' },
    enableFilters: { kind: 'literal', value: false },
  };
  const result = resolveErpTableInput(
    node,
    {
      response: { registryUrl: '/api/custom-registry', taskCode: 'arbitrary-code' },
      $context: { entityId: 'spoofed' },
    },
    context,
  );
  assert.equal(result.data.tableUrl, '/api/custom-registry');
  assert.deepEqual(result.data.customParams, { taskCode: 'arbitrary-code' });
  assert.deepEqual(result.data.mfAdditionalProps, { entityId: 'claim-91' });
  assert.equal(result.data.enableFilters, false);
});

test('ERP table rejects missing/unsafe table URLs and wrong dynamic option types before rendering the component', () => {
  const node = table();
  for (const value of [
    '',
    'javascript:alert(1)',
    '//untrusted/table',
    ' /api/table',
    '/api\\table',
    '/api/table\n',
    3,
    null,
  ]) {
    node.tableUrl = { kind: 'literal', value };
    assert.throws(() => resolveErpTableInput(node, {}, context));
    assert.equal(safeErpTableUrl(value), false);
  }
  node.tableUrl = { kind: 'binding', path: 'missing.url' };
  assert.throws(() => resolveErpTableInput(node, {}, context));
  node.tableUrl = { kind: 'literal', value: 'https://tables.example.test/api/table' };
  assert.equal(safeErpTableUrl(node.tableUrl.value), true);
  node.props = { enableFilters: { kind: 'binding', path: 'flags.enabled' } };
  assert.throws(() => resolveErpTableInput(node, { flags: { enabled: 'yes' } }, context));
  node.props = { paginationSize: { kind: 'literal', value: { slots: 16 } } };
  assert.throws(() => resolveErpTableInput(node, {}, context));
});

test('ERP table never accepts host-controlled state, CSS, mocks, imports or editing mode from SDUI props', () => {
  for (const key of [
    'tableUrl',
    'activeSplit',
    'tableViewPort',
    '$css',
    'customImportMap',
    'microFrontendComponents',
    'mockData',
    'mockMeta',
    'isEditModeActive',
    'rowCheckboxDisabled',
    'ref',
  ]) {
    const node = table();
    node.props = { [key]: { kind: 'literal', value: 'untrusted' } };
    assert.throws(() => resolveErpTableInput(node, {}, context), key);
  }
  const node = table();
  node.props = { defaultSelectRows: { kind: 'literal', value: [{ id: 'not-an-id' }] } };
  assert.throws(() => resolveErpTableInput(node, {}, context));
});

test('native ERP callbacks preserve Set and opaque split payloads while controlling activeSplit locally', () => {
  let active = true;
  const states: boolean[] = [];
  const right: unknown[] = [];
  const selections: unknown[] = [];
  const events: WidgetRuntimeEvent[] = [];
  const payload = { privateName: 'paymentOrder', opaqueProps: { any: 'shape' } };
  const selected = new Set(['row-a', 0]);
  const callbacks = createErpTableCallbacks(
    { onSelectChange: { type: 'host', name: 'selectedRows' } },
    {
      context,
      isCurrent: () => active,
      emit: (event) => events.push(event),
      setActiveSplit: (open) => states.push(open),
      onRightContent: (value, ctx) => {
        right.push(value, ctx);
      },
      handlers: {
        selectedRows: (value) => {
          selections.push(value);
        },
      },
    },
  );
  callbacks.setActiveSplit(true);
  callbacks.setRightContent(payload);
  callbacks.onSelectChange(selected);
  assert.deepEqual(states, [true]);
  assert.equal(right[0], payload);
  assert.equal(right[1], context);
  assert.equal(selections[0], selected);
  assert.equal((events[0] as Extract<WidgetRuntimeEvent, { type: 'host' }>).args[0], selected);
  active = false;
  callbacks.setActiveSplit(false);
  callbacks.setRightContent({ stale: true });
  callbacks.onSelectChange(new Set(['stale']));
  assert.deepEqual(states, [true]);
  assert.equal(right.length, 2);
  assert.equal(events.length, 1);
});

test('ERP callback bridge combines trusted callbacks and declarative refresh and isolates async failures', async () => {
  const events: WidgetRuntimeEvent[] = [];
  const payload = { opaqueSaveRequest: true };
  const received: unknown[] = [];
  const callbacks = createErpTableCallbacks(
    { onEditSuccess: { type: 'refresh' } },
    {
      context,
      isCurrent: () => true,
      emit: (event) => events.push(event),
      setActiveSplit: () => undefined,
      trustedProps: {
        onEditSuccess: (value: unknown) => {
          received.push(value);
        },
        onEditError: async () => {
          throw new Error('private-error');
        },
      },
    },
  );
  callbacks.onEditSuccess(payload, undefined);
  assert.equal(received[0], payload);
  assert.deepEqual(events, [{ type: 'dataChanged' }]);
  callbacks.onEditError(new Error('save-failed'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(events[1].type, 'error');
  assert.equal(callbacks.onFetchData, undefined);
});

test('template validation checks ERP URL, typed options, allowed events, host-only props and client capabilities', () => {
  const definition = definitionWithTable(table());
  const errors = (value: unknown) => validateTemplate(value).filter((issue) => issue.severity === 'error');
  assert.deepEqual(errors(definition), []);
  const cases: [string, Record<string, unknown>][] = [
    ['tableUrl.value', { tableUrl: { kind: 'literal', value: 'javascript:alert(1)' } }],
    ['options.defaultRowSize', { options: { defaultRowSize: 'huge' } }],
    ['options.paginationSize.slots', { options: { paginationSize: { slots: 16 } } }],
    ['events.onUnknown', { events: { onUnknown: { type: 'refresh' } } }],
    ['props.$css', { props: { $css: { kind: 'literal', value: 'body{}' } } }],
    ['props.isEditModeActive', { props: { isEditModeActive: { kind: 'literal', value: true } } }],
  ];
  for (const [path, update] of cases) {
    const changed = { ...definition, tabs: [{ ...definition.tabs[0], nodes: [{ ...table(), ...update }] }] };
    assert.ok(
      errors(changed).some((issue) => issue.nodeId === 'registry' && issue.path.endsWith(path)),
      path,
    );
  }
  const unsupported = validateTemplate(definition, { nodeTypes: ['fields', 'table'] });
  assert.ok(
    unsupported.some(
      (issue) => issue.severity === 'error' && issue.nodeId === 'registry' && issue.path.endsWith('.type'),
    ),
  );
});

test('canonicalization rewrites ERP URL and prop bindings while preserving literal business data and the saved snapshot', () => {
  const node = table();
  node.tableUrl = { kind: 'binding', path: 'asset.registryUrl' };
  node.props = {
    customParams: { kind: 'binding', path: 'asset.queryParameters' },
    mfAdditionalProps: {
      kind: 'literal',
      value: { source: 'asset.registryUrl', label: 'Любой бизнес-текст' },
    },
  };
  const definition = definitionWithTable(node);
  const saved = structuredClone(definition);
  const normalized = canonicalizeDefinition(definition);
  const normalizedNode = normalized.tabs[0].nodes[0] as ErpTableNode;
  assert.deepEqual(normalizedNode.tableUrl, { kind: 'binding', path: 'entity.registryUrl' });
  assert.deepEqual(normalizedNode.props?.customParams, { kind: 'binding', path: 'entity.queryParameters' });
  assert.deepEqual(normalizedNode.props?.mfAdditionalProps, node.props.mfAdditionalProps);
  assert.deepEqual(definition, saved);
});

test('resolved-data validation catches ERP URL and filters from API and accepts corrected opaque payloads', () => {
  const node = table();
  node.tableUrl = { kind: 'binding', path: 'response.url' };
  node.props = {
    techFilters: { kind: 'binding', path: 'response.filters' },
    enableColumns: { kind: 'binding', path: 'response.columnsEnabled' },
  };
  const definition = definitionWithTable(node);
  const bad = validateResolvedData(
    definition,
    { response: { url: '//untrusted/table', filters: { not: 'a-list' }, columnsEnabled: 'yes' } },
    context,
  ).filter((issue) => issue.nodeId === 'registry');
  assert.ok(bad.some((issue) => issue.path.endsWith('.tableUrl') && issue.dataPath === 'response.url'));
  assert.ok(bad.some((issue) => issue.path.endsWith('.props.techFilters')));
  assert.ok(bad.some((issue) => issue.path.endsWith('.props.enableColumns')));
  const valid = validateResolvedData(
    definition,
    {
      response: {
        url: '/api/real-registry',
        filters: [{ privateFilterShape: { relation: 'anything' } }],
        columnsEnabled: false,
      },
    },
    context,
  ).filter((issue) => issue.nodeId === 'registry');
  assert.deepEqual(valid, []);
});
