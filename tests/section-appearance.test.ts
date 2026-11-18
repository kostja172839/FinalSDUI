import test from 'node:test';
import assert from 'node:assert/strict';
import type { SectionNode, SplitTemplate } from '../shared/model';
import { seedTemplates } from '../shared/seeds';
import { isSectionAppearance, sectionAppearance } from '../shared/section-appearance';
import { validateTemplate } from '../shared/validation';
import { canonicalizeDefinition } from '../shared/values';

function section(appearance?: SectionNode['appearance']): SectionNode {
  return {
    id: 'appearance-section',
    type: 'section',
    title: 'Раздел',
    collapsible: true,
    defaultOpen: true,
    ...(appearance === undefined ? {} : { appearance }),
    children: [
      {
        id: 'section-text',
        type: 'text',
        title: 'Описание',
        binding: '',
        source: { kind: 'literal', value: 'Содержимое раздела' },
        collapsible: false,
      },
    ],
  };
}
function definition(node: SectionNode): SplitTemplate {
  const result = structuredClone(seedTemplates[0].draft);
  result.tabs = [{ id: 'appearance-tab', title: 'Оформление', nodes: [node] }];
  return result;
}
const errors = (value: unknown) => validateTemplate(value).filter((issue) => issue.severity === 'error');

test('legacy sections retain divider appearance and use supported FinAI views', () => {
  const legacy = section();
  assert.deepEqual(errors(definition(legacy)), []);
  assert.deepEqual(sectionAppearance(legacy), { appearance: 'divider', accordionView: 'clear' });
  assert.equal(Object.hasOwn(legacy, 'appearance'), false);
  assert.deepEqual(sectionAppearance(section('plain')), { appearance: 'plain', accordionView: 'clear' });
  assert.deepEqual(sectionAppearance(section('outlined')), {
    appearance: 'outlined',
    accordionView: 'default',
  });
});

test('each bounded appearance remains valid for collapsible and static sections', () => {
  for (const appearance of ['plain', 'divider', 'outlined'] as const) {
    for (const collapsible of [true, false]) {
      const node = { ...section(appearance), collapsible };
      assert.deepEqual(errors(definition(node)), [], `${appearance}, collapsible=${collapsible}`);
      assert.equal(isSectionAppearance(appearance), true);
    }
  }
});

test('section appearance rejects unknown values, coercible arrays and executable styling', () => {
  for (const appearance of [
    null,
    1,
    ['plain'],
    { kind: 'literal', value: 'outlined' },
    { border: '1px solid red' },
    'outlined; background:url(javascript:alert(1))',
    'default',
  ]) {
    const node = { ...section(), appearance } as unknown as SectionNode;
    const issue = errors(definition(node)).find((item) => item.path.endsWith('.appearance'));
    assert.ok(issue, JSON.stringify(appearance));
    assert.equal(issue.nodeId, node.id);
    assert.equal(isSectionAppearance(appearance), false);
    assert.deepEqual(sectionAppearance(node), { appearance: 'divider', accordionView: 'clear' });
  }
});

test('nested section appearance survives JSON and canonicalization without changing its saved input', () => {
  const outer = section('outlined');
  const inner = { ...section('plain'), id: 'inner-section', children: [] };
  outer.children.push(inner);
  const saved = definition(outer);
  const before = structuredClone(saved);
  const compiled = canonicalizeDefinition(JSON.parse(JSON.stringify(saved)) as SplitTemplate);
  const compiledOuter = compiled.tabs[0].nodes[0] as SectionNode;
  const compiledInner = compiledOuter.children[1] as SectionNode;
  assert.equal(compiledOuter.appearance, 'outlined');
  assert.equal(compiledInner.appearance, 'plain');
  assert.deepEqual(errors(compiled), []);
  assert.deepEqual(saved, before);
});
