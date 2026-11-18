import { erpDemoRequestUrls } from './erp-table-client';
import type { FilterParam, IMetaDataResponse } from './erp-table-types';

const high = ['AND', 'OR', 'NOT'];
const low = ['LIKE', 'EQ', 'IN', 'BETWEEN', 'GT', 'LT'];
/** Validate the supplied FilterParam shape; do not evaluate values or field names as code. */
export function erpPreviewFilters(...groups: unknown[]): FilterParam[] {
  const result: FilterParam[] = [];
  for (const group of groups) {
    if (group === undefined) continue;
    if (!Array.isArray(group) || group.length > 100)
      throw new Error('Фильтры таблицы должны быть списком FilterParam, не более 100 условий.');
    for (const filter of group) {
      if (
        !filter ||
        typeof filter !== 'object' ||
        Array.isArray(filter) ||
        !high.includes(filter.predicateHighLevel) ||
        !low.includes(filter.predicateLowLevel) ||
        typeof filter.fieldName !== 'string' ||
        !filter.fieldName.trim() ||
        !Array.isArray(filter.search) ||
        filter.search.length > 100 ||
        !filter.search.every((value: unknown) => value === null || typeof value === 'string')
      )
        throw new Error('Проверьте FilterParam: predicateHighLevel, fieldName, search и predicateLowLevel.');
      result.push({
        predicateHighLevel: filter.predicateHighLevel,
        fieldName: filter.fieldName,
        search: [...filter.search],
        predicateLowLevel: filter.predicateLowLevel,
      });
    }
  }
  if (result.length > 100) throw new Error('В демо-таблице разрешено не более 100 фильтров.');
  return result;
}

/** Demo search uses known FilterParam operators; the private widget's search payload is unconfirmed. */
export function erpPreviewSearch(query: string, metadata?: IMetaDataResponse): FilterParam[] {
  if (!query.trim()) return [];
  return (metadata?.data?.metadata ?? [])
    .filter((column) => column.fieldName && !column.isHideAlways)
    .map((column) => ({
      predicateHighLevel: 'OR',
      fieldName: column.fieldName!,
      search: [query],
      predicateLowLevel: 'LIKE',
    }));
}

export function erpPreviewUrl(tableUrl: string, customParams: unknown, scenario: string): string {
  erpDemoRequestUrls(tableUrl); // Check the original address before URL normalization.
  if (
    customParams !== undefined &&
    (!customParams || typeof customParams !== 'object' || Array.isArray(customParams))
  )
    throw new Error('customParams должен быть объектом.');
  const params = (customParams ?? {}) as Record<string, unknown>;
  if (Object.keys(params).some((key) => !['mode', 'accountingTemplateCode'].includes(key)))
    throw new Error(
      'Демо API поддерживает customParams.mode и customParams.accountingTemplateCode. Другие параметры обрабатывает ваш ErpTableWidget.',
    );
  const queryIndex = tableUrl.indexOf('?');
  const base = queryIndex < 0 ? tableUrl : tableUrl.slice(0, queryIndex);
  const query = new URLSearchParams(queryIndex < 0 ? '' : tableUrl.slice(queryIndex + 1));
  for (const [source, target] of [
    ['mode', 'mode'],
    ['accountingTemplateCode', 'accounting-template-code'],
  ]) {
    const value = params[source];
    if (value === undefined) continue;
    if (typeof value !== 'string') throw new Error(`customParams.${source} должен быть строкой.`);
    query.set(target, value);
  }
  if (scenario) query.set('scenario', scenario);
  const result = `${base}${query.size ? `?${query}` : ''}`;
  erpDemoRequestUrls(result);
  return result;
}
