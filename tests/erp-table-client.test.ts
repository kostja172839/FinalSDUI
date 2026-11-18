import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ERP_TABLE_DEMO_API_URL,
  erpDemoRequestUrls,
  fetchErpDemoMetadata,
  fetchErpDemoRows,
  type ErpDemoRowsRequest,
} from '../src/demo/erp-table-client';
import { erpTableMockMeta, erpTableMockData } from '../src/demo/erp-table-fixture';

function fakeFetch(value: unknown, status = 200) {
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const implementation: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, implementation };
}

test('ERP demo client resolves only its explicit local protocol and retains scenario/delay on both requests', () => {
  assert.deepEqual(erpDemoRequestUrls(`${ERP_TABLE_DEMO_API_URL}?scenario=empty&delay=250`), {
    metadataUrl: `${ERP_TABLE_DEMO_API_URL}/metadata?scenario=empty&delay=250`,
    rowsUrl: `${ERP_TABLE_DEMO_API_URL}?scenario=empty&delay=250`,
  });
  assert.deepEqual(
    erpDemoRequestUrls('/demo/erp-table?scenario=error&delay=0'),
    erpDemoRequestUrls(`${ERP_TABLE_DEMO_API_URL}?scenario=error&delay=0`),
  );
  assert.equal(erpDemoRequestUrls('/demo/erp-table').metadataUrl, `${ERP_TABLE_DEMO_API_URL}/metadata`);
  for (const value of [
    'https://foreign.example/api/demo/erp-table/product-events',
    '//foreign.example/x',
    '/private/table',
    '/api/other/../demo/erp-table/product-events',
    '/demo\\erp-table',
    '/demo/erp-table#rows',
    '/demo/erp-table?scenario=unknown',
    '/demo/erp-table?delay=3001',
    '/demo/erp-table?delay=-1',
    '/demo/erp-table?delay=1.5',
    '/demo/erp-table?scenario=normal&scenario=empty',
    '/demo/erp-table?url=https://foreign.example',
  ])
    assert.throws(() => erpDemoRequestUrls(value), Error, value);
});

test('expense rows retain business context query while metadata uses only demo scenario/delay', () => {
  const base = '/api/demo/erp-table/expenses';
  assert.deepEqual(
    erpDemoRequestUrls(
      `${base}?mode=approve&accounting-template-code=DEMO_EXPENSES&scenario=normal&delay=15`,
    ),
    {
      metadataUrl: `${base}/metadata?scenario=normal&delay=15`,
      rowsUrl: `${base}?mode=approve&accounting-template-code=DEMO_EXPENSES&scenario=normal&delay=15`,
    },
  );
  assert.deepEqual(erpDemoRequestUrls(`${base}?mode=approve&accounting-template-code=DEMO_EXPENSES`), {
    metadataUrl: `${base}/metadata`,
    rowsUrl: `${base}?mode=approve&accounting-template-code=DEMO_EXPENSES`,
  });
});

test('metadata uses GET, same-origin credentials, redirect rejection and preserves the raw contract', async () => {
  const fake = fakeFetch(erpTableMockMeta);
  const abort = new AbortController();
  const result = await fetchErpDemoMetadata(
    '/demo/erp-table?scenario=normal&delay=12',
    abort.signal,
    fake.implementation,
  );
  assert.deepEqual(result, erpTableMockMeta);
  assert.equal(fake.calls[0].input, `${ERP_TABLE_DEMO_API_URL}/metadata?scenario=normal&delay=12`);
  assert.equal(fake.calls[0].init?.method, 'GET');
  assert.equal(fake.calls[0].init?.credentials, 'same-origin');
  assert.equal(fake.calls[0].init?.redirect, 'error');
  assert.equal(fake.calls[0].init?.signal, abort.signal);
  assert.equal(fake.calls[0].init?.body, undefined);
});

test('rows POST the observed sorts/filters/pageable body to the exact table URL without rewriting rows', async () => {
  const fake = fakeFetch(erpTableMockData);
  const request: ErpDemoRowsRequest = {
    sorts: [{ sortParam: 'statusName', sortType: 'ASC' }],
    filters: [
      {
        predicateHighLevel: 'AND',
        fieldName: 'reportId',
        search: ['demo-report-alpha'],
        predicateLowLevel: 'EQ',
      },
    ],
    pageable: { offset: 10, limit: 5 },
  };
  const original = structuredClone(request);
  const result = await fetchErpDemoRows(ERP_TABLE_DEMO_API_URL, request, undefined, fake.implementation);
  assert.deepEqual(result, erpTableMockData);
  assert.deepEqual(request, original);
  const { input, init } = fake.calls[0];
  assert.equal(input, `${ERP_TABLE_DEMO_API_URL}`);
  assert.equal(init?.method, 'POST');
  assert.equal(init?.credentials, 'same-origin');
  assert.equal(init?.redirect, 'error');
  assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(String(init?.body)), request);
});

