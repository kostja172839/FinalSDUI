import test from 'node:test';
import assert from 'node:assert/strict';
import type { FieldDefinition, SplitTemplate, ValueSource } from '../shared/model';
import { seedTemplates } from '../shared/seeds';
import { getFieldPropDescriptors, resolveFieldProps, validateFieldProps } from '../shared/field-props';
import { validateTemplate } from '../shared/validation';
import { validateResolvedData } from '../shared/data-validation';
import { canonicalizeDefinition } from '../shared/values';

const literal = (value: string | number): ValueSource => ({ kind: 'literal', value });
const binding = (path: string): ValueSource => ({ kind: 'binding', path });
const field = (): FieldDefinition => ({
  id: 'amount-field',
  label: 'Сумма',
  binding: '',
  source: literal(300),
  format: 'money',
});
function definition(value = field()): SplitTemplate {
  const result = structuredClone(seedTemplates[0].draft);
  result.header.fields = [value];
  result.tabs = [{ id: 'field-tab', title: 'Поля', nodes: [] }];
  return result;
}
const errors = (value: unknown) => validateTemplate(value).filter((issue) => issue.severity === 'error');

test('field descriptors expose bounded presentation options without introducing implicit defaults', () => {
  assert.deepEqual(
    getFieldPropDescriptors().map((item) => item.name),
    [
      'label',
      'emptyText',
      'currency',
      'minFractionDigits',
      'maxFractionDigits',
      'locale',
      'dateStyle',
      'timeStyle',
      'timeZone',
      'statusView',
      'align',
      'span',
      'suffix',
    ],
  );
  assert.deepEqual(resolveFieldProps(field(), {}), { props: {}, issues: [] });
  assert.deepEqual(errors(definition()), []);
});

test('misplaced field presentation settings are rejected instead of silently keeping legacy formatting', () => {
  for (const [name, value] of [
    ['currency', 'EUR'],
    ['maxFractionDigits', 0],
    ['statusView', 'positive'],
    ['span', 2],
  ] as const) {
    const misplaced = { ...field(), [name]: value };
    const issue = errors(definition(misplaced)).find((item) => item.path === `$.header.fields[0].${name}`);
    assert.ok(issue, name);
    assert.ok(issue.message.includes(`props.${name}`));
    assert.deepEqual(errors(definition({ ...field(), props: { [name]: literal(value) } })), []);
  }
  const template = definition();
  template.header.fields = [];
  template.tabs[0].nodes = [
    {
      id: 'legacy-metrics',
      type: 'metrics',
      title: 'Итоги',
      columns: 1,
      items: [{ ...field(), label: 'Прежняя подпись', suffix: 'без НДС' }],
    },
  ];
  assert.deepEqual(errors(template), []);
});

test('explicit literals and API bindings resolve in the current field scope without mutating inputs', () => {
  const configured = {
    ...field(),
    props: {
      currency: binding('currencyLetterCode'),
      label: binding('displayLabel'),
      emptyText: literal('Нет суммы'),
      locale: literal('ru-RU'),
      minFractionDigits: literal(0),
      maxFractionDigits: literal(4),
      dateStyle: literal('short'),
      timeStyle: literal('medium'),
      timeZone: literal('Europe/Moscow'),
      statusView: literal('positive'),
      align: literal('end'),
      span: literal(2),
      suffix: literal('без НДС'),
    },
  };
  const data = { currencyLetterCode: 'EUR', displayLabel: 'Стоимость' };
  const before = structuredClone({ configured, data });
  assert.deepEqual(validateFieldProps(configured.props), []);
  assert.deepEqual(resolveFieldProps(configured, data), {
    props: {
      currency: 'EUR',
      label: 'Стоимость',
      emptyText: 'Нет суммы',
      locale: 'ru-RU',
      minFractionDigits: 0,
      maxFractionDigits: 4,
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'Europe/Moscow',
      statusView: 'positive',
      align: 'end',
      span: 2,
      suffix: 'без НДС',
    },
    issues: [],
  });
  assert.deepEqual({ configured, data }, before);
});

test('field props reject wrong types, unsupported native views, invalid Intl options and arbitrary CSS', () => {
  for (const [key, value] of [
    ['currency', 'eur'],
    ['currency', 'EURO'],
    ['locale', 'ru_RU'],
    ['timeZone', 'Mars/Olympus'],
    ['dateStyle', 'arbitrary'],
    ['timeStyle', 'none'],
    ['statusView', 'danger'],
    ['align', 'left'],
    ['span', 4],
    ['span', 1.5],
    ['minFractionDigits', -1],
    ['maxFractionDigits', 21],
    ['maxFractionDigits', '2'],
    ['label', ' '],
    ['style', 'color:red'],
    ['onClick', 'runSomething()'],
  ] as const) {
    const props = { [key]: literal(value) };
    assert.ok(
      validateFieldProps(props).some((issue) => issue.key === key),
      `${key}: ${value}`,
    );
    assert.equal(Object.hasOwn(resolveFieldProps({ props }, {}).props, key), false);
  }
  assert.ok(validateFieldProps({ currency: { kind: ['literal'], value: 'EUR' } }).length);
  assert.ok(validateFieldProps({ currency: binding('response.constructor.currency') }).length);
});

