import type { ComponentPropDescriptor, ComponentPropIssue } from './component-props';
import type { FieldDefinition, JsonValue } from './model';
import { isJsonValue, isSafeBinding, readPath } from './values';

export interface ResolvedFieldProps {
  label?: string;
  emptyText?: string;
  currency?: string;
  minFractionDigits?: number;
  maxFractionDigits?: number;
  locale?: string;
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
  timeZone?: string;
  statusView?: 'default' | 'accent' | 'positive' | 'warning' | 'negative' | 'dark' | 'light';
  align?: 'start' | 'center' | 'end';
  span?: 1 | 2 | 3;
  suffix?: string;
}
const descriptors: ComponentPropDescriptor[] = [
  { name: 'label', label: 'Подпись поля', type: 'text', defaultValue: 'Подпись' },
  { name: 'emptyText', label: 'Текст пустого значения', type: 'text', defaultValue: 'Не указано' },
  {
    name: 'currency',
    label: 'Валюта',
    type: 'text',
    defaultValue: 'RUB',
    description: 'Трёхбуквенный код валюты, например RUB, EUR или USD. Используется для суммы.',
  },
  {
    name: 'minFractionDigits',
    label: 'Минимум знаков после запятой',
    type: 'number',
    min: 0,
    max: 20,
    defaultValue: 2,
  },
  {
    name: 'maxFractionDigits',
    label: 'Максимум знаков после запятой',
    type: 'number',
    min: 0,
    max: 20,
    defaultValue: 4,
  },
  {
    name: 'locale',
    label: 'Локаль',
    type: 'text',
    defaultValue: 'ru-RU',
    description: 'Языковой тег Intl, например ru-RU или en-US.',
  },
  {
    name: 'dateStyle',
    label: 'Формат даты',
    type: 'text',
    values: ['full', 'long', 'medium', 'short'],
    defaultValue: 'long',
  },
  {
    name: 'timeStyle',
    label: 'Формат времени',
    type: 'text',
    values: ['full', 'long', 'medium', 'short'],
    defaultValue: 'short',
  },
  {
    name: 'timeZone',
    label: 'Часовой пояс',
    type: 'text',
    defaultValue: 'UTC',
    description: 'Часовой пояс Intl, например Europe/Moscow или UTC.',
  },
  {
    name: 'statusView',
    label: 'Вид статуса',
    type: 'text',
    values: ['default', 'accent', 'positive', 'warning', 'negative', 'dark', 'light'],
    defaultValue: 'accent',
  },
  {
    name: 'align',
    label: 'Выравнивание',
    type: 'text',
    values: ['start', 'center', 'end'],
    defaultValue: 'start',
  },
  { name: 'span', label: 'Ширина в колонках', type: 'number', values: [1, 2, 3], defaultValue: 1 },
  { name: 'suffix', label: 'Текст после значения', type: 'text', defaultValue: '' },
];

export function getFieldPropDescriptors(): ComponentPropDescriptor[] {
  return descriptors;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function problem(descriptor: ComponentPropDescriptor, value: unknown): string | undefined {
  if (descriptor.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value))
      return 'укажите целое число.';
    if (
      (descriptor.min !== undefined && value < descriptor.min) ||
      (descriptor.max !== undefined && value > descriptor.max)
    )
      return `допустимое значение от ${descriptor.min} до ${descriptor.max}.`;
  } else if (typeof value !== 'string') return 'укажите текст.';
  if (typeof value === 'string' && value.length > 2000) return 'допустимо не более 2000 символов.';
  if (descriptor.values && !descriptor.values.includes(value as string | number))
    return `выберите одно из значений: ${descriptor.values.join(', ')}.`;
  if (descriptor.name === 'label' && typeof value === 'string' && !value.trim())
    return 'укажите непустую подпись.';
  if (descriptor.name === 'currency' && !/^[A-Z]{3}$/.test(String(value)))
    return 'укажите трёхбуквенный код валюты заглавными латинскими буквами, например EUR.';
  if (descriptor.name === 'locale') {
    try {
      if (Intl.getCanonicalLocales(value as string).length !== 1) return 'укажите один языковой тег Intl.';
    } catch {
      return 'укажите языковой тег Intl, например ru-RU.';
    }
  }
  if (descriptor.name === 'timeZone') {
    try {
      new Intl.DateTimeFormat('ru-RU', { timeZone: value as string });
    } catch {
      return 'укажите поддерживаемый часовой пояс, например Europe/Moscow.';
    }
  }
}
function evaluate(
  props: unknown,
  data?: unknown,
): { props: ResolvedFieldProps; issues: ComponentPropIssue[] } {
  const values: Record<string, JsonValue> = {};
  const issues: ComponentPropIssue[] = [];
  if (props === undefined) return { props: values, issues };
  if (!record(props))
    return {
      props: values,
      issues: [{ key: '', message: 'Параметры поля должны быть объектом источников значений.' }],
    };
  if (Object.keys(props).length > descriptors.length)
    issues.push({ key: '', message: 'Слишком много параметров поля. Используйте параметры его контракта.' });
  for (const [key, source] of Object.entries(props).slice(0, 100)) {
    const descriptor = descriptors.find((item) => item.name === key);
    if (!descriptor) {
      issues.push({ key, message: 'Этот параметр не поддерживается полем.' });
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
      value = readPath(data, source.path);
      if (value === undefined) {
        issues.push({ key, message: `Для параметра «${descriptor.label}» нет значения по указанному пути.` });
        continue;
      }
    } else value = source.value;
    const message = problem(descriptor, value);
    if (message) issues.push({ key, message: `${descriptor.label}: ${message}` });
    else if (!isJsonValue(value))
      issues.push({ key, message: `${descriptor.label}: укажите значение JSON.` });
    else values[key] = value as JsonValue;
  }
  if (
    typeof values.minFractionDigits === 'number' &&
    typeof values.maxFractionDigits === 'number' &&
    values.minFractionDigits > values.maxFractionDigits
  ) {
    issues.push({
      key: 'maxFractionDigits',
      message: 'Максимум знаков после запятой должен быть не меньше минимума.',
    });
    delete values.minFractionDigits;
    delete values.maxFractionDigits;
  }
  return { props: values as ResolvedFieldProps, issues };
}

export function validateFieldProps(props: unknown, data?: unknown): ComponentPropIssue[] {
  return evaluate(props, data).issues;
}
/** Only explicitly configured values are returned. The renderer owns legacy formatting defaults. */
export function resolveFieldProps(
  field: Pick<FieldDefinition, 'props'>,
  data: unknown,
): {
  props: ResolvedFieldProps;
  issues: ComponentPropIssue[];
} {
  return evaluate(field.props, data ?? {});
}