test('unsupported URLs are rejected before fetching', async () => {
  const fake = fakeFetch(erpTableMockData);
  await assert.rejects(
    fetchErpDemoRows(
      'https://foreign.example/',
      { sorts: [], filters: [], pageable: { offset: 0, limit: 5 } },
      undefined,
      fake.implementation,
    ),
    /локальн|адрес/,
  );
  assert.equal(fake.calls.length, 0);
});

test('malformed metadata and rows produce actionable errors rather than cast failures', async () => {
  for (const metadata of [
    null,
    { data: {} },
    { data: { metadata: {} } },
    { data: { metadata: [null] } },
    { data: { metadata: [{ fieldName: 12 }] } },
  ])
    await assert.rejects(
      fetchErpDemoMetadata(ERP_TABLE_DEMO_API_URL, undefined, fakeFetch(metadata).implementation),
      /некорректные метаданные/,
    );
  for (const rows of [
    null,
    { data: {} },
    { data: { rows: {}, page: {} } },
    { data: { rows: [null], page: { offset: 0, limit: 5, count: 1, totalElements: 1 } } },
    { data: { rows: [], page: { offset: '0', limit: 5, count: 0, totalElements: 0 } } },
    {
      data: { rows: [{ fields: 'not-an-array' }], page: { offset: 0, limit: 5, count: 1, totalElements: 1 } },
    },
  ])
    await assert.rejects(
      fetchErpDemoRows(
        ERP_TABLE_DEMO_API_URL,
        { sorts: [], filters: [], pageable: { offset: 0, limit: 5 } },
        undefined,
        fakeFetch(rows).implementation,
      ),
      /некорректные строки/,
    );
});

test('JSON errors retain readable error/message; non-JSON and HTTP failures have clear fallbacks', async () => {
  for (const body of [{ error: 'Источник временно недоступен' }, { message: 'Источник временно недоступен' }])
    await assert.rejects(
      fetchErpDemoMetadata(ERP_TABLE_DEMO_API_URL, undefined, fakeFetch(body, 503).implementation),
      /Источник временно недоступен.*503/,
    );
  const html: typeof fetch = async () => new Response('<html>Proxy error</html>', { status: 503 });
  await assert.rejects(fetchErpDemoMetadata(ERP_TABLE_DEMO_API_URL, undefined, html), /HTTP 503/);
  const badJson: typeof fetch = async () => new Response('not JSON', { status: 200 });
  await assert.rejects(fetchErpDemoMetadata(ERP_TABLE_DEMO_API_URL, undefined, badJson), /не в формате JSON/);
  await assert.rejects(
    fetchErpDemoRows(
      ERP_TABLE_DEMO_API_URL,
      { sorts: [], filters: [], pageable: { offset: 0, limit: 5 } },
      undefined,
      fakeFetch({}, 503).implementation,
    ),
    /HTTP 503/,
  );
});

test('abort signals reach both requests and AbortError is preserved', async () => {
  const abort = new AbortController();
  abort.abort();
  const error = new DOMException('Operation aborted', 'AbortError');
  const fake: typeof fetch = async (_input, init) => {
    assert.equal(init?.signal, abort.signal);
    throw error;
  };
  await assert.rejects(
    fetchErpDemoMetadata(ERP_TABLE_DEMO_API_URL, abort.signal, fake),
    (actual) => actual === error,
  );
  await assert.rejects(
    fetchErpDemoRows(
      ERP_TABLE_DEMO_API_URL,
      { sorts: [], filters: [], pageable: { offset: 0, limit: 5 } },
      abort.signal,
      fake,
    ),
    (actual) => actual === error,
  );
  const abortedBody: typeof fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(error);
        },
      }),
    );
  await assert.rejects(
    fetchErpDemoMetadata(ERP_TABLE_DEMO_API_URL, abort.signal, abortedBody),
    (actual) => actual === error,
  );
});

test('malformed raw ERP cell values fail before the renderer, while null, arrays and boolean strings pass unchanged', async () => {
  const envelope = (field: unknown) => ({
    data: { rows: [{ fields: [field] }], page: { offset: 0, limit: 5, count: 1, totalElements: 1 } },
    messages: [],
  });
  const request: ErpDemoRowsRequest = { sorts: [], filters: [], pageable: { offset: 0, limit: 5 } };
  for (const value of [
    [null],
    [{ techValue: 'x' }],
    [{ value: 'x' }],
    [{ value: {}, techValue: 'x' }],
    ['x', { value: 'y', techValue: 'y' }],
    {},
    12,
    true,
    false,
    undefined,
  ]) {
    await assert.rejects(
      fetchErpDemoRows(
        ERP_TABLE_DEMO_API_URL,
        request,
        undefined,
        fakeFetch(envelope({ fieldName: 'value', value })).implementation,
      ),
      /некорректные строки/,
    );
  }
  for (const field of [
    { fieldName: 'value', value: 'x', subValue: {} },
    { fieldName: 'value', value: 'x', badgeId: {} },
  ])
    await assert.rejects(
      fetchErpDemoRows(ERP_TABLE_DEMO_API_URL, request, undefined, fakeFetch(envelope(field)).implementation),
      /некорректные строки/,
    );
  for (const value of [
    null,
    '',
    'true',
    'false',
    [],
    ['x', 'y'],
    [{ value: 'Печать', techValue: 'print' }],
  ]) {
    const raw = envelope({ fieldName: 'value', value, subValue: null, badgeId: 'state' });
    assert.deepEqual(
      await fetchErpDemoRows(ERP_TABLE_DEMO_API_URL, request, undefined, fakeFetch(raw).implementation),
      raw,
    );
  }
});

