import type { VisibilityRule } from '../../shared/model';
import { readPath } from '../../shared/values';
export const readBinding = readPath;
export function isVisible(rule: VisibilityRule | undefined, data: unknown): boolean {
  if (!rule) return true;
  const value = readBinding(data, rule.binding);
  return rule.operator === 'notEmpty'
    ? value !== null && value !== undefined && value !== ''
    : String(value ?? '') === rule.value;
}
export function displayText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return String(object.label ?? object.name ?? JSON.stringify(value));
  }
  return String(value);
}
export function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return undefined;
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
