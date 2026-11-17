import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server/app';
import { catalog } from '../shared/catalog';
import type { FooterButton, HostActionIntent, OpenWidgetIntent, TemplateRecord } from '../shared/model';
import { seedTemplates } from '../shared/seeds';
import { canonicalizeDefinition } from '../shared/values';
import { validateTemplate } from '../shared/validation';
import { dispatchButtonAction, getButtonActionAvailability } from '../src/runtime/button-actions';

const context = { entityId: 'claim-91', entityType: 'claim', instanceId: 'split-42', locale: 'ru-RU' };
const data = { response: { requestId: 91, amount: 200 }, $context: { entityId: 'spoofed' } };
const hostButton = (): FooterButton => ({
  id: 'approve-request',
  label: 'Согласовать',
  variant: 'primary',
  action: {
    kind: 'host',
    actionId: 'demo.inspectParams',
    params: { message: { kind: 'literal', value: 'Получено' } },
  },
});
const definition = () => {
  const value = structuredClone(seedTemplates[0].draft);
  value.footer.buttons = [hostButton()];
  return value;
};
const errors = (value: unknown) => validateTemplate(value).filter((issue) => issue.severity === 'error');

test('direct footer buttons coexist with menus and keep unique IDs and validated targets', () => {
  const value = definition();
  value.footer.buttons!.push(
    { id: 'refresh-button', label: 'Обновить', action: { kind: 'refresh' } },
    { id: 'close-button', label: 'Закрыть', action: { kind: 'close' } },
    { id: 'widget-button', label: 'Документы', action: { kind: 'openWidget', widgetId: 'asset-documents' } },
  );
  assert.deepEqual(errors(value), []);
  value.footer.buttons![1].id = value.footer.buttons![0].id;
  assert.ok(errors(value).some((issue) => issue.path === '$.footer.buttons[1].id'));
  value.footer.buttons![0].action = { kind: 'host', actionId: 'unregistered' };
  assert.ok(errors(value).some((issue) => issue.path.endsWith('.action.actionId')));
  value.footer.buttons![0].action = { kind: 'openWidget', widgetId: 'asset-history' };
  assert.ok(errors(value).some((issue) => issue.path.endsWith('.action.widgetId')));
});

test('footer validation covers captions, variants, limits, required params and non-executable actions', () => {
  const value = definition();
  value.footer.buttons![0].label = '';
  assert.ok(errors(value).some((issue) => issue.path.endsWith('[0].label')));
  const malformed = definition() as any;
  malformed.footer.buttons[0].variant = 'rainbow';
  malformed.footer.buttons[0].action = { kind: 'refresh', script: 'alert(1)' };
  assert.ok(errors(malformed).some((issue) => issue.path.endsWith('.variant')));
  assert.ok(errors(malformed).some((issue) => issue.path.endsWith('.action.script')));
  malformed.footer.buttons = Array.from({ length: 7 }, (_, index) => ({
    id: `button-${index}`,
    label: 'OK',
    action: { kind: 'close' },
  }));
  assert.ok(errors(malformed).some((issue) => issue.path === '$.footer.buttons'));
  malformed.footer.buttons = [hostButton()];
  malformed.footer.buttons[0].action.params = {};
  assert.ok(errors(malformed).some((issue) => issue.path.endsWith('.params.message')));
  malformed.footer.buttons[0].action.params = { message: { kind: 'literal', value: 12 } };
  assert.ok(errors(malformed).some((issue) => issue.path.endsWith('.params.message.value')));
  malformed.footer.buttons[0].action.params = { 'constructor.prototype': { kind: 'literal', value: 12 } };
  assert.ok(errors(malformed).some((issue) => issue.message.includes('Недопустимое имя параметра')));
});

