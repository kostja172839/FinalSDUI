import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type ServerOptions } from '../server/app';
import { catalog } from '../shared/catalog';
import type { Catalog, ResolvedSplit, TemplateRecord } from '../shared/model';

async function withApi(
  options: Omit<ServerOptions, 'dataDir'>,
  run: (
    request: <T>(route: string, method?: string, data?: unknown) => Promise<{ status: number; data: T }>,
  ) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'split-data-test-'));
  const server = createServer({ ...options, dataDir: directory });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await run(async <T>(route: string, method = 'GET', data?: unknown) => {
      const response = await fetch(origin + route, {
        method,
        ...(data !== undefined
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
          : {}),
      });
      return { status: response.status, data: (await response.json()) as T };
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    const resolvedDirectory = path.resolve(directory);
    if (
      path.dirname(resolvedDirectory) === path.resolve(tmpdir()) &&
      path.basename(resolvedDirectory).startsWith('split-data-test-')
    )
      await rm(resolvedDirectory, { recursive: true, force: true });
  }
}

test('draft API accepts arbitrary preview JSON without a seeded entity and published API rejects overrides', async () => {
  await withApi({}, async (request) => {
    const data = {
      customer: { id: 'customer-901', title: 'Совершенно другой объект', amount: 0 },
      documents: [{ caption: 'Акт' }],
    };
    const response = await request<ResolvedSplit>('/api/resolve', 'POST', {
      templateId: 'fixed-asset',
      entityId: 'customer-901',
      mode: 'draft',
      previewData: data,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.data.data, data);
    assert.equal(response.data.entityVersion, 'preview');
    assert.equal(
      (
        await request('/api/resolve', 'POST', {
          templateId: 'fixed-asset',
          entityId: 'asset-001',
          mode: 'published',
          previewData: data,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/api/resolve', 'POST', {
          templateId: 'fixed-asset',
          entityId: 'asset-001',
          mode: 'draft',
          previewData: [],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/api/resolve', 'POST', {
          templateId: 'fixed-asset',
          entityId: 'asset-001',
          mode: 'draft',
          previewData: JSON.parse('{"constructor": {}}'),
        })
      ).status,
      400,
    );
  });
});

test('a server-owned provider and catalog drive publication and runtime for arbitrary enterprise data', async () => {
  const privateCatalog: Catalog = {
    ...catalog,
    widgets: [
      {
        id: 'enterprise-audit',
        name: 'История согласования',
        description: 'Зарегистрированный микрофронт',
        mode: 'external',
        version: '2',
        connectorName: '@Company/audit/widget',
      },
    ],
  };
  const requests: [string, string][] = [];
  const providerData = {
    response: { title: 'Заявка №901', applicant: { fullName: 'Дарья Викторовна' }, attachments: [] },
  };
  await withApi(
    {
      catalog: privateCatalog,
      listEntities: async () => [
        { id: 'claim-901', type: 'claim', title: 'Заявка №901', status: 'Новая', inventoryNumber: '' },
      ],
      loadEntity: async (entityId, entityType) => {
        requests.push([entityId, entityType]);
        return entityId === 'claim-901' ? { data: providerData, version: 'enterprise-v9' } : undefined;
      },
    },
    async (request) => {
      assert.deepEqual((await request<Catalog>('/api/catalog')).data, privateCatalog);
      const summaries = await request<{ id: string }[]>('/api/entities');
      assert.deepEqual(
        summaries.data.map((entity) => entity.id),
        ['claim-901'],
      );
      let record = (await request<TemplateRecord>('/api/templates', 'POST', { name: 'Заявка' })).data;
      const definition = structuredClone(record.draft);
      definition.entityType = 'claim';
      definition.header.titleBinding = 'response.title';
      definition.header.actions = [
        {
          id: 'audit-action',
          kind: 'openWidget',
          label: 'История согласования',
          widgetId: 'enterprise-audit',
          props: { requestId: { kind: 'binding', path: '$context.entityId' } },
        },
      ];
      definition.tabs = [
        {
          id: 'claim-tab',
          title: 'Заявка',
          nodes: [
            {
              id: 'claim-fields',
              title: 'Заявитель',
              type: 'fields',
              columns: 1,
              fields: [
                { id: 'claim-name', label: 'ФИО', binding: 'response.applicant.fullName', format: 'person' },
              ],
            },
          ],
        },
      ];
      definition.footer.actions = [];
      delete definition.footer.widgetId;
      delete definition.footer.actionLabel;
      record = (
        await request<TemplateRecord>(`/api/templates/${record.id}`, 'PUT', {
          definition,
          expectedDraftVersion: record.draftVersion,
        })
      ).data;
      assert.equal(
        (await request<unknown[]>(`/api/templates/${record.id}/validate`, 'POST', {})).data.length,
        0,
      );
      const published = await request<TemplateRecord>(`/api/templates/${record.id}/publish`, 'POST', {
        expectedDraftVersion: record.draftVersion,
      });
      assert.equal(published.status, 200);
      const resolved = await request<ResolvedSplit>('/api/resolve', 'POST', {
        templateId: record.id,
        entityId: 'claim-901',
        mode: 'published',
      });
      assert.equal(resolved.status, 200);
      assert.deepEqual(resolved.data.data, providerData);
      assert.equal(resolved.data.entityVersion, 'enterprise-v9');
      assert.deepEqual(requests, [['claim-901', 'claim']]);
      assert.equal(
        (
          await request('/api/resolve', 'POST', {
            templateId: record.id,
            entityId: 'missing',
            mode: 'published',
          })
        ).status,
        404,
      );
      const invalid = structuredClone(definition);
      invalid.header.actions![0].widgetId = 'untrusted-widget';
      const forgedCatalog = {
        ...privateCatalog,
        widgets: [...privateCatalog.widgets, { ...privateCatalog.widgets[0], id: 'untrusted-widget' }],
      };
      assert.equal(
        (
          await request('/api/resolve', 'POST', {
            templateId: record.id,
            entityId: 'claim-901',
            mode: 'draft',
            definition: invalid,
            capabilities: { catalog: forgedCatalog },
          })
        ).status,
        422,
      );
    },
  );
});
