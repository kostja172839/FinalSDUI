import test from 'node:test';
import assert from 'node:assert/strict';
import { editJsonDraft, jsonDraftStatus, syncJsonDraft } from '../shared/json-draft';
test('clean JSON follows visual edits while uncommitted text retains its original baseline', () => {
  const clean = { base: 'old', text: 'old' };
  assert.deepEqual(syncJsonDraft(clean, 'visual'), { base: 'visual', text: 'visual' });
  const dirty = editJsonDraft(clean, 'old', 'my raw edit');
  assert.deepEqual(syncJsonDraft(dirty, 'visual'), dirty);
  assert.deepEqual(jsonDraftStatus(dirty, 'visual'), { dirty: true, conflict: true });
  const continued = editJsonDraft(dirty, 'visual', 'my continued edit');
  assert.equal(continued.base, 'old');
  assert.equal(jsonDraftStatus(continued, 'visual').conflict, true);
});
test('accepting or resetting an editor clears pending changes without retaining a conflict', () => {
  assert.deepEqual(jsonDraftStatus({ base: 'new', text: 'new' }, 'new'), { dirty: false, conflict: false });
  assert.deepEqual(jsonDraftStatus({ base: 'old', text: 'visual' }, 'visual'), {
    dirty: false,
    conflict: false,
  });
  const matched = syncJsonDraft({ base: 'old', text: 'visual' }, 'visual');
  assert.equal(editJsonDraft(matched, 'visual', 'next edit').base, 'visual');
});
