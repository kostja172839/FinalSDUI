import type { IncomingMessage, ServerResponse } from 'node:http';
import { erpTableMockData, erpTableMockMeta } from '../src/demo/erp-table-fixture';
import { erpExpensesMockData, erpExpensesMockMeta } from '../src/demo/erp-expenses-fixture';
import type {
  FilterParam,
  ErpSortParam,
  IMetaDataItem,
  IMetaDataResponse,
  IRow,
  IRowData,
} from '../src/demo/erp-table-types';
import { isValidDateValue } from '../shared/data-validation';
import { ApiError } from './resolve';

/** Local synthetic sources; request envelopes follow the supplied network example. */
export const ERP_TABLE_DEMO_API_BASE = '/api/demo/erp-table/product-events';
export const ERP_EXPENSES_DEMO_API_BASE = '/api/demo/erp-table/expenses';
interface DemoRowsRequest {
  pageable: { offset: number; limit: number };
  filters: FilterParam[];
  sorts: ErpSortParam[];
}
interface DemoControls {
  scenario: 'normal' | 'empty' | 'error';
  delay: number;
}
interface DemoSource {
  base: string;
  metadata: IMetaDataResponse;
  rows: IRowData;
  nullableLimit: boolean;
}
const sources: DemoSource[] = [
  { base: ERP_TABLE_DEMO_API_BASE, metadata: erpTableMockMeta, rows: erpTableMockData, nullableLimit: false },
  {
    base: ERP_EXPENSES_DEMO_API_BASE,
    metadata: erpExpensesMockMeta,
    rows: erpExpensesMockData,
    nullableLimit: true,
  },
];
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const knownKeys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));

function controls(req: IncomingMessage): DemoControls {
  const url = req.url ?? '';
  const query = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '');
  const keys = ['scenario', 'delay', 'mode', 'accounting-template-code'];
  if (
    [...query.keys()].some((key) => !keys.includes(key)) ||
    keys.some((key) => query.getAll(key).length > 1)
  )
    throw new ApiError(
      400,
      'Поддерживаются scenario, delay, mode и accounting-template-code без повторений.',
    );
  for (const key of ['mode', 'accounting-template-code']) {
    const value = query.get(key);
    if (value !== null && !/^[A-Za-z0-9_.-]{1,100}$/.test(value))
      throw new ApiError(
        400,
        'Параметры контекста демо-таблицы должны содержать до 100 букв, цифр, точек, дефисов или подчёркиваний.',
      );
  }
  const scenario = query.get('scenario') ?? 'normal';
  if (!['normal', 'empty', 'error'].includes(scenario))
    throw new ApiError(400, 'Сценарий должен быть normal, empty или error.');
  const rawDelay = query.get('delay') ?? '200';
  const delay = Number(rawDelay);
  if (!/^\d+$/.test(rawDelay) || !Number.isInteger(delay) || delay < 0 || delay > 3000)
    throw new ApiError(400, 'Задержка delay должна быть целым числом от 0 до 3000 мс.');
  return { scenario: scenario as DemoControls['scenario'], delay };
}

