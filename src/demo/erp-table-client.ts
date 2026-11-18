import type { ErpSortParam, FilterParam, IMetaDataResponse, IRowData } from './erp-table-types';
export type { ErpSortParam, FilterParam } from './erp-table-types';

/** Local demo protocol only. Private ErpTableWidget integrations use their own client. */
export const ERP_TABLE_DEMO_API_URL = '/api/demo/erp-table/product-events';
export interface ErpDemoRowsRequest {
  sorts: ErpSortParam[];
  filters: FilterParam[];
  pageable: { offset: number; limit: number };
}

export function erpDemoRequestUrls(tableUrl: string): { metadataUrl: string; rowsUrl: string } {
  if (
    typeof tableUrl !== 'string' ||
    !tableUrl.startsWith('/') ||
    tableUrl.startsWith('//') ||
    /[\\#\s]/.test(tableUrl)
  )
    throw new Error(
      'Локальная демо-таблица поддерживает только адреса ERP-моков product-events и expenses. Для других адресов подключите настоящий ERP-компонент приложения.',
    );
  const queryIndex = tableUrl.indexOf('?');
  const pathname = queryIndex < 0 ? tableUrl : tableUrl.slice(0, queryIndex);
  if (![ERP_TABLE_DEMO_API_URL, '/api/demo/erp-table/expenses', '/demo/erp-table'].includes(pathname))
    throw new Error(
      'Этот адрес не относится к локальному ERP-моку. Используйте /api/demo/erp-table/product-events, /api/demo/erp-table/expenses или подключите ERP-компонент приложения.',
    );
  const params = new URLSearchParams(queryIndex < 0 ? '' : tableUrl.slice(queryIndex + 1));
  for (const key of params.keys()) {
    if (!['scenario', 'delay', 'mode', 'accounting-template-code'].includes(key))
      throw new Error(
        'Локальный ERP-мок поддерживает только параметры scenario, delay, mode и accounting-template-code.',
      );
    if (params.getAll(key).length !== 1) throw new Error(`Параметр ${key} должен быть указан один раз.`);
  }
  if (params.has('scenario') && !['normal', 'empty', 'error'].includes(params.get('scenario')!))
    throw new Error('Для scenario укажите normal, empty или error.');
  if (params.has('delay') && (!/^\d+$/.test(params.get('delay')!) || Number(params.get('delay')) > 3000))
    throw new Error('Для delay укажите целое число от 0 до 3000 миллисекунд.');
  const query = params.size ? `?${params.toString()}` : '';
  const metadataParams = new URLSearchParams(
    [...params].filter(([key]) => ['scenario', 'delay'].includes(key)),
  );
  const metadataQuery = metadataParams.size ? `?${metadataParams.toString()}` : '';
  const base = pathname === '/demo/erp-table' ? ERP_TABLE_DEMO_API_URL : pathname;
  return {
    // The supplied request adds mode/template context to rows, while metadata uses only the base path.
    metadataUrl: `${base}/metadata${metadataQuery}`,
    rowsUrl: `${base}${query}`,
  };
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nullableText = (value: unknown) => value === undefined || value === null || typeof value === 'string';
const optionalText = (value: unknown) => value === undefined || typeof value === 'string';
const optionalFinite = (value: unknown) =>
  value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value));
