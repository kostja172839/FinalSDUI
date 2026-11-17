import test from 'node:test';
import assert from 'node:assert/strict';
import type { WidgetRuntimeEvent } from '../shared/model';
import { createConnectorData } from '../src/runtime/connector-data';

test('connector preserves arbitrary nested JSON props and makes nested event callbacks without mutating input', () => {
  const input = {
    data: {
      file: { id: 'custom-id', tags: ['x'] },
      'buttons.cancel.label': 'Закрыть',
      count: 0,
      readonly: false,
    },
    events: { 'buttons.cancel.handler': { type: 'close' as const } },
  };
  const before = structuredClone(input);
  const events: WidgetRuntimeEvent[] = [];
  const data = createConnectorData(input, (event) => events.push(event), {
    name: '@custom/document',
    openProp: 'open',
  });
  assert.equal(data.open, true);
  assert.deepEqual(data.file, input.data.file);
  assert.equal(data.count, 0);
  assert.equal(data.readonly, false);
  const cancel = (data.buttons as { cancel: { label: string; handler: () => void } }).cancel;
  assert.equal(cancel.label, 'Закрыть');
  cancel.handler();
  assert.deepEqual(events, [{ type: 'close' }]);
  (data.file as { tags: string[] }).tags.push('only-in-connector');
  assert.deepEqual(input, before);
});

test('setOpened(true) is not a close request, false is; callbacks stop after disposal', () => {
  let active = true;
  const events: WidgetRuntimeEvent[] = [];
  const data = createConnectorData(
    { data: {}, events: { setOpened: { type: 'close' }, onChange: { type: 'refresh' } } },
    (event) => events.push(event),
    { name: '@custom/history' },
    () => active,
  );
  (data.setOpened as (open: boolean) => void)(true);
  assert.deepEqual(events, []);
  (data.setOpened as (open: boolean) => void)(false);
  (data.onChange as () => void)();
  assert.deepEqual(events, [{ type: 'close' }, { type: 'dataChanged' }]);
  active = false;
  (data.onChange as () => void)();
  assert.equal(events.length, 2);
});

test('host events pass original arguments only to a registered handler', () => {
  const received: unknown[][] = [];
  const events: WidgetRuntimeEvent[] = [];
  const data = createConnectorData(
    {
      data: {},
      events: {
        onView: { type: 'host', name: 'viewDocument' },
        onDelete: { type: 'host', name: 'unregistered' },
        inherited: { type: 'host', name: 'toString' },
      },
    },
    (event) => events.push(event),
    { name: '@custom/documents', handlers: { viewDocument: (...args) => received.push(args) } },
  );
  const file = { id: 'file-42' };
  (data.onView as (...args: unknown[]) => void)(file, 2);
  (data.onDelete as () => void)();
  (data.inherited as () => void)();
  assert.deepEqual(received, [[file, 2]]);
  assert.deepEqual(events[0], { type: 'host', name: 'viewDocument', args: [file, 2] });
  assert.equal(events.filter((item) => item.type === 'error').length, 2);
});

test('connector rejects prototype paths, functions and excessive nested data even if validation was bypassed', () => {
  for (const key of ['__proto__.polluted', 'buttons.constructor.polluted', 'buttons..handler']) {
    assert.throws(() =>
      createConnectorData({ data: {}, events: { [key]: { type: 'close' } } }, () => undefined, {
        name: '@custom/x',
      }),
    );
  }
  assert.throws(() =>
    createConnectorData({ data: JSON.parse('{"__proto__":{"polluted":true}}') }, () => undefined, {
      name: '@custom/x',
    }),
  );
  assert.throws(() =>
    createConnectorData({ data: { execute: () => undefined } }, () => undefined, { name: '@custom/x' }),
  );
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('throwing host handler reports an isolated runtime error', () => {
  const events: WidgetRuntimeEvent[] = [];
  const data = createConnectorData(
    { data: {}, events: { onView: { type: 'host', name: 'view' } } },
    (event) => events.push(event),
    {
      name: '@custom/x',
      handlers: {
        view: () => {
          throw new Error('failed');
        },
      },
    },
  );
  assert.doesNotThrow(() => (data.onView as () => void)());
  assert.deepEqual(events, [{ type: 'error', message: 'Не удалось обработать событие виджета' }]);
});

test('async host handlers report completion or errors and ignore results after disposal', async () => {
  let active = true;
  let finish: (() => void) | undefined;
  const events: WidgetRuntimeEvent[] = [];
  const data = createConnectorData(
    {
      data: {},
      events: { onView: { type: 'host', name: 'view' }, onDelete: { type: 'host', name: 'delete' } },
    },
    (event) => events.push(event),
    {
      name: '@custom/x',
      handlers: {
        view: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
        delete: async () => {
          throw new Error('rejected');
        },
      },
    },
    () => active,
  );
  await (data.onDelete as () => Promise<void>)();
  assert.deepEqual(events, [{ type: 'error', message: 'Не удалось обработать событие виджета' }]);
  const pending = (data.onView as () => Promise<void>)();
  active = false;
  finish?.();
  await pending;
  assert.equal(events.length, 1);
});
