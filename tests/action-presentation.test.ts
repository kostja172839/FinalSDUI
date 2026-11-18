import test from 'node:test';
import assert from 'node:assert/strict';
import type { JsonValue, SplitAction, SplitTemplate } from '../shared/model';
import {
  getActionPresentationDescriptors,
  invokeWithActionPresentation,
  resolveActionPresentation,
  validateActionPresentation,
} from '../shared/action-presentation';
import { resolveWidgetInput } from '../shared/values';
import { validateTemplate } from '../shared/validation';
import { validateResolvedData } from '../shared/data-validation';
import { seedTemplates } from '../shared/seeds';

const literal = (value: JsonValue) => ({ kind: 'literal' as const, value });
const binding = (path: string) => ({ kind: 'binding' as const, path });
const context = {
  entityId: 'entity-current',
  entityType: 'claim',
  instanceId: 'split-current',
  locale: 'ru-RU',
};
const action = (): SplitAction => ({
  id: 'presentation-action',
  kind: 'openWidget',
  widgetId: 'asset-editor',
  label: 'Открыть',
});
const definition = (): SplitTemplate => ({
  ...structuredClone(seedTemplates[0].draft),
  header: {
    ...structuredClone(seedTemplates[0].draft.header),
    titleSource: literal('Карточка'),
    showStatus: false,
    fields: [],
    actions: [],
  },
  tabs: [{ id: 'presentation-tab', title: 'Действия', nodes: [] }],
  footer: { show: true, text: '', actions: [] },
});

test('action presentation resolves arbitrary data paths and preserves false flags and the label zero', () => {
  const entry = action();
  entry.presentation = {
    label: binding('api.caption'),
    disabled: binding('api.disabled'),
    visible: binding('api.visible'),
    size: literal('md'),
    variant: literal('danger'),
  };
  const data = { api: { caption: '0', disabled: false, visible: true } };
  const before = structuredClone({ entry, data });
  const resolved = resolveActionPresentation(entry, data, context);
  assert.deepEqual(resolved, {
    label: '0',
    disabled: false,
    visible: true,
    size: 'md',
    variant: 'danger',
    issues: [],
  });
  assert.deepEqual({ entry, data }, before);
  assert.equal(
    resolveActionPresentation(
      { ...entry, presentation: { label: binding('$context.entityId') } },
      { $context: { entityId: 'spoofed' } },
      context,
    ).label,
    'entity-current',
  );
});

test('the execution gate blocks hidden, disabled, unresolved and malformed API flags before host invocation', async () => {
  let calls = 0;
  const entry = action();
  const unavailablePresentations: NonNullable<SplitAction['presentation']>[] = [
    { visible: literal(false) },
    { disabled: literal(true) },
    { visible: binding('missing.path') },
    { disabled: literal(0) },
    { visible: literal('false') },
    { size: literal('xl') },
    { label: literal(0) },
  ];
  for (const presentation of unavailablePresentations) {
    entry.presentation = presentation;
    assert.equal(
      await invokeWithActionPresentation(entry, {}, context, () => {
        calls++;
      }),
      false,
    );
  }
  assert.equal(calls, 0);
  entry.presentation = { visible: literal(true), disabled: literal(false), label: literal('0') };
  assert.equal(
    await invokeWithActionPresentation(entry, {}, context, () => {
      calls++;
    }),
    true,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    invokeWithActionPresentation(entry, {}, context, async () => {
      throw new Error('host-failed');
    }),
    /host-failed/,
  );
});

test('presentation accepts only typed wrapper options and cannot introduce callbacks, CSS or unsafe paths', () => {
  for (const descriptor of getActionPresentationDescriptors())
    assert.deepEqual(
      validateActionPresentation({ [descriptor.name]: literal(descriptor.defaultValue!) }),
      [],
    );
  for (const presentation of [
    { style: literal({ color: 'red' }) },
    { onClick: literal('run()') },
    { visible: binding('constructor.run') },
    { disabled: { kind: 'literal', value: () => undefined } },
    { label: literal('') },
    { label: literal('x'.repeat(121)) },
    { size: literal('s') },
    { variant: literal('gradient') },
    { label: { kind: 'literal', value: 'text', script: 'extra' } },
  ])
    assert.ok(validateActionPresentation(presentation).length);
  const legacy = resolveActionPresentation(action(), {}, context, 'ghost');
  assert.deepEqual(legacy, {
    label: 'Открыть',
    visible: true,
    disabled: false,
    size: 'sm',
    variant: 'ghost',
    issues: [],
  });
});

test('template validation includes header, footer, direct buttons and document action presentations', () => {
  const value = definition();
  value.header.actions = [
    { ...action(), presentation: { label: literal('Карточка'), visible: binding('api.visible') } },
  ];
  value.footer.actions = [
    { ...action(), id: 'presentation-footer', presentation: { disabled: literal(false) } },
  ];
  value.footer.buttons = [
    {
      id: 'presentation-button',
      label: 'Обновить',
      action: { kind: 'refresh' },
      presentation: { variant: literal('primary'), size: literal('md') },
    },
  ];
  assert.deepEqual(
    validateTemplate(value).filter((issue) => issue.severity === 'error'),
    [],
  );
  value.header.actions[0].presentation = { disabled: literal('yes') };
  value.footer.buttons[0].presentation = { unknown: literal(true) };
  value.tabs[0].nodes = [
    {
      id: 'presentation-docs',
      type: 'documents',
      title: 'Документы',
      binding: 'items',
      itemTitle: binding('name'),
      action: { ...action(), id: 'presentation-document', presentation: { visible: literal(0) } },
    },
  ];
  const errors = validateTemplate(value).filter((issue) => issue.severity === 'error');
  assert.ok(errors.some((issue) => issue.path === '$.header.actions[0].presentation.disabled'));
  assert.ok(errors.some((issue) => issue.path === '$.footer.buttons[0].presentation.unknown'));
  assert.ok(errors.some((issue) => issue.path.endsWith('.action.presentation.visible')));
});

test('resolved presentation diagnostics point to API fields while widget input data remains separate', () => {
  const value = definition();
  const entry = {
    ...action(),
    props: { flowId: binding('api.flowId') },
    presentation: { label: binding('api.caption'), disabled: binding('api.disabled') },
  };
  value.header.actions = [entry];
  value.footer.buttons = [
    {
      id: 'presentation-button',
      label: 'Обновить',
      action: { kind: 'refresh' },
      presentation: { visible: binding('api.visible') },
    },
  ];
  const data = { api: { caption: 'Карточка', flowId: 'process-arbitrary', disabled: 'false', visible: 0 } };
  const issues = validateResolvedData(value, data, context);
  assert.ok(
    issues.some(
      (issue) =>
        issue.path === '$.header.actions[0].presentation.disabled' && issue.dataPath === 'api.disabled',
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.path === '$.footer.buttons[0].presentation.visible' && issue.dataPath === 'api.visible',
    ),
  );
  assert.deepEqual(resolveWidgetInput(entry, data, context).data, { flowId: 'process-arbitrary' });
  assert.deepEqual(
    validateResolvedData(value, { api: { ...data.api, disabled: false, visible: false } }, context),
    [],
  );
});
