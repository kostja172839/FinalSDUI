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
  { id: 'stand', baseUrl: 'https://finance.example.test/', cookieEnv: 'ERP_TABLE_COOKIE_STAND' },
  { id: 'sandbox', baseUrl: 'https://sandbox.example.test' },
];
const env = {
  ERP_TABLE_CONNECTIONS: JSON.stringify(profiles),
  ERP_TABLE_COOKIE_FINANCE: 'devSession=fixture-finance',
  ERP_TABLE_COOKIE_TRAVEL: 'devSession=fixture-travel',
  ERP_TABLE_COOKIE_LEDGER: 'devSession=fixture-ledger',
  ERP_TABLE_COOKIE_STAND: 'devSession=fixture-stand',
};

async function withGateway(
  upstream: typeof fetch,
  run: (origin: string) => Promise<void>,
  config: Record<string, string> = env,
) {
  const gateway = createErpDevMiddleware(config, upstream);
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
            baseUrl: baseUrl.replace(/\/$/, ''),
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

test('invalid ERP configuration reports a local diagnostic and keeps the rest of Studio available', async () => {
  const [base] = profiles;
  const invalid = [
    [profiles[4], { ...profiles[4], id: 'another', baseUrl: 'https://finance.example.test' }],
    [{ ...base, baseUrl: 'http://finance.example.test/api/tables' }],
    [{ ...base, baseUrl: base.baseUrl + '?region=test' }],
    [{ ...base, cookieEnv: 'UNRELATED_ENVIRONMENT_VARIABLE' }],
    [{ ...base, cookieEnv: 'ERP_TABLE_COOKIE_MISSING' }],
    [base, { ...base, id: 'another', baseUrl: base.baseUrl + '/' }],
    [base, { ...base, baseUrl: profiles[1].baseUrl }],
  ].map((connections) => JSON.stringify(connections));
  invalid.push('bad-json=fixture-sensitive-value');
  for (const raw of invalid) {
    await withGateway(
      async () => assert.fail('a broken configuration must not forward ERP requests'),
      async (origin) => {
        for (const path of ['/__erp_tables/connections', '/__erp_tables/finance/expenses/metadata']) {
          const response = await fetch(origin + path);
          assert.equal(response.status, 503);
          const result = await response.json();
          assert.deepEqual(Object.keys(result), ['message']);
          assert.ok(typeof result.message === 'string' && result.message.trim());
          for (const secret of [env.ERP_TABLE_COOKIE_FINANCE, 'fixture-sensitive-value']) {
            assert.ok(!result.message.includes(secret));
          }
        }
        assert.equal(await (await fetch(origin + '/api/health')).text(), 'downstream middleware');
      },
      { ...env, ERP_TABLE_CONNECTIONS: raw },
    );
  }
});

test('a stand origin forwards metadata and row queries under nested table mounts', async () => {
  const calls: Array<[string, string, string | null, string]> = [];
  const rowQuery = JSON.stringify({
    filters: [],
    sorts: [{ sortParam: 'statusName', sortType: 'ASC' }],
    pageable: { offset: 10, limit: 10 },
  });
  const query = '?mode=approve&tag=a&tag=b';
  await withGateway(
    async (input, init) => {
      const req = new Request(input, init);
      calls.push([req.method, req.url, req.headers.get('cookie'), await req.text()]);
      return Response.json({ data: {} });
    },
    async (origin) => {
      for (const [id, path] of [
        ['stand', '/reports/v2/tables/expenses'],
        ['sandbox', '/api/demo/erp-table/product-events'],
      ]) {
        const registry = origin + '/__erp_tables/' + id + path;
        assert.equal((await fetch(registry + '/metadata' + query)).status, 200);
        assert.equal(
          (
            await fetch(registry + query, {
              method: 'POST',
              headers: { Origin: origin, 'Content-Type': 'application/json' },
              body: rowQuery,
            })
          ).status,
          200,
        );
      }
      const reports = 'https://finance.example.test/reports/v2/tables/expenses';
      const events = 'https://sandbox.example.test/api/demo/erp-table/product-events';
      assert.deepEqual(calls, [
        ['GET', reports + '/metadata' + query, env.ERP_TABLE_COOKIE_STAND, ''],
        ['POST', reports + query, env.ERP_TABLE_COOKIE_STAND, rowQuery],
        ['GET', events + '/metadata' + query, null, ''],
        ['POST', events + query, null, rowQuery],
      ]);
    },
  );
});

test('a stand origin accepts only table reads and defers to the configured API path owner', async () => {
  let calls = 0;
  await withGateway(
    async () => {
      calls++;
      return Response.json({});
    },
    async (origin) => {
      const url = origin + '/__erp_tables/stand';
      const registry = url + '/reports/tables/expenses';
      const post = (target: string, data: unknown) =>
        fetch(target, {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      const readQuery = { sorts: [], filters: [], pageable: { offset: 0, limit: 10 } };
      for (const response of [
        await fetch(url + '/reports/configuration/metadata'),
        await fetch(registry),
        await post(registry + '/metadata', readQuery),
        await post(url + '/reports/settings', readQuery),
        await post(registry, { title: 'New item' }),
        await post(registry, { ...readQuery, pageable: 'invalid' }),
        await fetch(url + '/api/tables/expenses/metadata'),
      ]) {
        assert.ok(response.status >= 400 && response.status < 500, `unexpected status ${response.status}`);
      }
      assert.equal(calls, 0);
    },
  );
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

test('network failures identify DNS and TLS problems without exposing transport details', async () => {
  const rawDetail = 'sensitive raw detail';
  for (const [code, diagnostic] of [
    ['ENOTFOUND', /DNS/i],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', /сертификат/i],
  ] as const) {
    await withGateway(
      async () => {
        const cause = Object.assign(new Error(rawDetail), { code });
        throw new TypeError('fetch failed', { cause });
      },
      async (origin) => {
        const response = await fetch(origin + '/__erp_tables/finance/expenses/metadata');
        assert.equal(response.status, 502);
        assert.equal(response.headers.get('x-erp-proxy-error'), '1');
        const data = await response.json();
        assert.deepEqual(Object.keys(data), ['message']);
        assert.match(data.message, diagnostic);
        for (const detail of [rawDetail, profiles[0].baseUrl, env.ERP_TABLE_COOKIE_FINANCE, '\n    at ']) {
          assert.ok(!data.message.includes(detail));
        }
      },
    );
  }
});

test('an upstream JSON 502 is distinguishable from a locally generated error', async () => {
  const body = { message: 'service unavailable' };
  await withGateway(
    async () => Response.json(body, { status: 502, headers: { 'X-Erp-Proxy-Error': '1' } }),
    async (origin) => {
      const response = await fetch(origin + '/__erp_tables/finance/expenses/metadata');
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('x-erp-proxy-error'), null);
      assert.deepEqual(await response.json(), body);
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
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('x-erp-proxy-error'), '1');
      assert.equal(response.headers.get('location'), null);
      assert.equal(response.headers.get('set-cookie'), null);
      const data = await response.json();
      assert.deepEqual(Object.keys(data), ['message']);
      assert.match(data.message, /перенаправ/i);
      assert.ok(!data.message.includes(destination));
      assert.deepEqual(calls, [profiles[1].baseUrl + '/expenses/metadata']);
    },
  );
});