function comparable(value: string, metadata: IMetaDataItem): string | number | undefined {
  const type = metadata.type ?? metadata.dataType;
  if (type === 'money' || type === 'number') {
    if (!/^-?\d+(?:\.\d+)?$/.test(value)) return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  if (type === 'date' || type === 'datetime') {
    if (!isValidDateValue(value)) return undefined;
    return Date.parse(value.includes('T') && !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? `${value}Z` : value);
  }
  return value;
}
function compare(a: string | number, b: string | number): number {
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ru-RU');
}
function rowsRequest(input: Record<string, unknown>, source: DemoSource): DemoRowsRequest {
  if (!knownKeys(input, ['sorts', 'filters', 'pageable']))
    throw new ApiError(400, 'Передайте sorts, filters и pageable по контракту таблицы.');
  const sorts = input.sorts === undefined ? [] : input.sorts;
  if (!Array.isArray(sorts) || sorts.length > 5)
    throw new ApiError(400, 'Поле sorts должно быть массивом до пяти сортировок.');
  const sortFields = new Set<string>();
  const validatedSorts: ErpSortParam[] = [];
  for (const item of sorts) {
    if (
      !record(item) ||
      !knownKeys(item, ['sortParam', 'sortType']) ||
      typeof item.sortParam !== 'string' ||
      typeof item.sortType !== 'string' ||
      !['ASC', 'DESC'].includes(item.sortType)
    )
      throw new ApiError(400, 'Для сортировки передайте sortParam и sortType: ASC или DESC.');
    const column = source.metadata.data?.metadata?.find((value) => value.fieldName === item.sortParam);
    if (!column || column.isHideAlways || column.isFilterSort !== true || sortFields.has(item.sortParam))
      throw new ApiError(400, 'Выберите уникальные сортируемые поля из метаданных демо-таблицы.');
    sortFields.add(item.sortParam);
    validatedSorts.push({ sortParam: item.sortParam, sortType: item.sortType as 'ASC' | 'DESC' });
  }
  const page = input.pageable === undefined ? { offset: 0, limit: 10 } : input.pageable;
  if (
    !record(page) ||
    !knownKeys(page, ['offset', 'limit']) ||
    typeof page.offset !== 'number' ||
    !Number.isInteger(page.offset) ||
    page.offset < 0 ||
    page.offset > 1_000_000 ||
    typeof page.limit !== 'number' ||
    !Number.isInteger(page.limit) ||
    page.limit < 1 ||
    page.limit > 100
  )
    throw new ApiError(
      400,
      'Передайте pageable.offset от 0 до 1000000 и pageable.limit от 1 до 100 целыми числами.',
    );
  const rawFilters = input.filters === undefined ? [] : input.filters;
  if (!Array.isArray(rawFilters) || rawFilters.length > 100)
    throw new ApiError(400, 'Поле filters должно быть массивом до 100 фильтров.');
  const filters: FilterParam[] = [];
  for (const item of rawFilters) {
    if (
      !record(item) ||
      !knownKeys(item, ['predicateHighLevel', 'fieldName', 'search', 'predicateLowLevel']) ||
      typeof item.predicateHighLevel !== 'string' ||
      !['AND', 'OR', 'NOT'].includes(item.predicateHighLevel) ||
      typeof item.predicateLowLevel !== 'string' ||
      !['EQ', 'LIKE', 'IN', 'BETWEEN', 'GT', 'LT'].includes(item.predicateLowLevel) ||
      typeof item.fieldName !== 'string' ||
      !Array.isArray(item.search) ||
      item.search.length < 1 ||
      item.search.length > 50 ||
      !item.search.every((term) => term === null || (typeof term === 'string' && term.length <= 200))
    )
      throw new ApiError(
        400,
        'Фильтр должен содержать predicateHighLevel, fieldName, search и predicateLowLevel из контракта таблицы.',
      );
    const metadata = source.metadata.data?.metadata?.find((column) => column.fieldName === item.fieldName);
    if (!metadata) throw new ApiError(400, 'Поле фильтра отсутствует в метаданных этой демо-таблицы.');
    const operator = item.predicateLowLevel;
    const search = item.search as (string | null)[];
    if (operator === 'BETWEEN' ? search.length !== 2 : operator !== 'IN' && search.length !== 1)
      throw new ApiError(
        400,
        'Для BETWEEN нужны две границы, для IN — список, для остальных операторов — одно значение.',
      );
    if (!['EQ', 'IN'].includes(operator) && search.some((term) => term === null))
      throw new ApiError(400, 'Пустое значение null допускается только для EQ и IN.');
    if (['BETWEEN', 'GT', 'LT'].includes(operator)) {
      const values = search.map((term) => comparable(term!, metadata));
      if (
        values.some((term) => term === undefined) ||
        (operator === 'BETWEEN' && compare(values[0]!, values[1]!) > 0)
      )
        throw new ApiError(400, 'Проверьте тип и порядок значений диапазона фильтра.');
    }
    filters.push({
      predicateHighLevel: item.predicateHighLevel as FilterParam['predicateHighLevel'],
      fieldName: item.fieldName,
      predicateLowLevel: operator as FilterParam['predicateLowLevel'],
      search,
    });
  }
  return { pageable: { offset: page.offset, limit: page.limit }, filters, sorts: validatedSorts };
}

function matches(row: IRow, filter: FilterParam, source: DemoSource): boolean {
  const field = row.fields?.find((item) => item.fieldName === filter.fieldName);
  if (!field) return false;
  const value = field.value;
  const values = Array.isArray(value)
    ? value.map((item) =>
        typeof item === 'string' ? item : filter.predicateLowLevel === 'LIKE' ? item.value : item.techValue,
      )
    : [value];
  if (filter.predicateLowLevel === 'EQ' || filter.predicateLowLevel === 'IN')
    return values.some((item) => filter.search.includes(item));
  if (filter.predicateLowLevel === 'LIKE') {
    const query = filter.search[0]!.toLocaleLowerCase('ru-RU');
    return values.some((item) => item !== null && item.toLocaleLowerCase('ru-RU').includes(query));
  }
  const metadata = source.metadata.data!.metadata!.find((item) => item.fieldName === filter.fieldName)!;
  const first = comparable(filter.search[0]!, metadata)!;
  const second =
    filter.predicateLowLevel === 'BETWEEN' ? comparable(filter.search[1]!, metadata)! : undefined;
  return values.some((item) => {
    if (item === null) return false;
    const actual = comparable(item, metadata);
    if (actual === undefined) return false;
    return filter.predicateLowLevel === 'GT'
      ? compare(actual, first) > 0
      : filter.predicateLowLevel === 'LT'
        ? compare(actual, first) < 0
        : compare(actual, first) >= 0 && compare(actual, second!) <= 0;
  });
}

/** Flat demo semantics: every AND && (OR empty || any OR) && !any NOT.
 * This is not a claim about private backend expression precedence. OR search cannot bypass AND reportId.
 */
function filteredRows(source: DemoSource, filters: FilterParam[]): IRow[] {
  const and = filters.filter((item) => item.predicateHighLevel === 'AND');
  const or = filters.filter((item) => item.predicateHighLevel === 'OR');
  const not = filters.filter((item) => item.predicateHighLevel === 'NOT');
  return (source.rows.data.rows ?? []).filter(
    (row) =>
      and.every((item) => matches(row, item, source)) &&
      (!or.length || or.some((item) => matches(row, item, source))) &&
      !not.some((item) => matches(row, item, source)),
  );
}

function sortedRows(rows: IRow[], sorts: ErpSortParam[], source: DemoSource): IRow[] {
  if (!sorts.length) return rows;
  const specifications = sorts.map((sort) => ({
    ...sort,
    metadata: source.metadata.data!.metadata!.find((column) => column.fieldName === sort.sortParam)!,
  }));
  const sortValue = (row: IRow, metadata: IMetaDataItem): string | number | null => {
    const value = row.fields?.find((field) => field.fieldName === metadata.fieldName)?.value;
    if (value === undefined || value === null || value === '') return null;
    if (Array.isArray(value))
      return value.map((item) => (typeof item === 'string' ? item : item.value)).join(', ');
    return comparable(value, metadata) ?? value;
  };
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      for (const specification of specifications) {
        const first = sortValue(a.row, specification.metadata),
          second = sortValue(b.row, specification.metadata);
        if (first === null || second === null) {
          if (first !== second) return first === null ? 1 : -1;
          continue;
        }
        const result = compare(first, second);
        if (result) return result * (specification.sortType === 'DESC' ? -1 : 1);
      }
      return a.index - b.index;
    })
    .map(({ row }) => row);
}

