import test from 'node:test';
import assert from 'node:assert/strict';
import type { BadgeNode, ContentNode, JsonValue, ProgressNode, SplitTemplate } from '../shared/model';
import {
  getComponentPropDescriptors,
  resolveComponentNode,
  validateComponentProps,
} from '../shared/component-props';
import { validateTemplate } from '../shared/validation';
import { validateResolvedData } from '../shared/data-validation';
import { seedTemplates } from '../shared/seeds';

const literal = (value: JsonValue) => ({ kind: 'literal' as const, value });
const binding = (path: string) => ({ kind: 'binding' as const, path });
const badge = (): BadgeNode => ({
  id: 'props-badge',
  type: 'badge',
  title: 'Исходный заголовок',
  tone: 'info',
  value: literal('Готово'),
});
const definition = (nodes: ContentNode[]): SplitTemplate => ({
  ...structuredClone(seedTemplates[0].draft),
  header: {
    ...structuredClone(seedTemplates[0].draft.header),
    titleSource: literal('Карточка'),
    showStatus: false,
    fields: [],
    actions: [],
  },
  tabs: [{ id: 'props-tab', title: 'Параметры', nodes }],
});

test('component props resolve arbitrary API paths and override native options without mutating sources', () => {
  const node = badge();
  node.props = {
    title: binding('any.api.caption'),
    size: binding('any.api.size'),
    view: binding('any.api.color'),
    transparent: literal(false),
    pilled: literal(true),
    showTitle: literal(false),
  };
  const data = { any: { api: { caption: 'Сведения из API', size: 'l', color: 'positive' } } };
  const saved = structuredClone({ node, data });
  const result = resolveComponentNode(node, data);
  assert.deepEqual(result.issues, []);
  assert.equal(result.node.title, 'Сведения из API');
  assert.equal(result.node.size, 'l');
  assert.equal(result.node.view, 'positive');
  assert.equal(result.node.transparent, false);
  assert.equal(result.node.pilled, true);
  assert.equal(result.node.showTitle, false);
  assert.deepEqual({ node, data }, saved);
  assert.deepEqual(
    validateTemplate(definition([node])).filter((issue) => issue.severity === 'error'),
    [],
  );
});

test('every advertised default validates and each nonexternal node exposes safe common captions', () => {
  const types: ContentNode['type'][] = [
    'fields',
    'section',
    'text',
    'callout',
    'metrics',
    'recordList',
    'documents',
    'badge',
    'avatar',
    'image',
    'progress',
    'divider',
  ];
  for (const type of types) {
    const descriptors = getComponentPropDescriptors(type);
    assert.ok(
      descriptors.some((item) => item.name === 'title'),
      type,
    );
    assert.ok(
      descriptors.some((item) => item.name === 'showTitle'),
      type,
    );
    assert.equal(new Set(descriptors.map((item) => item.name)).size, descriptors.length);
    for (const descriptor of descriptors)
      if (descriptor.defaultValue !== undefined)
        assert.deepEqual(
          validateComponentProps(type, { [descriptor.name]: literal(descriptor.defaultValue) }),
          [],
          `${type}.${descriptor.name}`,
        );
  }
  assert.deepEqual(getComponentPropDescriptors('widget'), []);
  assert.deepEqual(getComponentPropDescriptors('erpTable'), []);
});

test('unsupported, executable and misplaced parameters fail validation rather than disappearing silently', () => {
  for (const name of ['style', 'onClick', 'ref', 'type', 'unknown']) {
    assert.ok(
      validateComponentProps('badge', { [name]: literal('anything') }).some((issue) => issue.key === name),
    );
  }
  for (const props of [
    { size: literal('huge') },
    { transparent: literal('false') },
    { size: binding('constructor.code') },
    { pilled: { kind: 'literal', value: () => undefined } },
    { size: { kind: 'literal' } },
    { size: { kind: 'binding', path: 'api.size', javascript: 'ignore-me' } },
  ])
    assert.ok(validateComponentProps('badge', props).length);
  const misplaced = { ...badge(), size: 'l', pilled: true };
  const issues = validateTemplate(definition([misplaced]));
  assert.ok(issues.some((issue) => issue.path.endsWith('.size')));
  assert.ok(issues.some((issue) => issue.path.endsWith('.pilled')));
  const unknown = badge();
  unknown.props = { unknown: literal(true) };
  assert.ok(validateTemplate(definition([unknown])).some((issue) => issue.path.endsWith('.props.unknown')));
});

