import test from 'node:test';
import assert from 'node:assert/strict';
import { erpTableMockData, erpTableMockMeta, ERP_TABLE_DEMO_URL } from '../src/demo/erp-table-fixture';
import { buildErpDemoModel, projectErpColumns, resolveErpCell } from '../src/demo/erp-table-model';
import type { IMetaDataResponse, IRowData } from '../src/demo/erp-table-types';

test('ERP demo fixtures use supplied metadata and row envelopes without inventing a service row ID', () => {
  assert.equal(ERP_TABLE_DEMO_URL, '/demo/erp-table');
  assert.ok(Array.isArray(erpTableMockMeta.data?.metadata));
  const rows = erpTableMockData.data.rows!;
  assert.ok(rows.length >= 8);
  assert.equal(erpTableMockData.data.page.totalElements, rows.length);
  assert.equal(erpTableMockData.data.page.count, rows.length);
  for (const row of rows) {
    assert.ok(Array.isArray(row.fields));
    assert.equal(Object.hasOwn(row, 'id'), false);
    assert.equal(Object.hasOwn(row, 'rowId'), false);
    assert.ok(row.fields!.every((field) => typeof field.fieldName === 'string'));
  }
  assert.equal(erpTableMockData.messages instanceof Array, true);
});

test('ERP columns follow fieldName and position and respect always/default-hidden metadata', () => {
  const visible = projectErpColumns(erpTableMockMeta);
  assert.deepEqual(
    visible.map((column) => column.fieldName),
    ['eventNumber', 'kind', 'occurredAt', 'status', 'amount', 'participants'],
  );
  const all = projectErpColumns(erpTableMockMeta, true);
  assert.ok(all.some((column) => column.fieldName === 'tags' && column.type === 'array'));
  assert.ok(all.some((column) => column.fieldName === 'participants' && column.type === 'arrayObject'));
  assert.ok(!all.some((column) => column.fieldName === 'sourceSystem'));
  const metadata: IMetaDataResponse = {
    data: {
      metadata: [
        { fieldName: 'last', fieldTitle: 'Без позиции' },
        { fieldName: 'first', position: 1 },
        { fieldName: 'second', position: 1 },
        { fieldName: null, position: 0 },
        { fieldName: 'never', position: 0, isHideAlways: true },
      ],
    },
  };
  assert.deepEqual(
    projectErpColumns(metadata).map((column) => column.fieldName),
    ['first', 'second', 'last'],
  );
  assert.equal(visible.find((column) => column.fieldName === 'kind')?.wrap, true);
  assert.equal(visible.find((column) => column.fieldName === 'occurredAt')?.minimumWidth, 145);
});

test('ERP cells use declared types, display arrayObject.value, subValue and badgeId references', () => {
  const row = erpTableMockData.data.rows![0];
  const columns = projectErpColumns(erpTableMockMeta, true);
  const cell = (name: string) =>
    resolveErpCell(
      { fields: [...row.fields!].reverse() },
      columns.find((column) => column.fieldName === name)!,
      erpTableMockMeta,
    );
  assert.equal(cell('eventNumber').text, 'ПС-2026-0001');
  assert.equal(cell('occurredAt').text, '16.11.2026');
  assert.equal(cell('amount').text.replace(/\s/g, ''), '1200000,50');
  assert.equal(cell('participants').text, 'Анна Сергеева, Михаил Лебедев');
  assert.equal(cell('participants').text.includes('demo-employee'), false);
  assert.equal(cell('tags').text, 'Плановое, Бухгалтерский учёт');
  assert.equal(cell('kind').subValue, 'Основание: акт приёма-передачи');
  assert.deepEqual(cell('comment'), {
    text: '—',
    empty: true,
    subValue: undefined,
    field: row.fields!.find((field) => field.fieldName === 'comment'),
  });
  assert.equal(cell('confirmed').text, 'Да');
  assert.ok(cell('processedAt').text.includes('10:15'));
  assert.equal(cell('status').badge?.view, 'positive');
  const status = columns.find((column) => column.fieldName === 'status')!;
  const unmapped = resolveErpCell(
    { fields: [{ fieldName: 'status', value: 'Проведено', badgeId: 'unknown' }] },
    status,
    erpTableMockMeta,
  );
  assert.equal(unmapped.badge, undefined);
  assert.equal(unmapped.text, 'Проведено');
});

test('ERP money formatting keeps currency in explicit metadata or separate fields', () => {
  const meta: IMetaDataResponse = {
    data: {
      metadata: [
        { fieldName: 'amount', fieldTitle: 'Сумма', type: 'money', position: 1 },
        { fieldName: 'currencyLetterCode', fieldTitle: 'Валюта', type: 'string', position: 2 },
      ],
    },
  };
  const row = {
    fields: [
      { fieldName: 'amount', value: '300' },
      { fieldName: 'currencyLetterCode', value: 'EUR' },
    ],
  };
  const [amount, currency] = projectErpColumns(meta);
  assert.equal(resolveErpCell(row, amount, meta).text, '300,00');
  assert.equal(resolveErpCell(row, currency, meta).text, 'EUR');
  assert.equal(amount.title, 'Сумма');

  meta.data!.metadata![0].fieldTitle = 'Сумма, €';
  assert.equal(projectErpColumns(meta)[0].title, 'Сумма, €');
  assert.equal(resolveErpCell(row, projectErpColumns(meta)[0], meta).text, '300,00');
});

