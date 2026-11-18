import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app';
import { ERP_TABLE_DEMO_API_BASE, ERP_EXPENSES_DEMO_API_BASE } from '../server/erp-table-demo';
import { erpTableMockData, erpTableMockMeta } from '../src/demo/erp-table-fixture';
import { erpExpensesMockData } from '../src/demo/erp-expenses-fixture';
import type { FilterParam, IMetaDataResponse, IRow, IRowData } from '../src/demo/erp-table-types';

async function withServer(run: (origin: string, server: ReturnType<typeof createServer>) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'sdui-erp-api-'));
  const server = createServer({ dataDir: directory });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}`, server);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
}
async function get(url: string) {
  const response = await fetch(url);
  return { response, data: await response.json() };
}
async function post(url: string, body: unknown = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}
const scope = (): FilterParam => ({
  predicateHighLevel: 'AND',
  fieldName: 'reportId',
  search: ['demo-report-001'],
  predicateLowLevel: 'EQ',
});
const value = (row: IRow, fieldName: string) =>
  row.fields?.find((field) => field.fieldName === fieldName)?.value;
const requestBody = (filters: FilterParam[] = [], offset = 0, limit = 10) => ({
  sorts: [],
  filters,
  pageable: { offset, limit },
});

test('ERP demo uses GET base/metadata and POST exact base with raw supplied response envelopes', async () => {
  await withServer(async (origin) => {
    const base = `${origin}${ERP_TABLE_DEMO_API_BASE}`;
    const meta = await get(`${base}/metadata?delay=0`);
    assert.equal(meta.response.status, 200);
    assert.equal(meta.response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(meta.data, erpTableMockMeta);
    const rows = await post(`${base}?delay=0`, requestBody());
    assert.equal(rows.response.status, 200);
    assert.equal(rows.response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(rows.data).sort(), ['data', 'messages']);
    assert.deepEqual(rows.data.data.page, { offset: 0, limit: 10, count: 10, totalElements: 16 });
    assert.deepEqual(rows.data.data.rows, erpTableMockData.data.rows!.slice(0, 10));
    assert.equal(value(rows.data.data.rows[0], 'amount'), '1200000.50');
    assert.equal(Object.hasOwn(rows.data.data.rows[0], 'id'), false);
    assert.equal(Object.hasOwn(rows.data.data.rows[0], 'cells'), false);
    assert.equal((await post(`${base}/rows?delay=0`, requestBody())).response.status, 404);
  });
});

test('expense source accepts contextual query names and filters report scope with nullable native fields', async () => {
  await withServer(async (origin) => {
    const base = `${origin}${ERP_EXPENSES_DEMO_API_BASE}`;
    const meta = await get(`${base}/metadata?delay=0`);
    assert.equal(meta.response.status, 200);
    assert.ok(
      meta.data.data.metadata.some(
        (column: { fieldName: string; isHideAlways?: boolean }) =>
          column.fieldName === 'reportId' && column.isHideAlways,
      ),
    );
    checkExpensesMetadata(meta.data as IMetaDataResponse);
    const rows = await post(
      `${base}?mode=demo-approve&accounting-template-code=DEMO_TRAVEL&delay=0`,
      requestBody([scope()], 2, 3),
    );
    assert.equal(rows.response.status, 200);
    const data = rows.data as IRowData;
    assert.deepEqual(data.data.page, { offset: 2, limit: null, count: 3, totalElements: 8 });
    assert.equal(data.data.additionalInfo, null);
    assert.deepEqual(data.data.rows, erpExpensesMockData.data.rows!.slice(2, 5));
    assert.ok(data.data.rows!.every((row) => value(row, 'reportId') === 'demo-report-001'));
    const field = data.data.rows![0].fields!.find((item) => item.fieldName === 'documentDate')!;
    assert.deepEqual([field.label, field.badgeId, field.iconId], [null, null, null]);
    const other = await post(`${base}?delay=0`, requestBody([{ ...scope(), search: ['demo-report-002'] }]));
    assert.equal(other.data.data.page.totalElements, 8);
    assert.ok(other.data.data.rows.every((row: IRow) => value(row, 'reportId') === 'demo-report-002'));
    const beyond = await post(`${base}?delay=0`, requestBody([scope()], 100, 5));
    assert.deepEqual(beyond.data.data.page, { offset: 100, limit: null, count: 0, totalElements: 8 });
  });
});

function checkExpensesMetadata({ data }: IMetaDataResponse) {
  assert.equal(data?.tableApiVersion, '3.7');
  assert.deepEqual(data.actions, []);
  assert.equal(data.isGlobalEditable, false);
  assert.equal(data.isGlobalSortingEnabled, true);
  assert.equal(Object.hasOwn(data, 'isGlobalPaginationEnabled'), false);
  const columns = data.metadata ?? [];
  const status = columns.find((column) => column.fieldName === 'statusName');
  assert.equal(status?.position, 0);
  assert.equal(status?.filterType, 'multiselect');
  const main = columns.filter((column) => column.isMain);
  assert.deepEqual(main.map((column) => column.fieldName), ['id']);
  assert.equal(main[0].isHideAlways, true);
  assert.equal(main[0].sortType, null);
  assert.equal(main[0].filterType, null);
  assert.deepEqual(columns.map((column) => column.position), columns.map((_, index) => index));
}

test('flat demo AND report scope cannot be bypassed by OR search filters and NOT excludes matching rows', async () => {
  await withServer(async (origin) => {
    const base = `${origin}${ERP_EXPENSES_DEMO_API_BASE}?delay=0`;
    const search = await post(
      base,
      requestBody([
        scope(),
        { predicateHighLevel: 'OR', fieldName: 'costTypeName', search: ['ТАКСИ'], predicateLowLevel: 'LIKE' },
        {
          predicateHighLevel: 'OR',
          fieldName: 'documentNumber',
          search: ['ДЕМО-010'],
          predicateLowLevel: 'LIKE',
        },
      ]),
    );
    assert.equal(search.response.status, 200);
    assert.equal(search.data.data.page.totalElements, 2);
    assert.ok(
      search.data.data.rows.every(
        (row: IRow) => value(row, 'reportId') === 'demo-report-001' && value(row, 'costTypeName') === 'Такси',
      ),
    );
    const excluded = await post(
      base,
      requestBody([
        scope(),
        {
          predicateHighLevel: 'NOT',
          fieldName: 'currencyLetterCode',
          search: ['EUR'],
          predicateLowLevel: 'EQ',
        },
      ]),
    );
    assert.equal(excluded.data.data.page.totalElements, 5);
    assert.ok(excluded.data.data.rows.every((row: IRow) => value(row, 'currencyLetterCode') !== 'EUR'));
  });
});

test('demo filter operators support exact, displayed LIKE, lists, numeric/date ranges and explicit null', async () => {
  await withServer(async (origin) => {
    const base = `${origin}${ERP_EXPENSES_DEMO_API_BASE}?delay=0`;
    const cases: [string, FilterParam['predicateLowLevel'], (string | null)[], number][] = [
      ['currencyLetterCode', 'EQ', ['RUB'], 5],
      ['statusName', 'IN', ['Проверен', 'Отклонён'], 5],
      ['documentName', 'LIKE', ['такси'], 2],
      ['documentDate', 'BETWEEN', ['2026-11-02', '2026-11-04'], 3],
      ['amount', 'GT', ['2000'], 5],
      ['amount', 'LT', ['100'], 1],
      ['taxAccountingIndicatorName', 'EQ', [null], 8],
    ];
    for (const [fieldName, predicateLowLevel, search, count] of cases) {
      const result = await post(
        base,
        requestBody([scope(), { predicateHighLevel: 'AND', fieldName, search, predicateLowLevel }]),
      );
      assert.equal(result.response.status, 200);
      assert.equal(result.data.data.page.totalElements, count, `${fieldName} ${predicateLowLevel}`);
    }
    const arrayValue = await post(
      `${origin}${ERP_TABLE_DEMO_API_BASE}?delay=0`,
      requestBody([
        {
          predicateHighLevel: 'AND',
          fieldName: 'participants',
          search: ['Анна Сергеева'],
          predicateLowLevel: 'LIKE',
        },
      ]),
    );
    assert.equal(arrayValue.data.data.page.totalElements, 4);
    const arrayTech = await post(
      `${origin}${ERP_TABLE_DEMO_API_BASE}?delay=0`,
      requestBody([
        {
          predicateHighLevel: 'AND',
          fieldName: 'participants',
          search: ['demo-employee-a'],
          predicateLowLevel: 'IN',
        },
      ]),
    );
    assert.equal(arrayTech.data.data.page.totalElements, 4);
  });
});

test('ERP demo rejects malformed sort entries, actual payloads and invalid filter/page values', async () => {
  await withServer(async (origin) => {
    const base = `${origin}${ERP_EXPENSES_DEMO_API_BASE}?delay=0`;
    const invalid: unknown[] = [
      { page: { offset: 0, limit: 10 } },
      { search: 'old-protocol' },
      { sorts: [{}] },
      { sorts: null },
      { sorts: [{ fieldName: 'statusName', direction: 'ASC' }] },
      { sorts: [{ sortParam: 'statusName', sortType: 'asc' }] },
      { sorts: [{ sortParam: 'unknown', sortType: 'ASC' }] },
      { sorts: [{ sortParam: 'reportId', sortType: 'ASC' }] },
      {
        sorts: [
          { sortParam: 'statusName', sortType: 'ASC' },
          { sortParam: 'statusName', sortType: 'DESC' },
        ],
      },
      { sorts: Array.from({ length: 6 }, () => ({ sortParam: 'statusName', sortType: 'ASC' })) },
      { pageable: null },
      { pageable: { offset: -1, limit: 5 } },
      { pageable: { offset: 1_000_001, limit: 5 } },
      { pageable: { offset: 0.5, limit: 5 } },
      { pageable: { offset: 0, limit: 101 } },
      { pageable: { offset: 0, limit: null } },
      { pageable: { offset: '0', limit: 5 } },
      { filters: null },
      { filters: [{}] },
      { filters: [{ ...scope(), fieldName: 'not-in-metadata' }] },
      { filters: [{ ...scope(), predicateHighLevel: 'XOR' }] },
      { filters: [{ ...scope(), predicateLowLevel: 'NEQ' }] },
      { filters: [{ ...scope(), search: [] }] },
      { filters: [{ ...scope(), search: [3] }] },
      { filters: [{ ...scope(), search: ['x'.repeat(201)] }] },
      { filters: [{ ...scope(), predicateLowLevel: 'BETWEEN', search: ['one'] }] },
      { filters: [{ ...scope(), predicateLowLevel: 'LIKE', search: [null] }] },
      { filters: [{ ...scope(), fieldName: 'amount', predicateLowLevel: 'GT', search: ['not-a-number'] }] },
      {
        filters: [
          {
            ...scope(),
            fieldName: 'documentDate',
            predicateLowLevel: 'BETWEEN',
            search: ['2026-02-30', '2026-03-01'],
          },
        ],
      },
    ];
    for (const body of invalid) {
      const result = await post(base, body);
      assert.equal(result.response.status, 400, JSON.stringify(body));
      assert.equal(typeof result.data.message, 'string');
    }
    assert.match((await post(base, { sorts: [{}] })).data.message, /sortParam/);
  });
});

test('exact sortParam/sortType sorts scoped expenses in both directions with stable secondary ordering', async () => {
  await withServer(async (origin) => {
    const base = `${origin}${ERP_EXPENSES_DEMO_API_BASE}?delay=0`;
    const asc = await post(base, {
      ...requestBody([scope()]),
      sorts: [{ sortParam: 'statusName', sortType: 'ASC' }],
    });
    assert.equal(asc.response.status, 200);
    assert.deepEqual(
      asc.data.data.rows.map((row: IRow) => value(row, 'id')),
      [
        'demo-expense-002',
        'demo-expense-005',
        'demo-expense-008',
        'demo-expense-003',
        'demo-expense-006',
        'demo-expense-001',
        'demo-expense-004',
        'demo-expense-007',
      ],
    );
    assert.ok(asc.data.data.rows.every((row: IRow) => value(row, 'reportId') === 'demo-report-001'));
    assert.equal(asc.data.data.page.totalElements, 8);
    const desc = await post(base, {
      ...requestBody([scope()]),
      sorts: [{ sortParam: 'statusName', sortType: 'DESC' }],
    });
    assert.deepEqual(
      desc.data.data.rows.slice(0, 3).map((row: IRow) => value(row, 'id')),
      ['demo-expense-001', 'demo-expense-004', 'demo-expense-007'],
    );
    const multiple = await post(base, {
      ...requestBody([scope()]),
      sorts: [
        { sortParam: 'statusName', sortType: 'ASC' },
        { sortParam: 'amount', sortType: 'DESC' },
      ],
    });
    assert.deepEqual(
      multiple.data.data.rows.slice(0, 3).map((row: IRow) => value(row, 'id')),
      ['demo-expense-008', 'demo-expense-005', 'demo-expense-002'],
    );
    const product = await post(`${origin}${ERP_TABLE_DEMO_API_BASE}?delay=0`, {
      ...requestBody(),
      sorts: [{ sortParam: 'amount', sortType: 'DESC' }],
    });
    assert.equal(product.response.status, 200);
    assert.equal(value(product.data.data.rows[0], 'amount'), '1200000.50');
  });
});

test('both demo sources implement empty/error scenarios, bounded query controls and exact resource verbs', async () => {
  await withServer(async (origin) => {
    for (const source of [ERP_TABLE_DEMO_API_BASE, ERP_EXPENSES_DEMO_API_BASE]) {
      const base = `${origin}${source}`;
      assert.equal((await get(`${base}/metadata?scenario=empty&delay=0`)).response.status, 200);
      const empty = await post(`${base}?scenario=empty&delay=0`, requestBody());
      assert.equal(empty.response.status, 200);
      assert.deepEqual(empty.data.data.rows, []);
      assert.equal(empty.data.data.page.totalElements, 0);
      const metadataError = await get(`${base}/metadata?scenario=error&delay=0`);
      const rowsError = await post(`${base}?scenario=error&delay=0`, requestBody());
      for (const failed of [metadataError, rowsError]) {
        assert.equal(failed.response.status, 503);
        assert.equal(failed.response.headers.get('cache-control'), 'no-store');
        assert.match(failed.data.message, /временно недоступен/);
      }
      assert.equal((await get(`${base}?delay=0`)).response.status, 405);
      assert.equal((await post(`${base}/metadata?delay=0`)).response.status, 405);
      assert.equal((await get(`${base}/metadata/extra?delay=0`)).response.status, 404);
      for (const query of [
        'scenario=unknown',
        'delay=-1',
        'delay=3001',
        'delay=0.5',
        'delay=',
        'delay=0&delay=1',
        'unknown=1',
        'mode=',
        'accounting-template-code=x%20y',
      ]) {
        assert.equal((await get(`${base}/metadata?${query}`)).response.status, 400, query);
        assert.equal((await post(`${base}?${query}`, requestBody())).response.status, 400, query);
      }
    }
  });
});

test('ERP demo delay is bounded and aborted work does not keep the server alive', async () => {
  await withServer(async (origin, server) => {
    const base = `${origin}${ERP_TABLE_DEMO_API_BASE}`;
    const started = performance.now();
    assert.equal((await get(`${base}/metadata?delay=40`)).response.status, 200);
    assert.ok(performance.now() - started >= 25);
    const controller = new AbortController();
    const received = new Promise<void>((resolve) => server.once('request', () => resolve()));
    const request = fetch(`${base}/metadata?delay=3000`, { signal: controller.signal });
    await received;
    controller.abort();
    await assert.rejects(request, { name: 'AbortError' });
    assert.equal((await get(`${base}/metadata?delay=0`)).response.status, 200);
  });
});