test('fraction bounds validate the resolved pair while permitting either explicit bound on its own', () => {
  const configured = {
    props: {
      minFractionDigits: binding('min'),
      maxFractionDigits: binding('max'),
    },
  };
  assert.deepEqual(validateFieldProps(configured.props), []);
  const invalid = resolveFieldProps(configured, { min: 3, max: 2 });
  assert.deepEqual(invalid.props, {});
  assert.deepEqual(
    invalid.issues.map((issue) => issue.key),
    ['maxFractionDigits'],
  );
  assert.deepEqual(resolveFieldProps({ props: { maxFractionDigits: literal(0) } }, {}).props, {
    maxFractionDigits: 0,
  });
  assert.deepEqual(resolveFieldProps({ props: { minFractionDigits: literal(10) } }, {}).props, {
    minFractionDigits: 10,
  });
});

test('schema field diagnostics identify the actual props editor and missing bindings report resolved data paths', () => {
  const configured = { ...field(), props: { currency: literal('euro') } };
  assert.ok(
    errors(definition(configured)).some((issue) => issue.path === '$.header.fields[0].props.currency'),
  );
  configured.props.currency = binding('response.currency');
  assert.deepEqual(errors(definition(configured)), []);
  const issue = validateResolvedData(definition(configured), { entity: { title: 'Карточка' } }).find(
    (item) => item.fieldId === configured.id,
  )!;
  assert.equal(issue.path, '$.header.fields[0].props.currency');
  assert.equal(issue.dataPath, 'response.currency');
});

test('record fields validate props against each row and retain its exact JSON navigation path', () => {
  const configured = {
    ...field(),
    source: binding('amount'),
    props: { currency: binding('currencyLetterCode') },
  };
  const template = definition();
  template.header.fields = [];
  template.tabs[0].nodes = [
    {
      id: 'expenses',
      type: 'recordList',
      title: 'Расходы',
      binding: 'collections.expenses',
      itemTitle: binding('name'),
      columns: 1,
      fields: [configured],
    },
  ];
  const issues = validateResolvedData(template, {
    entity: { title: 'Карточка' },
    collections: {
      expenses: [
        { name: 'Первый', amount: 300, currencyLetterCode: 'EUR' },
        { name: 'Второй', amount: 400, currencyLetterCode: 'euro' },
      ],
    },
  }).filter((issue) => issue.fieldId === configured.id);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].itemIndex, 1);
  assert.equal(issues[0].dataPath, 'collections.expenses.1.currencyLetterCode');
  assert.ok(issues[0].path.endsWith('.props.currency'));
});

test('field prop bindings canonicalize with their field while literal business text stays unchanged', () => {
  const configured = { ...field(), props: { label: binding('asset.label'), suffix: literal('asset.label') } };
  const template = definition(configured);
  const before = structuredClone(template);
  const normalized = canonicalizeDefinition(template);
  assert.deepEqual(normalized.header.fields![0].props, {
    label: binding('entity.label'),
    suffix: literal('asset.label'),
  });
  assert.deepEqual(template, before);
});

test('row field values and props can use the reserved root scope without false row-relative diagnostics', () => {
  const configured = {
    ...field(),
    source: binding('$root.entity.total'),
    props: { currency: binding('$root.entity.currency') },
  };
  const template = definition();
  template.header.fields = [];
  template.tabs[0].nodes = [
    {
      id: 'root-expenses',
      type: 'recordList',
      title: 'Расходы',
      binding: 'collections.expenses',
      itemTitle: binding('name'),
      columns: 1,
      fields: [configured],
    },
  ];
  const data = {
    entity: { title: 'Карточка', total: 300, currency: 'EUR' },
    collections: { expenses: [{ name: 'Расход', $root: { entity: { currency: 'spoofed' } } }] },
  };
  assert.deepEqual(
    validateResolvedData(template, data).filter((issue) => issue.fieldId === configured.id),
    [],
  );
  data.entity.currency = 'euro';
  const issue = validateResolvedData(template, data).find((issue) => issue.fieldId === configured.id)!;
  assert.equal(issue.itemIndex, 0);
  assert.equal(issue.dataPath, 'entity.currency');
  assert.ok(issue.path.endsWith('.props.currency'));

  template.tabs[0].nodes = [
    {
      id: 'root-metrics',
      type: 'metrics',
      title: 'Итоги',
      columns: 1,
      items: [configured],
    },
  ];
  assert.equal(
    validateResolvedData(template, data).find((item) => item.fieldId === configured.id)?.dataPath,
    'entity.currency',
  );
  template.header.fields = [configured];
  template.tabs[0].nodes = [];
  assert.equal(
    validateResolvedData(template, data).find((item) => item.fieldId === configured.id)?.dataPath,
    'entity.currency',
  );
});
