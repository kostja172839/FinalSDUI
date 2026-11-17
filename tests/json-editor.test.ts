import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonDocument, jsonPathRange, jsonLineColumn } from '../shared/json-editor';

test('JSON editor rejects syntax, comments, duplicate decoded keys and unsafe/deep objects', () => {
  for (const text of [
    '{"x":}',
    '{"x":1,}',
    '{/*comment*/"x":1}',
    '{"x":1,"\\u0078":2}',
    '{"__proto__":{"polluted":true}}',
    '[]',
  ])
    assert.ok(parseJsonDocument(text).problems.length, text);
  assert.match(parseJsonDocument('{"x":1,"x":2}').problems[0].message, /повторяется/);
  const deep = '{"x":'.repeat(30) + '0' + '}'.repeat(30);
  assert.equal(parseJsonDocument(deep).value, undefined);
});

test('JSON editor preserves primitive values and locates exact nested errors', () => {
  const text =
    '{\n  "entity": {"zero":0,"flag":false,"empty":null},\n  "collections":{"rows":[{"amount":15}]}\n}';
  const parsed = parseJsonDocument(text);
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(parsed.value?.entity, { zero: 0, flag: false, empty: null });
  const range = jsonPathRange(parsed.tree, '$.collections.rows[0].amount');
  assert.equal(text.slice(range.offset, range.offset + range.length), '15');
  assert.equal(jsonLineColumn(text, range.offset).line, 3);
  assert.ok(jsonPathRange(parsed.tree, '$.collections.rows[0].missing').offset > 0);
});

test('deep JSON below the size limit produces a diagnostic rather than crashing the editor', () => {
  const input = '{"x":'.repeat(10000) + '0' + '}'.repeat(10000);
  const result = parseJsonDocument(input);
  assert.equal(result.value, undefined);
  assert.match(result.problems[0].message, /24/);
});
