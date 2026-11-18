import assert from 'node:assert/strict';
import { createServer, request, type OutgoingHttpHeaders } from 'node:http';
import test from 'node:test';
import { createErpDevMiddleware } from '../server/erp-dev-proxy';

const profiles = [
  {
    id: 'finance',
    baseUrl: 'https://finance.example.test/api/tables',
    cookieEnv: 'ERP_TABLE_COOKIE_FINANCE',
  },
  { id: 'travel', baseUrl: 'https://travel.example.test/api/tables', cookieEnv: 'ERP_TABLE_COOKIE_TRAVEL' },
  { id: 'public', baseUrl: 'https://demo.example.test/catalog/tables' },
  {
    id: 'ledger',
    baseUrl: 'https://finance.example.test/api/tables/ledger',
    cookieEnv: 'ERP_TABLE_COOKIE_LEDGER',
  },
];
const env = {
  ERP_TABLE_CONNECTIONS: JSON.stringify(profiles),
  ERP_TABLE_COOKIE_FINANCE: 'devSession=fixture-finance',
  ERP_TABLE_COOKIE_TRAVEL: 'devSession=fixture-travel',
  ERP_TABLE_COOKIE_LEDGER: 'devSession=fixture-ledger',
};

async function withGateway(upstream: typeof fetch, run: (origin: string) => Promise<void>) {
  const gateway = createErpDevMiddleware(env, upstream);
  const server = createServer((req, res) => {
    gateway(req, res, () => res.writeHead(200).end('downstream middleware'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('the widget can load metadata and sorted rows through the same profile without forwarding browser credentials', async () => {
  const calls: Array<{ url: string; method: string; headers: Headers; body: string }> = [];
  const upstream: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    calls.push({ url: req.url, method: req.method, headers: req.headers, body: await req.text() });
    return Response.json(
      { data: req.method === 'GET' ? { metadata: [] } : { rows: [{ id: 'one' }] } },
      {
        headers: { 'Set-Cookie': 'upstream=private', 'Cache-Control': 'public' },
      },
    );
  };
  await withGateway(upstream, async (origin) => {
    const browserHeaders = { Cookie: 'local=unrelated', Authorization: 'Bearer local-token', Origin: origin };
    const metadata = await fetch(`${origin}/__erp_tables/finance/expenses/metadata`, {
      headers: browserHeaders,
    });
    assert.equal(metadata.status, 200);
    assert.deepEqual(await metadata.json(), { data: { metadata: [] } });
    assert.equal(metadata.headers.get('set-cookie'), null);
    assert.match(metadata.headers.get('cache-control') ?? '', /no-store/i);

    const payload = {
      sorts: [{ sortParam: 'statusName', sortType: 'ASC' }],
      filters: [],
      pageable: { offset: 10, limit: 10 },
    };
    const query = '?mode=approve&group=a&group=b';
    const rows = await fetch(`${origin}/__erp_tables/finance/expenses${query}`, {
      method: 'POST',
      headers: { ...browserHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(rows.status, 200);
    assert.deepEqual(await rows.json(), { data: { rows: [{ id: 'one' }] } });
    for (const id of ['travel', 'public']) {
      const response = await fetch(`${origin}/__erp_tables/${id}/expenses/metadata`, {
        headers: browserHeaders,
      });
      assert.equal(response.status, 200);
      await response.text();
    }
    const ledger = await fetch(`${origin}/__erp_tables/ledger/metadata`, { headers: browserHeaders });
    assert.equal(ledger.status, 200);
    await ledger.text();

    assert.deepEqual(
      calls.map(({ url, method }) => [method, url]),
      [
        ['GET', profiles[0].baseUrl + '/expenses/metadata'],
        ['POST', profiles[0].baseUrl + '/expenses' + query],
        ['GET', profiles[1].baseUrl + '/expenses/metadata'],
        ['GET', profiles[2].baseUrl + '/expenses/metadata'],
        ['GET', profiles[3].baseUrl + '/metadata'],
      ],
    );
    assert.deepEqual(JSON.parse(calls[1].body), payload);
    assert.match(calls[1].headers.get('content-type') ?? '', /application\/json/i);
    assert.deepEqual(
      calls.map(({ headers }) => headers.get('cookie')),
      [
        env.ERP_TABLE_COOKIE_FINANCE,
        env.ERP_TABLE_COOKIE_FINANCE,
        env.ERP_TABLE_COOKIE_TRAVEL,
        null,
        env.ERP_TABLE_COOKIE_LEDGER,
      ],
    );
    assert.ok(calls.every(({ headers }) => !headers.has('authorization')));
  });
});

test('the local connection list exposes routing information and lets ordinary application paths fall through', async () => {
  let calls = 0;
  await withGateway(
    async () => {
      calls++;
      return Response.json({});
    },
    async (origin) => {
      const discovery = await fetch(`${origin}/__erp_tables/connections`);
      assert.equal(discovery.status, 200);
      const result = await discovery.json();
      const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
      result.connections.sort(byId);
      assert.deepEqual(result, {
        connections: profiles
          .map(({ id, baseUrl, cookieEnv }) => ({
            id,
            baseUrl,
            authenticated: Boolean(cookieEnv),
          }))
          .sort(byId),
      });
      for (const path of ['/api/demo/erp-table/expenses/metadata', '/api/resolve', '/']) {
        assert.equal(await (await fetch(origin + path)).text(), 'downstream middleware');
      }
      assert.equal(calls, 0);
    },
  );
});

test('incomplete or ambiguous profiles fail configuration before any requests can be sent', () => {
  const [base] = profiles;
  for (const connections of [
    [{ ...base, baseUrl: 'https://finance.example.test/' }],
    [{ ...base, baseUrl: 'http://finance.example.test/api/tables' }],
    [{ ...base, baseUrl: base.baseUrl + '?region=test' }],
    [{ ...base, cookieEnv: 'UNRELATED_ENVIRONMENT_VARIABLE' }],
    [{ ...base, cookieEnv: 'ERP_TABLE_COOKIE_MISSING' }],
    [base, { ...base, id: 'another', baseUrl: base.baseUrl + '/' }],
    [base, { ...base, baseUrl: profiles[1].baseUrl }],
  ]) {
    assert.throws(() =>
      createErpDevMiddleware({ ...env, ERP_TABLE_CONNECTIONS: JSON.stringify(connections) }),
    );
  }
});

// node:http preserves the request target exactly as received by the middleware.
async function statusFor(origin: string, path: string, headers: OutgoingHttpHeaders = {}, method = 'GET') {
  return new Promise<number>((resolve, reject) => {
    const req = request(origin, { path, method, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode!));
    });
    req.on('error', reject);
    req.end(method === 'POST' ? '{}' : undefined);
  });
}

test('untrusted callers and requests outside configured paths never reach the table API', async () => {
  let calls = 0;
  await withGateway(
    async () => {
      calls++;
      return Response.json({});
    },
    async (origin) => {
      const table = '/__erp_tables/finance/expenses';
      const untrusted = 'https://another.example.test';
      const json = { 'Content-Type': 'application/json' };
      for (const status of [
        await statusFor(origin, '/__erp_tables/connections', { Origin: untrusted }),
        await statusFor(origin, table, { 'Sec-Fetch-Site': 'cross-site' }),
        await statusFor(origin, table, { Host: 'another.example.test' }),
        await statusFor(origin, table, { ...json, Origin: untrusted }, 'POST'),
        await statusFor(origin, table, json, 'POST'),
        await statusFor(origin, table, { Origin: origin, 'Content-Type': 'text/plain' }, 'POST'),
        await statusFor(origin, table, { Origin: origin }, 'DELETE'),
        await statusFor(origin, '/__erp_tables/missing/expenses'),
        await statusFor(origin, '/__erp_tables/finance/ledger/metadata'),
        await statusFor(origin, '/__erp_tables/finance/%2E%2E/metadata'),
        await statusFor(origin, '/__erp_tables/finance/%252E%252E/metadata'),
      ]) {
        assert.ok(status >= 400 && status < 500, `unexpected status ${status}`);
      }
      assert.equal(calls, 0);
    },
  );
});

test('redirects never carry the developer session to a second destination or expose its location', async () => {
  const destination = 'https://other.example.test/login';
  const calls: string[] = [];
  await withGateway(
    async (input, init) => {
      const req = new Request(input, init);
      calls.push(req.url);
      assert.notEqual(req.redirect, 'follow');
      return new Response(null, {
        status: 302,
        headers: { Location: destination, 'Set-Cookie': 'other=private' },
      });
    },
    async (origin) => {
      const response = await fetch(`${origin}/__erp_tables/travel/expenses/metadata`, { redirect: 'manual' });
      assert.ok(response.status >= 400);
      assert.equal(response.headers.get('location'), null);
      assert.equal(response.headers.get('set-cookie'), null);
      assert.ok(!(await response.text()).includes(destination));
      assert.deepEqual(calls, [profiles[1].baseUrl + '/expenses/metadata']);
    },
  );
});