/** Cancel timers/listeners on disconnect; no delayed response survives an aborted request. */
function waitForClient(req: IncomingMessage, res: ServerResponse, delay: number): Promise<boolean> {
  if (req.aborted || res.destroyed) return Promise.resolve(false);
  if (!delay) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.off('aborted', abort);
      res.off('close', abort);
      resolve(connected);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), delay);
    timer.unref();
    req.once('aborted', abort);
    res.once('close', abort);
    if (req.aborted || res.destroyed) finish(false);
  });
}

export async function handleErpTableDemo(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  readBody: (req: IncomingMessage) => Promise<Record<string, unknown>>,
  sendJson: (res: ServerResponse, status: number, value: unknown) => void,
): Promise<boolean> {
  const source = sources.find((item) => pathname === item.base || pathname === `${item.base}/metadata`);
  if (!source) return false;
  const metadataRoute = pathname.endsWith('/metadata');
  if ((req.method ?? 'GET') !== (metadataRoute ? 'GET' : 'POST'))
    throw new ApiError(
      405,
      metadataRoute
        ? 'Метаданные демо-таблицы доступны через GET.'
        : 'Строки демо-таблицы доступны через POST по адресу таблицы.',
    );
  const simulation = controls(req);
  const request = metadataRoute ? undefined : rowsRequest(await readBody(req), source);
  if (!(await waitForClient(req, res, simulation.delay))) return true;
  if (simulation.scenario === 'error')
    throw new ApiError(
      503,
      'Демонстрационный источник таблицы временно недоступен. Выберите обычный сценарий и повторите запрос.',
    );
  if (metadataRoute) {
    sendJson(res, 200, structuredClone(source.metadata));
    return true;
  }
  const input = request!;
  const allRows =
    simulation.scenario === 'empty'
      ? []
      : sortedRows(filteredRows(source, input.filters), input.sorts, source);
  const rows = allRows.slice(input.pageable.offset, input.pageable.offset + input.pageable.limit);
  const result: IRowData = {
    data: {
      rows: structuredClone(rows),
      page: {
        offset: input.pageable.offset,
        limit: source.nullableLimit ? null : input.pageable.limit,
        count: rows.length,
        totalElements: allRows.length,
      },
      additionalInfo: structuredClone(source.rows.data.additionalInfo ?? null),
    },
    messages: [],
  };
  sendJson(res, 200, result);
  return true;
}
