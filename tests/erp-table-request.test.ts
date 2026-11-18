import test from 'node:test';
import assert from 'node:assert/strict';
import { erpPreviewFilters, erpPreviewSearch, erpPreviewUrl } from '../src/demo/erp-table-request';
import { connectExpensesDemo } from '../src/demo/erp-table-examples';
import { resolveErpTableInput } from '../src/runtime/erp-table-data';
import type { ErpTableNode } from '../shared/model';

test('ERP URL query mapping preserves exact base and validates before any scenario override', () => {
  assert.equal(
    erpPreviewUrl(
      '/api/demo/erp-table/expenses?delay=50',
      {
        mode: 'approve',
        accountingTemplateCode: 'DEMO_TRAVEL',
      },
      'normal',
    ),
    '/api/demo/erp-table/expenses?delay=50&mode=approve&accounting-template-code=DEMO_TRAVEL&scenario=normal',
  );
  for (const url of [
    '//other.invalid/api/demo/erp-table/expenses',
    '/api/other/../demo/erp-table/expenses',
    '/api/demo/erp-table/expenses#fragment',
  ])
    assert.throws(() => erpPreviewUrl(url, {}, 'normal'));
  assert.throws(() => erpPreviewUrl('/api/demo/erp-table/expenses', { mode: false }, ''));
});

test('ERP default, technical and initial filters retain the supplied FilterParam fields without mutating input', () => {
  const filters = [
    {
      predicateHighLevel: 'AND',
      fieldName: 'reportId',
      search: ['demo-report-001'],
      predicateLowLevel: 'EQ',
    },
  ];
  const merged = erpPreviewFilters(filters, undefined, [
    { predicateHighLevel: 'NOT', fieldName: 'statusName', search: [null], predicateLowLevel: 'EQ' },
  ]);
  assert.deepEqual(merged[0], filters[0]);
  merged[0].search[0] = 'changed';
  assert.equal(filters[0].search[0], 'demo-report-001');
  for (const invalid of [
    {},
    [{ predicateHighLevel: 'EXECUTE', fieldName: 'x', search: [], predicateLowLevel: 'EQ' }],
    [{ predicateHighLevel: 'AND', fieldName: 'x', search: [{}], predicateLowLevel: 'EQ' }],
  ])
    assert.throws(() => erpPreviewFilters(invalid));
});

test('ERP demo search creates OR LIKE filters only for nontechnical visible or optional columns', () => {
  assert.deepEqual(
    erpPreviewSearch('Поездка', {
      data: {
        metadata: [
          { fieldName: 'documentName' },
          { fieldName: 'statusName', isHideByDefault: true },
          { fieldName: 'reportId', isHideAlways: true },
        ],
      },
    }).map((filter) => [
      filter.fieldName,
      filter.predicateHighLevel,
      filter.predicateLowLevel,
      filter.search,
    ]),
    [
      ['documentName', 'OR', 'LIKE', ['Поездка']],
      ['statusName', 'OR', 'LIKE', ['Поездка']],
    ],
  );
});

test('ERP expense constructor example reaches native table props and keeps unrelated dynamic values', () => {
  const node: ErpTableNode = {
    id: 'expense-table',
    type: 'erpTable',
    title: 'ERP',
    height: 420,
    tableUrl: { kind: 'literal', value: '' },
    props: {
      'customParams.mode': { kind: 'literal', value: 'old' },
      'mfAdditionalProps.recordId': { kind: 'binding', path: 'entity.id' },
    },
  };
  const example = connectExpensesDemo(node);
  const input = resolveErpTableInput(
    example,
    { entity: { id: 'demo-entity' } },
    { entityId: 'demo-entity', entityType: 'expense', instanceId: 'preview', locale: 'ru-RU' },
  );
  assert.equal(input.data.tableUrl, '/api/demo/erp-table/expenses');
  assert.deepEqual(input.data.customParams, { mode: 'approve', accountingTemplateCode: 'DEMO_TRAVEL' });
  assert.deepEqual(input.data.defaultQueryFiltres, [
    {
      predicateHighLevel: 'AND',
      fieldName: 'reportId',
      search: ['demo-report-001'],
      predicateLowLevel: 'EQ',
    },
  ]);
  assert.deepEqual(input.data.mfAdditionalProps, { recordId: 'demo-entity' });
  assert.equal(node.title, 'ERP');
});