test('direct buttons participate in client widget and host action capabilities', () => {
  const value = definition();
  assert.ok(
    validateTemplate(value, { actionIds: [] }).some((issue) => issue.path.endsWith('.action.actionId')),
  );
  assert.deepEqual(
    validateTemplate(value, { actionIds: ['demo.inspectParams'] }).filter(
      (issue) => issue.severity === 'error',
    ),
    [],
  );
  value.footer.buttons![0].action = { kind: 'openWidget', widgetId: 'asset-editor' };
  assert.ok(
    validateTemplate(value, { widgetIds: [] }).some((issue) => issue.path.endsWith('.action.widgetId')),
  );
});

test('host dispatch resolves arbitrary params, nests values and uses trusted context', async () => {
  let captured: HostActionIntent | undefined;
  let finish!: () => void;
  const completed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let settled = false;
  const pending = dispatchButtonAction(
    {
      kind: 'host',
      actionId: 'claim.approve',
      params: {
        'request.id': { kind: 'binding', path: 'response.requestId' },
        entityId: { kind: 'binding', path: '$context.entityId' },
        decision: { kind: 'literal', value: 'approved' },
      },
    },
    {
      context,
      data,
      actionHandlers: {
        'claim.approve': async (intent) => {
          captured = intent;
          await completed;
        },
      },
    },
  ).then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual(captured?.params, { request: { id: 91 }, entityId: 'claim-91', decision: 'approved' });
  assert.deepEqual(captured?.context, context);
  assert.notEqual(captured?.context, context);
  assert.match(captured!.correlationId, /^[\da-f-]{36}$/);
  finish();
  await pending;
  assert.equal(settled, true);
});

test('only installed own host handlers execute and failures reach the button error boundary', async () => {
  let calls = 0;
  const inherited = Object.create({ 'claim.approve': () => calls++ });
  const action = { kind: 'host' as const, actionId: 'claim.approve' };
  assert.equal(
    getButtonActionAvailability(action, { context, data, actionHandlers: inherited }).enabled,
    false,
  );
  await assert.rejects(dispatchButtonAction(action, { context, data, actionHandlers: inherited }));
  assert.equal(calls, 0);
  await assert.rejects(
    dispatchButtonAction(action, {
      context,
      data,
      actionHandlers: {
        'claim.approve': async () => {
          throw new Error('API unavailable');
        },
      },
    }),
    /API unavailable/,
  );
});

test('resolved bound parameters are checked against action descriptors before invoking a handler', async () => {
  let calls = 0;
  const environment = {
    context,
    data,
    actionDescriptors: catalog.actions,
    actionHandlers: {
      'demo.inspectParams': () => {
        calls++;
      },
    },
  };
  const action = {
    kind: 'host' as const,
    actionId: 'demo.inspectParams',
    params: { message: { kind: 'binding' as const, path: 'response.missing' } },
  };
  assert.equal(getButtonActionAvailability(action, environment).enabled, false);
  assert.match(getButtonActionAvailability(action, environment).reason!, /Сообщение/);
  await assert.rejects(dispatchButtonAction(action, environment), /Сообщение/);
  assert.equal(calls, 0);
  action.params.message.path = 'response.requestId';
  assert.equal(getButtonActionAvailability(action, environment).enabled, false);
  action.params.message.path = '$context.entityId';
  await dispatchButtonAction(action, environment);
  assert.equal(calls, 1);
  const values = {
    kind: 'host' as const,
    actionId: 'valid.values',
    params: {
      zero: { kind: 'literal' as const, value: 0 },
      no: { kind: 'literal' as const, value: false },
      empty: { kind: 'literal' as const, value: null },
    },
  };
  assert.equal(
    getButtonActionAvailability(values, {
      context,
      data,
      actionHandlers: { 'valid.values': () => {} },
      actionDescriptors: [
        {
          id: 'valid.values',
          name: 'Valid',
          description: '',
          inputs: [
            { name: 'zero', label: 'Zero', type: 'number', required: true },
            { name: 'no', label: 'No', type: 'boolean', required: true },
            { name: 'empty', label: 'Empty', type: 'json' },
          ],
        },
      ],
    }).enabled,
    true,
  );
  const cyclic: any = {};
  cyclic.loop = cyclic;
  assert.equal(getButtonActionAvailability({ ...action, params: cyclic }, environment).enabled, false);
});