test('used metadata properties and pagination bounds are checked without rewriting valid private envelopes', async () => {
  for (const column of [
    { fieldName: 'x', fieldTitle: {} },
    { fieldName: 'x', type: ['array'] },
    { fieldName: 'x', type: 'script' },
    { fieldName: 'x', minimalWidth: '180' },
    { fieldName: 'x', minimalWidth: -1 },
  ])
    await assert.rejects(
      fetchErpDemoMetadata(
        ERP_TABLE_DEMO_API_URL,
        undefined,
        fakeFetch({ data: { metadata: [column] } }).implementation,
      ),
      /некорректные метаданные/,
    );
  const meta = {
    data: {
      metadata: [{ fieldName: 'x', fieldTitle: null, minimalWidth: null, type: 'boolean', dataType: null }],
      badges: null,
      emptyTableDescription: null,
    },
  };
  assert.deepEqual(
    await fetchErpDemoMetadata(ERP_TABLE_DEMO_API_URL, undefined, fakeFetch(meta).implementation),
    meta,
  );
  for (const malformed of [
    { metadata: [], badges: {} },
    { metadata: [], emptyTableDescription: {} },
    { metadata: [], badges: [{ badgeId: 'x', view: {} }] },
  ])
    await assert.rejects(
      fetchErpDemoMetadata(ERP_TABLE_DEMO_API_URL, undefined, fakeFetch({ data: malformed }).implementation),
      /некорректные метаданные/,
    );
  const request: ErpDemoRowsRequest = { sorts: [], filters: [], pageable: { offset: 0, limit: 5 } };
  const basePage = { offset: 0, limit: 5, count: 1, totalElements: 1 };
  for (const page of [
    { ...basePage, offset: 0.5 },
    { ...basePage, offset: 1_000_001 },
    { ...basePage, limit: 0 },
    { ...basePage, limit: 101 },
    { ...basePage, count: 2 },
    { ...basePage, totalElements: 0 },
    { ...basePage, offset: 1 },
    { ...basePage, totalElements: Number.MAX_SAFE_INTEGER + 1 },
  ])
    await assert.rejects(
      fetchErpDemoRows(
        ERP_TABLE_DEMO_API_URL,
        request,
        undefined,
        fakeFetch({ data: { rows: [{ fields: [] }], page } }).implementation,
      ),
      /некорректные строки/,
    );
  const beyondEnd = {
    data: { rows: [], page: { offset: 100, limit: 5, count: 0, totalElements: 16 } },
    messages: [],
  };
  assert.deepEqual(
    await fetchErpDemoRows(ERP_TABLE_DEMO_API_URL, request, undefined, fakeFetch(beyondEnd).implementation),
    beyondEnd,
  );
});

test('observed nullable fields, additionalInfo and page limit are accepted with raw filter payload unchanged', async () => {
  const raw = {
    data: {
      rows: [
        {
          fields: [
            { fieldName: 'statusName', value: 'Готово', label: null, badgeId: null, iconId: null },
            { fieldName: 'taxIndicator', value: null, label: null, badgeId: null, iconId: null },
          ],
          actions: ['view'],
        },
      ],
      additionalInfo: null,
      page: { offset: 0, limit: null, count: 1, totalElements: 1 },
    },
    messages: [],
  };
  const request: ErpDemoRowsRequest = {
    sorts: [],
    filters: [
      {
        predicateHighLevel: 'AND',
        fieldName: 'reportId',
        search: ['demo-report-alpha', null],
        predicateLowLevel: 'IN',
      },
    ],
    pageable: { offset: 0, limit: 10 },
  };
  const fake = fakeFetch(raw);
  const result = await fetchErpDemoRows(
    '/api/demo/erp-table/expenses?mode=approve&accounting-template-code=DEMO_EXPENSES',
    request,
    undefined,
    fake.implementation,
  );
  assert.deepEqual(result, raw);
  assert.equal(
    fake.calls[0].input,
    '/api/demo/erp-table/expenses?mode=approve&accounting-template-code=DEMO_EXPENSES',
  );
  assert.deepEqual(JSON.parse(String(fake.calls[0].init?.body)), request);
  for (const key of ['label', 'badgeId', 'iconId']) {
    const malformed = structuredClone(raw) as unknown as {
      data: { rows: { fields: Record<string, unknown>[] }[] };
    };
    malformed.data.rows[0].fields[0][key] = {};
    await assert.rejects(
      fetchErpDemoRows(
        '/api/demo/erp-table/expenses',
        request,
        undefined,
        fakeFetch(malformed).implementation,
      ),
      /некорректные строки/,
    );
  }
});