const fieldTypes = ['number', 'string', 'date', 'datetime', 'money', 'boolean', 'array', 'arrayObject'];
function metadataField(value: unknown): boolean {
  return (
    object(value) &&
    typeof value.fieldName === 'string' &&
    Boolean(value.fieldName.trim()) &&
    nullableText(value.fieldTitle) &&
    optionalFinite(value.position) &&
    optionalFinite(value.minimalWidth) &&
    (typeof value.minimalWidth !== 'number' || value.minimalWidth >= 0) &&
    (value.type === undefined ||
      value.type === null ||
      (typeof value.type === 'string' && fieldTypes.includes(value.type))) &&
    (value.dataType === undefined ||
      value.dataType === null ||
      (typeof value.dataType === 'string' && fieldTypes.slice(0, 6).includes(value.dataType)))
  );
}
function fieldValue(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    value === null ||
    (Array.isArray(value) &&
      (value.every((item) => typeof item === 'string') ||
        value.every(
          (item) => object(item) && typeof item.value === 'string' && typeof item.techValue === 'string',
        )))
  );
}
function rowField(value: unknown): boolean {
  return (
    object(value) &&
    typeof value.fieldName === 'string' &&
    Boolean(value.fieldName.trim()) &&
    fieldValue(value.value) &&
    nullableText(value.subValue) &&
    nullableText(value.label) &&
    nullableText(value.badgeId) &&
    nullableText(value.iconId)
  );
}
function rowsPage(page: unknown, rowCount: number, requestedLimit: number): boolean {
  if (
    !object(page) ||
    !['offset', 'count', 'totalElements'].every(
      (key) => typeof page[key] === 'number' && Number.isSafeInteger(page[key]) && (page[key] as number) >= 0,
    )
  )
    return false;
  const { offset, count, totalElements } = page as Record<string, number>;
  const limit = page.limit === null ? requestedLimit : page.limit;
  return (
    offset <= 1_000_000 &&
    typeof limit === 'number' &&
    Number.isSafeInteger(limit) &&
    limit > 0 &&
    limit <= 100 &&
    count === rowCount &&
    count <= limit &&
    totalElements >= count &&
    (count === 0 || offset + count <= totalElements)
  );
}
async function readJson(response: Response): Promise<unknown> {
  let value: unknown;
  try {
    value = JSON.parse(await response.text()) as unknown;
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') throw error;
    if (!response.ok) throw new Error(`ERP-мок вернул ошибку HTTP ${response.status}.`);
    throw new Error('ERP-мок вернул ответ не в формате JSON.');
  }
  if (!response.ok) {
    const message =
      object(value) &&
      (typeof value.error === 'string'
        ? value.error
        : typeof value.message === 'string'
          ? value.message
          : undefined);
    throw new Error(
      message ? `${message} (HTTP ${response.status}).` : `ERP-мок вернул ошибку HTTP ${response.status}.`,
    );
  }
  return value;
}

export async function fetchErpDemoMetadata(
  tableUrl: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<IMetaDataResponse> {
  const { metadataUrl } = erpDemoRequestUrls(tableUrl);
  const response = await fetchImpl(metadataUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
    credentials: 'same-origin',
    redirect: 'error',
  });
  const value = await readJson(response);
  if (
    !object(value) ||
    !object(value.data) ||
    !Array.isArray(value.data.metadata) ||
    !value.data.metadata.every(metadataField) ||
    !nullableText(value.data.emptyTableDescription) ||
    (value.data.badges !== undefined &&
      value.data.badges !== null &&
      (!Array.isArray(value.data.badges) ||
        !value.data.badges.every(
          (badge) =>
            object(badge) &&
            nullableText(badge.badgeId) &&
            (badge.view === undefined ||
              badge.view === null ||
              (typeof badge.view === 'string' &&
                ['main', 'default', 'accent', 'positive', 'warning', 'negative', 'dark', 'light'].includes(
                  badge.view,
                ))) &&
            (badge.isTransparent === undefined ||
              badge.isTransparent === null ||
              typeof badge.isTransparent === 'boolean'),
        )))
  )
    throw new Error(
      'ERP-мок вернул некорректные метаданные: ожидается data.metadata со списком полей fieldName.',
    );
  return value as IMetaDataResponse;
}

export async function fetchErpDemoRows(
  tableUrl: string,
  request: ErpDemoRowsRequest,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<IRowData> {
  const { rowsUrl } = erpDemoRequestUrls(tableUrl);
  const response = await fetchImpl(rowsUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
    credentials: 'same-origin',
    redirect: 'error',
  });
  const value = await readJson(response);
  if (
    !object(value) ||
    !object(value.data) ||
    !Array.isArray(value.data.rows) ||
    !value.data.rows.every(
      (row) =>
        object(row) &&
        (row.fields === undefined || (Array.isArray(row.fields) && row.fields.every(rowField))),
    ) ||
    !rowsPage(value.data.page, value.data.rows.length, request.pageable.limit) ||
    (value.data.additionalInfo !== undefined &&
      value.data.additionalInfo !== null &&
      (!Array.isArray(value.data.additionalInfo) ||
        !value.data.additionalInfo.every((info) => object(info) && optionalText(info.text))))
  )
    throw new Error(
      'ERP-мок вернул некорректные строки: проверьте fields[].value, subValue и числовые offset, limit, count, totalElements в data.page.',
    );
  return value as unknown as IRowData;
}
