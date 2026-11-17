import test from 'node:test';
import assert from 'node:assert/strict';
import { getFooterActions, getHeaderActions } from '../shared/actions';
import { catalog } from '../shared/catalog';
import type { SplitAction, SplitTemplate } from '../shared/model';
import { seedTemplates } from '../shared/seeds';
import { validateTemplate } from '../shared/validation';

const action = (id: string, label = 'Открыть карточку'): SplitAction => ({
  id,
  label,
  kind: 'openWidget',
  widgetId: 'asset-editor',
});

function legacyTemplate(): SplitTemplate {
  const definition = structuredClone(seedTemplates[0].draft);
  delete definition.header.actions;
  delete definition.footer.actions;
  definition.footer.widgetId = 'asset-editor';
  definition.footer.actionLabel = 'Открыть сохранённый виджет';
  return definition;
}

function errors(definition: unknown, widgetIds?: string[]) {
  return validateTemplate(definition, widgetIds ? { widgetIds } : {}).filter(
    (issue) => issue.severity === 'error',
  );
}

test('legacy templates expose header and footer actions without changing the saved definition', () => {
  const definition = legacyTemplate();
  const saved = structuredClone(definition);
  assert.deepEqual(getHeaderActions(definition), [
    action('legacy-header-widget', 'Открыть сохранённый виджет'),
  ]);
  assert.deepEqual(getFooterActions(definition), [
    action('legacy-footer-widget', 'Открыть сохранённый виджет'),
  ]);
  assert.deepEqual(definition, saved);
  assert.deepEqual(errors(definition), []);

  delete definition.footer.widgetId;
  delete definition.footer.actionLabel;
  assert.deepEqual(getHeaderActions(definition), []);
  assert.deepEqual(getFooterActions(definition), []);
});

test('explicit menus replace legacy defaults and empty menus stay disabled', () => {
  const definition = legacyTemplate();
  definition.header.actions = [action('header-card', 'Карточка объекта')];
  definition.footer.actions = [action('footer-card', 'Подробнее')];
  assert.deepEqual(getHeaderActions(definition), definition.header.actions);
  assert.deepEqual(getFooterActions(definition), definition.footer.actions);
  assert.deepEqual(errors(definition), []);

  definition.header.actions = [];
  definition.footer.actions = [];
  assert.deepEqual(getHeaderActions(definition), []);
  assert.deepEqual(getFooterActions(definition), []);
  assert.deepEqual(errors(definition), []);
});

test('action targets are registered external widgets rather than executable instructions', () => {
  const definition = legacyTemplate();
  definition.header.actions = [action('header-card')];
  assert.deepEqual(errors(definition), []);

  definition.header.actions[0].widgetId = 'asset-history';
  assert.ok(errors(definition).some((issue) => issue.path === '$.header.actions[0].widgetId'));

  definition.header.actions[0].widgetId = 'https://untrusted.example/widget.js';
  assert.ok(errors(definition).some((issue) => issue.path === '$.header.actions[0].widgetId'));

  definition.header.actions[0].widgetId = 'asset-editor';
  (definition.header.actions[0] as { kind: string }).kind = 'executeScript';
  assert.ok(errors(definition).some((issue) => issue.path === '$.header.actions[0].kind'));
});

test('menu action IDs are unique across header and footer', () => {
  const definition = legacyTemplate();
  definition.header.actions = [action('same-action')];
  definition.footer.actions = [action('same-action')];
  assert.ok(errors(definition).some((issue) => issue.path === '$.footer.actions[0].id'));

  definition.footer.actions = [action('footer-card')];
  definition.header.actions.push(action('same-action'));
  assert.ok(errors(definition).some((issue) => issue.path === '$.header.actions[1].id'));
});

test('menus reject missing labels, malformed arrays and unbounded action lists', () => {
  const definition = legacyTemplate();
  definition.header.actions = [action('header-card', '')];
  assert.ok(errors(definition).some((issue) => issue.path === '$.header.actions[0].label'));

  definition.header.actions = Array.from({ length: 13 }, (_, index) => action(`header-${index}`));
  assert.ok(errors(definition).some((issue) => issue.path === '$.header.actions'));

  const malformed = structuredClone(definition) as unknown as {
    header: { actions: unknown };
  };
  malformed.header.actions = { id: 'not-a-list' };
  assert.ok(errors(malformed).some((issue) => issue.path === '$.header.actions'));
});

test('menu widgets participate in the client capability contract', () => {
  const definition = legacyTemplate();
  definition.header.actions = [action('header-card')];
  definition.footer.actions = [action('footer-card')];
  assert.ok(errors(definition, []).some((issue) => issue.path === '$.header.actions[0].widgetId'));
  assert.ok(errors(definition, []).some((issue) => issue.path === '$.footer.actions[0].widgetId'));
  assert.deepEqual(
    errors(
      definition,
      catalog.widgets.map((widget) => widget.id),
    ),
    [],
  );
});

test('all shipped menu definitions remain valid for the registered client', () => {
  for (const record of seedTemplates) {
    assert.deepEqual(
      errors(
        record.draft,
        catalog.widgets.map((widget) => widget.id),
      ),
      [],
    );
    for (const revision of record.versions) assert.deepEqual(errors(revision.definition), []);
  }
});
