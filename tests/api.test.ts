import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createServer } from '../server/app';
import type { ResolvedSplit, TemplateRecord } from '../shared/model';

let root: string;
let origin: string;
let server: Server;
async function listen(instance: Server): Promise<string> {
  await new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve));
  const address = instance.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}
async function close(instance: Server) {
  await new Promise<void>((resolve, reject) =>
    instance.close((error) => (error ? reject(error) : resolve())),
  );
}
async function request<T = unknown>(url: string, method = 'GET', data?: unknown) {
  const response = await fetch(origin + url, {
    method,
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: response.status, data: (await response.json()) as T };
}
async function newTemplate() {
  const response = await request<TemplateRecord>('/api/templates', 'POST', {
    baseId: 'fixed-asset',
    name: 'Тестовый шаблон',
  });
  assert.equal(response.status, 201);
  return response.data;
}
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'split-studio-test-'));
  server = createServer({ dataDir: root });
  origin = await listen(server);
});
after(async () => {
  await close(server);
  if (path.dirname(root) === path.resolve(tmpdir()) && path.basename(root).startsWith('split-studio-test-'))
    await rm(root, { recursive: true, force: true });
});

test('catalog, entity summaries and seeded published documents are available', async () => {
  assert.equal((await request('/api/catalog')).status, 200);
  const entities = await request<Record<string, unknown>[]>('/api/entities');
  assert.equal(entities.data.length, 3);
  assert.equal(entities.data[0].data, undefined);
  const response = await request<ResolvedSplit>('/api/resolve', 'POST', {
    templateId: 'fixed-asset',
    entityId: 'asset-001',
    mode: 'published',
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.templateRevision, 1);
  assert.ok(((response.data.data.collections as Record<string, unknown>).events as unknown[]).length >= 20);
});

test('save uses optimistic concurrency and concurrent stale requests cannot overwrite each other', async () => {
  const record = await newTemplate();
  const definition = structuredClone(record.draft);
  definition.name = 'Изменено';
  const results = await Promise.all([
    request('/api/templates/' + record.id, 'PUT', { definition, expectedDraftVersion: 1 }),
    request('/api/templates/' + record.id, 'PUT', {
      definition: { ...definition, name: 'Другая версия' },
      expectedDraftVersion: 1,
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const persisted = await request<TemplateRecord>('/api/templates/' + record.id);
  assert.equal(persisted.data.draftVersion, 2);
});

test('published revisions are immutable, draft changes are isolated and rollback moves only the active revision', async () => {
  let record = await newTemplate();
  let response = await request<TemplateRecord>(`/api/templates/${record.id}/publish`, 'POST', {
    expectedDraftVersion: record.draftVersion,
  });
  assert.equal(response.status, 200);
  record = response.data;
  const originalName = record.versions[0].definition.name;
  const definition = structuredClone(record.draft);
  definition.name = 'Новая опубликованная версия';
  record = (
    await request<TemplateRecord>(`/api/templates/${record.id}`, 'PUT', {
      definition,
      expectedDraftVersion: record.draftVersion,
    })
  ).data;
  let resolved = await request<ResolvedSplit>('/api/resolve', 'POST', {
    templateId: record.id,
    entityId: 'asset-001',
    mode: 'published',
  });
  assert.equal(resolved.data.definition.name, originalName);
  record = (
    await request<TemplateRecord>(`/api/templates/${record.id}/publish`, 'POST', {
      expectedDraftVersion: record.draftVersion,
    })
  ).data;
  assert.equal(record.versions[0].definition.name, originalName);
  assert.equal(record.activeRevision, 2);
  record = (await request<TemplateRecord>(`/api/templates/${record.id}/activate`, 'POST', { revision: 1 }))
    .data;
  assert.equal(record.activeRevision, 1);
  assert.equal(record.draft.name, definition.name);
  assert.equal(record.versions.length, 2);
  resolved = await request<ResolvedSplit>('/api/resolve', 'POST', {
    templateId: record.id,
    entityId: 'asset-001',
    mode: 'published',
  });
  assert.equal(resolved.data.definition.name, originalName);
});

test('invalid drafts may be saved but publish and preview reject them with scoped issues', async () => {
  let record = await newTemplate();
  const definition = structuredClone(record.draft);
  definition.tabs[0].nodes[0] = {
    id: 'unknown-data',
    type: 'text',
    title: 'Ошибка',
    binding: 'asset.__proto__.secret',
    collapsible: false,
  };
  record = (
    await request<TemplateRecord>(`/api/templates/${record.id}`, 'PUT', {
      definition,
      expectedDraftVersion: record.draftVersion,
    })
  ).data;
  const check = await request<{ nodeId?: string }[]>(`/api/templates/${record.id}/validate`, 'POST', {});
  assert.ok(check.data.some((i) => i.nodeId === 'unknown-data'));
  assert.equal(
    (
      await request(`/api/templates/${record.id}/publish`, 'POST', {
        expectedDraftVersion: record.draftVersion,
      })
    ).status,
    422,
  );
  const preview = await request<{ issues: { nodeId?: string }[] }>('/api/resolve', 'POST', {
    templateId: record.id,
    entityId: 'asset-001',
    mode: 'draft',
  });
  assert.equal(preview.status, 422);
  assert.ok(preview.data.issues.some((i) => i.nodeId === 'unknown-data'));
});

test('published definitions cannot be overridden and runtime respects client capabilities', async () => {
  const record = (await request<TemplateRecord>('/api/templates/fixed-asset')).data;
  assert.equal(
    (
      await request('/api/resolve', 'POST', {
        templateId: record.id,
        entityId: 'asset-001',
        mode: 'published',
        definition: record.draft,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/api/resolve', 'POST', {
        templateId: record.id,
        entityId: 'asset-001',
        mode: 'draft',
        capabilities: { nodeTypes: ['fields'], widgetIds: [] },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request('/api/resolve', 'POST', {
        templateId: record.id,
        entityId: 'asset-001',
        mode: 'draft',
        capabilities: { nodeTypes: 'fields' },
      })
    ).status,
    400,
  );
});

test('missing records, malformed input and unimplemented writes return explicit errors', async () => {
  assert.equal((await request('/api/templates/missing')).status, 404);
  assert.equal((await request('/api/entities/asset-001', 'PUT', { title: 'Mutated' })).status, 404);
  assert.equal(
    (
      await request('/api/resolve', 'POST', {
        templateId: 'fixed-asset',
        entityId: 'asset-001',
        mode: 'draft',
        scenario: 'invalid',
      })
    ).status,
    400,
  );
  const malformed = await fetch(origin + '/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken',
  });
  assert.equal(malformed.status, 400);
  const plain = await fetch(origin + '/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{"name":"Untrusted form"}',
  });
  assert.equal(plain.status, 415);
  assert.equal(
    (await request('/api/resolve', 'POST', { templateId: 'fixed-asset', entityId: 'missing', mode: 'draft' }))
      .status,
    404,
  );
});

test('atomic JSON persistence survives a second server instance', async () => {
  const record = await newTemplate();
  const second = createServer({ dataDir: root });
  const secondOrigin = await listen(second);
  try {
    const response = await fetch(`${secondOrigin}/api/templates/${record.id}`);
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as TemplateRecord).draft.name, record.draft.name);
    const stored = JSON.parse(await readFile(path.join(root, 'templates.json'), 'utf8')) as TemplateRecord[];
    assert.ok(stored.some((item) => item.id === record.id));
  } finally {
    await close(second);
  }
});

test('production serves SPA assets while rejecting traversal, hidden files and API fallbacks', async () => {
  const dist = path.join(root, 'dist');
  await mkdir(path.join(dist, 'assets'), { recursive: true });
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>Split Studio</title>');
  await writeFile(path.join(dist, 'assets', 'app.js'), 'console.log("demo")');
  await writeFile(path.join(dist, '.env'), 'DO_NOT_SERVE=true');
  const production = createServer({ dataDir: root, production: true, distDir: dist });
  const url = await listen(production);
  try {
    const page = await fetch(url + '/constructor/template-1');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Split Studio/);
    const asset = await fetch(url + '/assets/app.js');
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type')!, /javascript/);
    assert.equal((await fetch(url + '/..%2Ftemplates.json')).status, 400);
    assert.equal((await fetch(url + '/.env')).status, 400);
    assert.equal((await fetch(url + '/package.json')).status, 404);
    const api = await fetch(url + '/api/unknown');
    assert.equal(api.status, 404);
    assert.match(api.headers.get('content-type')!, /json/);
  } finally {
    await close(production);
  }
});
