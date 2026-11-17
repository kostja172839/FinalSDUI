import test from 'node:test';
import assert from 'node:assert/strict';
import { writeBinding, dataBindingSuggestions } from '../shared/write-path';
import { readPath } from '../shared/values';

test('bound preview writes create missing objects/arrays and preserve independent data immutably', () => {
  const original = { entity: { title: 'Карточка' }, collections: { rows: [{ name: 'Первая' }] } };
  const next = writeBinding(original, 'entity.amount', 0);
  assert.deepEqual(next, { ...original, entity: { title: 'Карточка', amount: 0 } });
  assert.deepEqual(original, { entity: { title: 'Карточка' }, collections: { rows: [{ name: 'Первая' }] } });
  const rows = writeBinding(next, 'collections.rows.0.enabled', false);
  assert.deepEqual(readPath(rows, 'collections.rows'), [{ name: 'Первая', enabled: false }]);
  assert.deepEqual(writeBinding({}, 'collections.newRows.0.name', 'Добавленная'), {
    collections: { newRows: [{ name: 'Добавленная' }] },
  });
  assert.deepEqual(writeBinding(next, 'entity.optional', null), {
    ...next,
    entity: { title: 'Карточка', amount: 0, optional: null },
  });
  const supplied = { name: 'Документ' };
  const withObject = writeBinding(next, 'entity.document', supplied);
  supplied.name = 'Изменён снаружи';
  assert.deepEqual(readPath(withObject, 'entity.document'), { name: 'Документ' });
});

test('writes reject prototype access, context writes, primitive parent collisions and sparse array writes', () => {
  for (const path of ['entity.__proto__.x', '$context.entityId', 'entity..title', 'collections.rows.3.name'])
    assert.throws(() => writeBinding({ collections: { rows: [] } }, path, 'bad'));
  assert.throws(
    () => writeBinding({ entity: { amount: 1 } }, 'entity.amount.currency', 'RUB'),
    /простое значение/,
  );
  assert.deepEqual(writeBinding({ entity: { title: 'A' } }, 'asset.title', 'B'), { entity: { title: 'B' } });
  assert.deepEqual(writeBinding({ asset: { title: 'A' } }, 'entity.title', 'B'), { asset: { title: 'B' } });
});

test('live suggestions include current fields and sample row paths, never prototype keys', () => {
  const data = JSON.parse(
    '{"entity":{"custom":17},"collections":{"items":[{"name":"A"}]},"__proto__":{"bad":true}}',
  );
  const paths = dataBindingSuggestions(data).map((item) => item.binding);
  assert.ok(paths.includes('entity.custom'));
  assert.ok(paths.includes('collections.items.0.name'));
  assert.ok(!paths.some((path) => path.includes('__proto__')));
});
