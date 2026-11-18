import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTableRoute,
  suggestedTableBaseUrl,
  tableMetadataUrl,
} from '../src/runtime/erp-table-connections';

const studioOrigin = 'http://127.0.0.1:5173';
const api = { id: 'qa', baseUrl: 'https://qa.example.test/api', authenticated: false };
const tables = { id: 'expenses', baseUrl: api.baseUrl + '/tables', authenticated: true };
const ready = { status: 'ready' as const, connections: [api, tables] };

test('a full table URL uses the most specific connection and stays local with a custom SDK baseURL', () => {
  const url = tables.baseUrl + '/year%202026/expenses?mode=approve&tag=a&tag=b';
  const route = resolveTableRoute(url, ready, studioOrigin);
  assert.equal(route.kind, 'proxy');
  if (route.kind !== 'proxy') return;
  assert.equal(route.connection, tables);
  assert.equal(
    route.url,
    studioOrigin + '/__erp_tables/expenses/year%202026/expenses?mode=approve&tag=a&tag=b',
  );
  assert.equal(new URL(route.url, 'https://different.example.test').origin, studioOrigin);
  assert.equal(
    tableMetadataUrl(route.url),
    studioOrigin + '/__erp_tables/expenses/year%202026/expenses/metadata?mode=approve&tag=a&tag=b',
  );
  assert.equal(resolveTableRoute(tables.baseUrl, ready, studioOrigin).kind, 'proxy');
});

test('profile selection requires the right source origin, port and path segment', () => {
  for (const url of [
    '/api/demo/erp-table/expenses',
    studioOrigin + '/api/demo/erp-table/expenses',
    'https://qa.example.test/api2/expenses',
    'https://qa.example.test:8443/api/tables/expenses',
    'https://qa.example.test.other.test/api/tables/expenses',
    'http://qa.example.test/api/tables/expenses',
  ]) {
    assert.deepEqual(resolveTableRoute(url, ready, studioOrigin), { kind: 'direct', url });
  }
});

test('profile ownership compares decoded segments and forwards the original suffix and query', () => {
  const encoded = { ...tables, baseUrl: 'https://qa.example.test/%61pi/tabl%65s' };
  const state = { status: 'ready' as const, connections: [api, encoded] };
  const route = resolveTableRoute(tables.baseUrl + '/%72ows/%D0%90?tag=%2F&tag=B', state, studioOrigin);
  assert.deepEqual(route, {
    kind: 'proxy',
    connection: encoded,
    url: studioOrigin + '/__erp_tables/expenses/%72ows/%D0%90?tag=%2F&tag=B',
  });
  for (const suffix of ['%2Fescaped', '%252Fescaped', '../other', 'double//slash', 'bad%']) {
    assert.equal(resolveTableRoute(tables.baseUrl + '/' + suffix, state, studioOrigin).kind, 'error');
  }
});

test('the setup example suggests the API directory and only interpolates dotenv-safe addresses', () => {
  assert.equal(suggestedTableBaseUrl(tables.baseUrl + '/expenses?mode=ok#section'), tables.baseUrl);
  assert.equal(
    suggestedTableBaseUrl('https://qa.example.test:8443/expenses?token=hidden'),
    'https://qa.example.test:8443/expenses',
  );
  assert.equal(
    suggestedTableBaseUrl("https://qa.example.test/a'b/$value/expenses"),
    'https://qa.example.test/a%27b/%24value',
  );
  for (const url of [
    'https://person:secret@qa.test/tables/expenses',
    'https://$name.example.test/api/tables',
    'https://qa.test/a%0Ab/expenses',
    '/api/local',
    'https://qa.test/',
  ]) {
    assert.equal(suggestedTableBaseUrl(url), 'https://erp.example.test/api/tables');
  }
});

test('external widgets wait for connection metadata and fail visibly if it is unavailable', () => {
  const url = tables.baseUrl + '/expenses';
  assert.equal(resolveTableRoute(url, { status: 'loading' }, studioOrigin).kind, 'pending');
  assert.equal(resolveTableRoute(url, { status: 'error' }, studioOrigin).kind, 'error');
  assert.deepEqual(resolveTableRoute(url, undefined, ''), { kind: 'direct', url });
  assert.equal(
    resolveTableRoute('/api/demo/erp-table/expenses', { status: 'error' }, studioOrigin).kind,
    'direct',
  );
  assert.equal(
    resolveTableRoute(url.replace('https://', 'https://user@'), ready, studioOrigin).kind,
    'error',
  );
});