test('invalid resolved enums are scoped to their API path and keep the original fallback usable', () => {
  const node = badge();
  node.props = { size: binding('response.badgeSize'), view: binding('response.badgeView') };
  const data = { response: { badgeSize: 'huge', badgeView: 'url(javascript:bad)' } };
  const result = resolveComponentNode(node, data);
  assert.equal(result.issues.length, 2);
  assert.equal(result.node.title, node.title);
  assert.equal(result.node.view, undefined);
  const issues = validateResolvedData(definition([node]), data);
  assert.ok(
    issues.some((issue) => issue.path.endsWith('.props.size') && issue.dataPath === 'response.badgeSize'),
  );
  assert.ok(
    issues.some((issue) => issue.path.endsWith('.props.view') && issue.dataPath === 'response.badgeView'),
  );
});

test('image responsive props accept real native ratios and safe sources and reject executable/CSS payloads', () => {
  assert.deepEqual(
    validateComponentProps('image', {
      ratio: literal('16/9'),
      customRatio: literal(56.25),
      srcSet: literal('/image.png 1x, https://example.test/large.png 2x'),
      sizes: literal('(max-width: 680px) 100vw, 50vw'),
    }),
    [],
  );
  for (const props of [
    { ratio: literal('anything') },
    { customRatio: literal(0) },
    { srcSet: literal('javascript:alert(1) 1x') },
    { srcSet: literal('//other.test/image.png 2x') },
    { srcSet: literal('data:image/png;base64,AAA 1x') },
    { sizes: literal('1px; color:red') },
  ])
    assert.ok(validateComponentProps('image', props).length);
});

test('progress max is bound from API and all native presentation options survive normalization', () => {
  const node: ProgressNode = {
    id: 'props-progress',
    type: 'progress',
    title: 'Задачи',
    value: binding('response.done'),
    max: 10,
    showValue: true,
    props: {
      max: binding('response.total'),
      view: literal('warning'),
      size: literal('l'),
      progressSize: literal('8'),
      caption: binding('response.caption'),
      valuePlacement: literal('top'),
      valueAlign: literal('end'),
      hasValue: literal(false),
    },
  };
  const good = { response: { done: 50, total: 200, caption: 'Данные текущего процесса' } };
  assert.deepEqual(validateResolvedData(definition([node]), good), []);
  const resolved = resolveComponentNode(node, good);
  assert.equal(resolved.node.max, 200);
  assert.equal(resolved.node.caption, 'Данные текущего процесса');
  assert.equal(resolved.node.hasValue, false);
  assert.equal(resolved.node.progressSize, '8');
  assert.ok(
    validateResolvedData(definition([node]), { response: { ...good.response, total: 25 } }).some(
      (issue) => issue.dataPath === 'response.done',
    ),
  );
  assert.ok(
    validateComponentProps('progress', { captionPlacement: literal('left') }).length,
    'invented kit props are rejected',
  );
});

test('avatar complex options are validated JSON while native counter/badge types cannot overwrite node.type', () => {
  assert.deepEqual(
    validateComponentProps('avatar', {
      size: literal('fit'),
      fitSize: literal(80),
      customText: literal('АС'),
      status: literal('active'),
      statusLabels: literal({ active: 'На месте', inactive: 'Нет на месте' }),
      hasExtra: literal(true),
      extraType: literal('counter'),
      count: literal(3),
      extraPlacement: literal('top-right'),
      counterView: literal('negative'),
    }),
    [],
  );
  assert.ok(validateComponentProps('avatar', { type: literal('counter') }).length);
  assert.ok(
    validateComponentProps('avatar', { statusLabels: literal({ active: 'Есть', inactive: false }) }).length,
  );
  assert.ok(validateComponentProps('avatar', { count: literal(0) }).length);
});

test('semantic list/section/divider options are bounded and legacy definitions retain existing defaults', () => {
  assert.deepEqual(
    validateComponentProps('section', {
      appearance: literal('outlined'),
      size: literal('h3'),
      defaultIconContent: literal('chevron'),
      defaultIconPlacement: literal('right'),
      disabled: literal(false),
      alignWithTitle: literal(true),
    }),
    [],
  );
  assert.deepEqual(
    validateComponentProps('documents', {
      maxItems: literal(10),
      emptyText: literal('Документы ещё не добавлены'),
      statusView: literal('warning'),
      statusSize: literal('l'),
      linkTarget: literal('self'),
    }),
    [],
  );
  assert.deepEqual(
    validateComponentProps('divider', {
      orientation: literal('vertical'),
      view: literal('inverse'),
      length: literal('80%'),
      height: literal(200),
    }),
    [],
  );
  for (const props of [{ maxItems: literal(0) }, { maxItems: literal(1.5) }])
    assert.ok(validateComponentProps('recordList', props).length);
  assert.ok(validateComponentProps('divider', { length: literal('calc(1px + url(x))') }).length);
  assert.ok(validateComponentProps('fields', { columns: literal(4) }).length);
  const original = badge();
  const resolved = resolveComponentNode(original, {});
  assert.deepEqual(resolved.node, original);
  assert.deepEqual(resolved.props, {});
});