test('ERP local view searches displayed values, keeps source keys across sort/page and never mutates fixtures', () => {
  const saved = structuredClone({ meta: erpTableMockMeta, data: erpTableMockData });
  const first = buildErpDemoModel(erpTableMockMeta, erpTableMockData, { pageSize: 5 });
  assert.deepEqual(
    [first.totalRows, first.filteredRows, first.pageCount, first.from, first.to],
    [16, 16, 4, 1, 5],
  );
  const page = buildErpDemoModel(erpTableMockMeta, erpTableMockData, { pageSize: 5, pageIndex: 999 });
  assert.deepEqual([page.pageIndex, page.from, page.to, page.rows.length], [3, 16, 16, 1]);
  assert.equal(page.rows[0].key, 'row-15');
  assert.equal(page.rows[0].source, erpTableMockData.data.rows![15]);
  const found = buildErpDemoModel(erpTableMockMeta, erpTableMockData, { query: 'АННА СЕРГЕЕВА' });
  assert.equal(found.filteredRows, 4);
  const subValue = buildErpDemoModel(erpTableMockMeta, erpTableMockData, { query: 'акт приёма-передачи' });
  assert.equal(subValue.filteredRows, 6);
  const missing = buildErpDemoModel(erpTableMockMeta, erpTableMockData, {
    query: 'несуществующее',
    pageIndex: 10,
  });
  assert.deepEqual(
    [missing.rows.length, missing.pageIndex, missing.pageCount, missing.from, missing.to],
    [0, 0, 1, 0, 0],
  );
  const hidden = buildErpDemoModel(erpTableMockMeta, erpTableMockData, {
    query: 'Демонстрационный источник',
    includeDefaultHidden: true,
  });
  assert.equal(hidden.filteredRows, 0);
  assert.deepEqual({ meta: erpTableMockMeta, data: erpTableMockData }, saved);
});

test('ERP sorting follows numeric/date metadata rather than formatted lexicographic order', () => {
  const meta: IMetaDataResponse = {
    data: {
      metadata: [
        { fieldName: 'amount', type: 'money', position: 1, isFilterSort: true },
        { fieldName: 'date', dataType: 'date', position: 2, isFilterSort: true },
      ],
    },
  };
  const rows: IRowData = {
    data: {
      rows: [
        {
          fields: [
            { fieldName: 'amount', value: '100' },
            { fieldName: 'date', value: '2026-01-01' },
          ],
        },
        {
          fields: [
            { fieldName: 'amount', value: '2' },
            { fieldName: 'date', value: '2025-12-31' },
          ],
        },
        {
          fields: [
            { fieldName: 'amount', value: '10' },
            { fieldName: 'date', value: '2026-11-16' },
          ],
        },
        {
          fields: [
            { fieldName: 'amount', value: null },
            { fieldName: 'date', value: null },
          ],
        },
      ],
      page: { offset: 0, limit: 4, count: 4, totalElements: 4 },
    },
    messages: [],
  };
  assert.deepEqual(
    buildErpDemoModel(meta, rows, { sort: { fieldName: 'amount', direction: 'asc' } }).rows.map(
      (row) => row.sourceIndex,
    ),
    [1, 2, 0, 3],
  );
  assert.deepEqual(
    buildErpDemoModel(meta, rows, { sort: { fieldName: 'date', direction: 'desc' } }).rows.map(
      (row) => row.sourceIndex,
    ),
    [2, 0, 1, 3],
  );
});

test('ERP view with pagination disabled retains every loaded row beyond the normal page-size cap', () => {
  const data = structuredClone(erpTableMockData);
  data.data.rows = Array.from({ length: 121 }, (_, index) => ({
    fields: [{ fieldName: 'eventNumber', value: `Событие ${index + 1}` }],
  }));
  data.data.page = { offset: 0, limit: 121, count: 121, totalElements: 121 };
  const all = buildErpDemoModel(erpTableMockMeta, data, { paginate: false, pageSize: 5, pageIndex: 99 });
  assert.deepEqual(
    [all.totalRows, all.filteredRows, all.rows.length, all.pageIndex, all.pageCount, all.from, all.to],
    [121, 121, 121, 0, 1, 1, 121],
  );
  assert.equal(all.rows[120].sourceIndex, 120);
  const filtered = buildErpDemoModel(erpTableMockMeta, data, { paginate: false, query: 'Событие 12' });
  assert.deepEqual(
    filtered.rows.map((row) => row.sourceIndex),
    [11, 119, 120],
  );
  assert.deepEqual([filtered.pageIndex, filtered.pageCount, filtered.from, filtered.to], [0, 1, 1, 3]);
});

test('ERP datetime formatting validates the source calendar independently from UTC midnight offsets', () => {
  const meta: IMetaDataResponse = { data: { metadata: [{ fieldName: 'when', type: 'datetime' }] } };
  const column = projectErpColumns(meta)[0];
  const text = (value: string) =>
    resolveErpCell({ fields: [{ fieldName: 'when', value }] }, column, meta).text;
  const previousDay = text('2026-11-16T00:30:00+03:00');
  assert.ok(previousDay.includes('15.11.2026'));
  assert.ok(previousDay.includes('21:30'));
  const nextDay = text('2026-11-16T23:30:00-05:00');
  assert.ok(nextDay.includes('17.11.2026'));
  assert.ok(nextDay.includes('04:30'));
  assert.ok(text('2026-11-16T00:30:00').includes('00:30'));
  for (const invalid of ['2026-02-30T00:30:00+03:00', '2025-02-29T00:30:00Z', '2026-13-01'])
    assert.equal(text(invalid), invalid);
  assert.ok(text('2024-02-29T00:30:00Z').includes('29.02.2024'));
});