test('widget and native direct buttons dispatch through existing runtime callbacks', async () => {
  let intent: OpenWidgetIntent | undefined;
  await dispatchButtonAction(
    {
      kind: 'openWidget',
      widgetId: 'asset-documents',
      props: { requestId: { kind: 'binding', path: 'response.requestId' } },
      events: { onClose: { type: 'close' } },
    },
    {
      context,
      data,
      onOpenWidget: (value) => {
        intent = value;
      },
    },
  );
  assert.equal(intent?.widgetId, 'asset-documents');
  assert.deepEqual(intent?.input, { data: { requestId: 91 }, events: { onClose: { type: 'close' } } });
  const calls: string[] = [];
  await dispatchButtonAction(
    { kind: 'refresh' },
    {
      context,
      data,
      onRefresh: () => {
        calls.push('refresh');
      },
    },
  );
  await dispatchButtonAction(
    { kind: 'close' },
    {
      context,
      data,
      onClose: () => {
        calls.push('close');
      },
    },
  );
  assert.deepEqual(calls, ['refresh', 'close']);
  assert.equal(getButtonActionAvailability({ kind: 'close' }, { context, data }).enabled, false);
});

test('editable projection normalizes button binding paths without changing saved values', () => {
  const value = definition();
  value.footer.buttons![0].action = {
    kind: 'host',
    actionId: 'demo.inspectParams',
    params: {
      message: { kind: 'binding', path: 'asset.title' },
      sample: { kind: 'literal', value: 'asset.title' },
    },
  };
  const normalized = canonicalizeDefinition(value);
  assert.deepEqual((normalized.footer.buttons![0].action as any).params.message, {
    kind: 'binding',
    path: 'entity.title',
  });
  assert.deepEqual((normalized.footer.buttons![0].action as any).params.sample, {
    kind: 'literal',
    value: 'asset.title',
  });
  assert.equal((value.footer.buttons![0].action as any).params.message.path, 'asset.title');
});

test('buttons survive save, publish and resolve; backend catalog cannot be overridden by the client', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sdui-buttons-'));
  const server = createServer({ dataDir: root });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const request = async (route: string, body?: unknown, method = 'POST') => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${route}`, {
      method: body === undefined ? 'GET' : method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    let record = (await request('/templates', { name: 'Кнопки' })).data as TemplateRecord;
    const value = structuredClone(record.draft);
    value.footer.buttons = [hostButton()];
    const saved = await request(
      `/templates/${record.id}`,
      { definition: value, expectedDraftVersion: record.draftVersion },
      'PUT',
    );
    assert.equal(saved.status, 200);
    record = saved.data;
    const published = await request(`/templates/${record.id}/publish`, {
      expectedDraftVersion: record.draftVersion,
    });
    assert.equal(published.status, 200);
    const resolved = await request('/resolve', {
      templateId: record.id,
      entityId: 'asset-001',
      mode: 'published',
    });
    assert.equal(resolved.status, 200);
    assert.deepEqual(resolved.data.definition.footer.buttons, value.footer.buttons);
    const forged = structuredClone(value);
    forged.footer.buttons![0].action = { kind: 'host', actionId: 'not.registered' };
    const invalid = await request('/resolve', {
      templateId: record.id,
      entityId: 'asset-001',
      mode: 'draft',
      definition: forged,
      capabilities: {
        catalog: { ...catalog, actions: [{ id: 'not.registered', name: 'Forged', description: '' }] },
      },
    });
    assert.equal(invalid.status, 422);
    assert.ok(invalid.data.issues.some((issue: { path: string }) => issue.path.endsWith('.action.actionId')));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});
