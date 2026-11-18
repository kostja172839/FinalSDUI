import type { ComponentPropDescriptor, ComponentPropIssue } from './component-props';
import type { JsonValue, ValueSource, WidgetContext } from './model';
import { isSafeBinding, readPath } from './values';

export interface ActionPresentationEntry {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  presentation?: Record<string, ValueSource>;
}
export interface ResolvedActionPresentation {
  label: string;
  visible: boolean;
  disabled: boolean;
  size: 'sm' | 'md';
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  issues: ComponentPropIssue[];
}
const descriptors: ComponentPropDescriptor[] = [
  {
    name: 'label',
    label: 'Подпись действия',
    type: 'text',
    defaultValue: 'Действие',
    description: 'Непустой текст до 120 символов.',
  },
  { name: 'disabled', label: 'Действие недоступно', type: 'boolean', defaultValue: false },
  { name: 'visible', label: 'Показывать действие', type: 'boolean', defaultValue: true },
  { name: 'size', label: 'Размер кнопки', type: 'text', values: ['sm', 'md'], defaultValue: 'sm' },
  {
    name: 'variant',
    label: 'Вид кнопки',
    type: 'text',
    values: ['primary', 'secondary', 'ghost', 'danger'],
    defaultValue: 'secondary',
  },
];
export function getActionPresentationDescriptors(): ComponentPropDescriptor[] {
  return descriptors;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function evaluate(presentation: unknown, data?: Record<string, unknown>, context?: WidgetContext) {
  const values: Record<string, JsonValue> = {};
  const issues: ComponentPropIssue[] = [];
  if (presentation === undefined) return { values, issues };
  if (!record(presentation))
    return {
      values,
      issues: [{ key: '', message: 'Оформление действия должно быть объектом источников значений.' }],
    };
  const scope = context ? { ...data, $context: context } : data;
  if (Object.keys(presentation).length > descriptors.length)
    issues.push({ key: '', message: 'Используйте только параметры оформления из контракта действия.' });
  for (const [key, source] of Object.entries(presentation).slice(0, 100)) {
    const descriptor = descriptors.find((item) => item.name === key);
    if (!descriptor) {
      issues.push({ key, message: 'Неизвестный параметр оформления действия.' });
      continue;
    }
    if (
      !record(source) ||
      (source.kind !== 'literal' && source.kind !== 'binding') ||
      Object.keys(source).some(
        (name) => !['kind', source.kind === 'literal' ? 'value' : 'path'].includes(name),
      )
    ) {
      issues.push({ key, message: 'Укажите источник literal/value или binding/path.' });
      continue;
    }
    let value: unknown;
    if (source.kind === 'binding') {
      if (typeof source.path !== 'string' || !isSafeBinding(source.path)) {
        issues.push({ key, message: 'Укажите безопасный путь к данным через точку.' });
        continue;
      }
      if (data === undefined) continue;
      value = readPath(scope, source.path);
      if (value === undefined) {
        issues.push({ key, message: `Нет значения для параметра «${descriptor.label}» по указанному пути.` });
        continue;
      }
    } else value = source.value;
    if (
      key === 'label'
        ? typeof value !== 'string' || !value.trim() || value.length > 120
        : descriptor.type === 'boolean'
          ? typeof value !== 'boolean'
          : typeof value !== 'string' || !descriptor.values?.includes(value)
    ) {
      issues.push({
        key,
        message: `${descriptor.label}: ${key === 'label' ? 'укажите непустой текст до 120 символов.' : descriptor.type === 'boolean' ? 'ожидается true или false.' : `выберите ${descriptor.values?.join(', ')}.`}`,
      });
      continue;
    }
    values[key] = value as JsonValue;
  }
  return { values, issues };
}
export function validateActionPresentation(
  presentation: unknown,
  data?: Record<string, unknown>,
  context?: WidgetContext,
): ComponentPropIssue[] {
  return evaluate(presentation, data, context).issues;
}
/** Invalid or unresolved presentation is fail-closed for execution, without hiding its diagnostic. */
export function resolveActionPresentation(
  entry: ActionPresentationEntry,
  data: Record<string, unknown>,
  context: WidgetContext,
  defaultVariant: ResolvedActionPresentation['variant'] = 'secondary',
): ResolvedActionPresentation {
  const result = evaluate(entry.presentation, data, context);
  return {
    label: (result.values.label as string | undefined) ?? entry.label,
    visible: (result.values.visible as boolean | undefined) ?? true,
    disabled: result.issues.length > 0 || result.values.disabled === true,
    size: (result.values.size as 'sm' | 'md' | undefined) ?? 'sm',
    variant:
      (result.values.variant as ResolvedActionPresentation['variant'] | undefined) ??
      entry.variant ??
      defaultVariant,
    issues: result.issues,
  };
}
/** Both runtime entry points cross this gate before invoking their trusted host callback. */
export async function invokeWithActionPresentation(
  entry: ActionPresentationEntry,
  data: Record<string, unknown>,
  context: WidgetContext,
  invoke: () => void | Promise<void>,
): Promise<boolean> {
  const presentation = resolveActionPresentation(entry, data, context);
  if (!presentation.visible || presentation.disabled) return false;
  await invoke();
  return true;
}
