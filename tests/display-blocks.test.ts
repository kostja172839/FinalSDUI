import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  AvatarNode,
  BadgeNode,
  ImageNode,
  ProgressNode,
  SplitTemplate,
} from '../shared/model';
import { seedTemplates } from '../shared/seeds';
import { validateTemplate } from '../shared/validation';
import { validateResolvedData } from '../shared/data-validation';

const binding = (path: string) => ({ kind: 'binding' as const, path });
const literal = (value: string | number) => ({ kind: 'literal' as const, value });
function fixture(): SplitTemplate {
  const result = structuredClone(seedTemplates[0].draft);
  result.header = {
    ...result.header,
    titleSource: literal('Карточка'),
    showStatus: false,
    fields: [],
    actions: [],
  };
  result.tabs = [
    {
      id: 'display-tab',
      title: 'Отображение',
      nodes: [
        {
          id: 'display-badge',
          type: 'badge',
          title: 'Статус',
          value: binding('response.state'),
          tone: 'info',
        },
        {
          id: 'display-avatar',
          type: 'avatar',
          title: 'Ответственный',
          name: binding('response.person'),
          src: binding('response.photo'),
          size: 'm',
        },
        {
          id: 'display-image',
          type: 'image',
          title: 'Изображение',
          src: binding('response.image'),
          alt: binding('response.imageDescription'),
          height: 240,
          fit: 'contain',
        },
        {
          id: 'display-progress',
          type: 'progress',
          title: 'Выполнение',
          value: binding('response.done'),
          max: 10,
          showValue: true,
        },
        { id: 'display-divider', type: 'divider', title: 'Разделитель', label: 'Следующий раздел' },
      ],
    },
  ];
  return result;
}
const errors = (definition: unknown) =>
  validateTemplate(definition).filter((issue) => issue.severity === 'error');

test('all five display blocks accept independent API paths and valid resolved values without modifying inputs', () => {
  const definition = fixture();
  const data = {
    response: {
      state: { label: 'Открыто' },
      person: 'Мария Сергеевна',
      photo: '/images/person.png',
      image: 'https://example.test/object.png',
      imageDescription: 'Объект на фотографии',
      done: 0,
    },
  };
  const before = structuredClone({ definition, data });
  assert.deepEqual(errors(definition), []);
  assert.deepEqual(validateResolvedData(definition, data), []);
  assert.deepEqual({ definition, data }, before);
  data.response.done = 10;
  assert.deepEqual(validateResolvedData(definition, data), []);
});

test('display settings reject invalid kit enums, nonfinite maxima and out-of-range heights before publication', () => {
  const definition = fixture();
  const [badge, avatar, image, progress, divider] = definition.tabs[0].nodes;
  (badge as BadgeNode).tone = 'arbitrary-css' as BadgeNode['tone'];
  (avatar as AvatarNode).size = 'huge' as AvatarNode['size'];
  (image as ImageNode).height = 79;
  (image as ImageNode).fit = 'stretch' as ImageNode['fit'];
  (progress as ProgressNode).max = Infinity;
  (divider as unknown as { label: unknown }).label = {};
  for (const suffix of ['.tone', '.size', '.height', '.fit', '.max', '.label'])
    assert.ok(
      errors(definition).some((issue) => issue.path.endsWith(suffix)),
      suffix,
    );
});

test('literal image sources cannot introduce executable, embedded, protocol-relative or malformed URLs', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:image/svg+xml,<svg/>',
    '//other.test/x.png',
    '/\\other.test/x.png',
    '/image\n.png',
  ]) {
    const definition = fixture();
    (definition.tabs[0].nodes[2] as ImageNode).src = literal(value);
    assert.ok(
      errors(definition).some((issue) => issue.path.endsWith('.src.value')),
      value,
    );
  }
});

test('resolved progress reports false, arrays and out-of-range data at its actual data path while accepting zero', () => {
  const definition = fixture();
  const progress = definition.tabs[0].nodes[3] as ProgressNode;
  definition.tabs[0].nodes = [progress];
  for (const done of [false, [], {}, -1, 11, 'not a number']) {
    const issues = validateResolvedData(definition, { response: { done } });
    assert.ok(
      issues.some((issue) => issue.nodeId === progress.id && issue.dataPath === 'response.done'),
      JSON.stringify(done),
    );
  }
  for (const done of [0, '0', 10, '5.5'])
    assert.deepEqual(validateResolvedData(definition, { response: { done } }), []);
});

test('resolved image URLs are strings, unsafe URLs are scoped and malformed badge shapes do not become labels', () => {
  const definition = fixture();
  definition.tabs[0].nodes = [definition.tabs[0].nodes[0], definition.tabs[0].nodes[2]];
  for (const image of [{ href: '/object.png' }, '/image\n.png', 'javascript:alert(1)', '//other.test/x']) {
    const issues = validateResolvedData(definition, { response: { image } });
    assert.ok(
      issues.some((issue) => issue.nodeId === 'display-image' && issue.dataPath === 'response.image'),
      JSON.stringify(image),
    );
  }
  for (const state of [[], { arbitrary: 'text' }])
    assert.ok(
      validateResolvedData(definition, { response: { state } }).some(
        (issue) => issue.nodeId === 'display-badge',
      ),
    );
  for (const state of [false, 0, 'Открыто', { name: 'Открыто' }])
    assert.deepEqual(validateResolvedData(definition, { response: { state } }), []);
});
