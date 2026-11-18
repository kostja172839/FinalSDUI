import { isJsonValue } from './values';

/** JSON-safe props from the supplied ErpTableWidget declaration. Runtime functions stay in the host. */
export const ERP_TABLE_DATA_PROPS = [
  'isTabs',
  'isRegistryPageUsage',
  'customOffset',
  'defaultRowSize',
  'showInControlRowSize',
  'paginationSize',
  'stend',
  'enableFilters',
  'enableColumns',
  'isUrlFiltersEnabled',
  'defaultSelectRows',
  'defaultQueryFiltres',
  'techFilters',
  'initialFilters',
  'mfAdditionalProps',
  'customParams',
  'tableFullscreenZIndex',
] as const;
export const ERP_TABLE_EVENTS = [
  'setActiveSplit',
  'setRightContent',
  'onSelectChange',
  'onEditSuccess',
  'onEditLoading',
  'onEditError',
  'onFetchData',
  'onSelectRowsChange',
  'onChangeNoteInfo',
] as const;

export function safeErpTableUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    /[\s\\\u0000-\u001f\u007f]/.test(value)
  )
    return false;
  if (/^\/(?!\/)/.test(value)) return true;
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export interface ErpTableOptionIssue {
  path: string;
  message: string;
}

/** Checks only known serialization shape; private filter and custom-parameter contracts belong to the table. */
export function validateErpTableOptions(value: unknown): ErpTableOptionIssue[] {
  const issues: ErpTableOptionIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (value === undefined) return issues;
  if (!record(value) || !isJsonValue(value))
    return [{ path: '', message: 'Настройки таблицы должны быть объектом JSON.' }];
  for (const [key, item] of Object.entries(value)) {
    if (!(ERP_TABLE_DATA_PROPS as readonly string[]).includes(key)) {
      add(key, 'Настройка передаётся только из кода приложения или не поддерживается таблицей.');
      continue;
    }
    if (
      [
        'isTabs',
        'isRegistryPageUsage',
        'showInControlRowSize',
        'enableFilters',
        'enableColumns',
        'isUrlFiltersEnabled',
      ].includes(key)
    ) {
      if (typeof item !== 'boolean') add(key, 'Укажите логическое значение.');
    } else if (key === 'defaultRowSize') {
      if (!['small', 'medium', 'big'].includes(String(item)))
        add(key, 'Размер строки: small, medium или big.');
    } else if (key === 'customOffset' || key === 'tableFullscreenZIndex') {
      const max = key === 'customOffset' ? 2000 : 2147483647;
      if (typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item > max)
        add(key, `Укажите целое число от 0 до ${max}.`);
    } else if (key === 'stend') {
      if (item !== null && !['alpha', 'sigma'].includes(String(item)))
        add(key, 'Стенд: alpha, sigma или null.');
    } else if (key === 'paginationSize') {
      if (!record(item)) add(key, 'Настройте размер и число позиций пагинации.');
      else {
        if (Object.keys(item).some((name) => !['size', 'slots'].includes(name)))
          add(key, 'Неизвестная настройка пагинации.');
        if (item.size !== undefined && !['s', 'xs'].includes(String(item.size)))
          add(`${key}.size`, 'Размер пагинации: s или xs.');
        if (
          item.slots !== undefined &&
          (typeof item.slots !== 'number' ||
            !Number.isInteger(item.slots) ||
            item.slots < 7 ||
            item.slots > 15)
        )
          add(`${key}.slots`, 'Число позиций должно быть от 7 до 15.');
      }
    } else if (key === 'defaultSelectRows') {
      if (
        !Array.isArray(item) ||
        item.length > 1000 ||
        !item.every((id) => typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id)))
      )
        add(key, 'Укажите список ID строк: строки или числа, до 1000 элементов.');
    } else if (['defaultQueryFiltres', 'techFilters', 'initialFilters'].includes(key)) {
      if (!Array.isArray(item) || item.length > 500) add(key, 'Укажите массив фильтров, до 500 элементов.');
    } else if (key === 'mfAdditionalProps' || key === 'customParams') {
      if (!record(item)) add(key, 'Укажите объект параметров.');
    }
  }
  return issues;
}
