import type { SplitAction, SplitTemplate } from './model';

/** Old definitions keep their meaning; only rendering defaults are derived, never persisted. */
function legacyAction(template: SplitTemplate, placement: 'header' | 'footer'): SplitAction[] {
  if (!template.footer.widgetId) return [];
  return [
    {
      id: `legacy-${placement}-widget`,
      label: template.footer.actionLabel || 'Открыть карточку объекта',
      kind: 'openWidget',
      widgetId: template.footer.widgetId,
    },
  ];
}

export function getHeaderActions(template: SplitTemplate): SplitAction[] {
  return template.header.actions ?? legacyAction(template, 'header');
}

export function getFooterActions(template: SplitTemplate): SplitAction[] {
  return template.footer.actions ?? legacyAction(template, 'footer');
}
