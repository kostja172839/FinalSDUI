import type {
  ArrayObjectItem,
  IAddInfo,
  IBadges,
  IField,
  IMetaDataItem,
  IMetaDataResponse,
  IRow,
  IRowData,
} from './erp-table-types';
import { isValidDateValue } from '../../shared/data-validation';

export type DemoErpCellType = NonNullable<IMetaDataItem['type']>;
export interface DemoErpColumn {
  fieldName: string;
  title: string;
  type: DemoErpCellType;
  minimumWidth: number;
  wrap: boolean;
  metadata: IMetaDataItem;
}
export interface DemoErpCell {
  text: string;
  subValue?: string;
  badge?: IBadges;
  empty: boolean;
  field?: IField;
}
export interface DemoErpRow {
  /** Local render key only. The supplied IRow contract does not declare a row ID. */
  key: string;
  sourceIndex: number;
  source: IRow;
  cells: Record<string, DemoErpCell>;
}
export interface DemoErpState {
  query?: string;
  sort?: { fieldName: string; direction: 'asc' | 'desc' };
  pageIndex?: number;
  pageSize?: number;
  paginate?: boolean;
  includeDefaultHidden?: boolean;
}
export interface DemoErpModel {
  columns: DemoErpColumn[];
  rows: DemoErpRow[];
  totalRows: number;
  filteredRows: number;
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  from: number;
  to: number;
  additionalInfo: IAddInfo[];
}

export function projectErpColumns(meta: IMetaDataResponse, includeDefaultHidden = false): DemoErpColumn[] {
  const seen = new Set<string>();
  return (meta.data?.metadata ?? [])
    .map((metadata, index) => ({ metadata, index }))
    .filter(
      ({ metadata }) =>
        !!metadata.fieldName && !metadata.isHideAlways && (includeDefaultHidden || !metadata.isHideByDefault),
    )
    .sort((a, b) => {
      const position = (value: IMetaDataItem) =>
        typeof value.position === 'number' && Number.isFinite(value.position) ? value.position : Infinity;
      const first = position(a.metadata),
        second = position(b.metadata);
      return first === second ? a.index - b.index : first - second;
    })
    .filter(({ metadata }) => {
      if (seen.has(metadata.fieldName!)) return false;
      seen.add(metadata.fieldName!);
      return true;
    })
    .map(({ metadata }) => ({
      fieldName: metadata.fieldName!,
      title: metadata.fieldTitle || metadata.fieldName!,
      type: metadata.type ?? metadata.dataType ?? 'string',
      minimumWidth:
        typeof metadata.minimalWidth === 'number' && metadata.minimalWidth > 0 ? metadata.minimalWidth : 160,
      wrap: metadata.isWrapEnabled ?? false,
      metadata,
    }));
}

const numeric = (value: string): number | undefined => {
  if (!value.trim() || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
};
function parsedDate(value: string): Date | undefined {
  // Calendar validity belongs to the source date. Its UTC day can legitimately
  // differ when an explicit timezone offset crosses midnight.
  if (!isValidDateValue(value)) return undefined;
  const utcValue = value.includes('T') && !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? `${value}Z` : value;
  const date = new Date(utcValue);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
function formatDate(value: string, datetime: boolean): string {
  const date = parsedDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(datetime ? ({ hour: '2-digit', minute: '2-digit' } as const) : {}),
    timeZone: 'UTC',
  }).format(date);
}
const arrayText = (value: string[] | ArrayObjectItem[]) =>
  value.map((item) => (typeof item === 'string' ? item : item.value)).join(', ');

export function resolveErpCell(row: IRow, column: DemoErpColumn, meta: IMetaDataResponse): DemoErpCell {
  const field = row.fields?.find((value) => value.fieldName === column.fieldName);
  const value = field?.value;
  const empty =
    value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  const subValue = field?.subValue || undefined;
  if (column.metadata.isHideValue) return { text: 'Скрыто', empty: false, field };
  if (empty) return { text: '—', empty: true, subValue, field };
  let text = Array.isArray(value) ? arrayText(value) : String(value);
  if (typeof value === 'string') {
    const number = numeric(value);
    if ((column.type === 'money' || column.type === 'number') && number !== undefined)
      text = new Intl.NumberFormat(
        'ru-RU',
        column.type === 'money'
          ? { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 }
          : { maximumFractionDigits: 12 },
      ).format(number);
    else if (column.type === 'date' || column.type === 'datetime')
      text = formatDate(value, column.type === 'datetime');
    else if (column.type === 'boolean' && (value === 'true' || value === 'false'))
      text = value === 'true' ? 'Да' : 'Нет';
  }
  const badge = field?.badgeId
    ? meta.data?.badges?.find((item) => item.badgeId === field.badgeId)
    : undefined;
  return { text, subValue, badge, empty: false, field };
}

export function buildErpDemoModel(
  meta: IMetaDataResponse,
  data: IRowData,
  state: DemoErpState = {},
): DemoErpModel {
  const columns = projectErpColumns(meta, state.includeDefaultHidden);
  const source = data.data.rows ?? [];
  const query = state.query?.trim().toLocaleLowerCase('ru-RU') ?? '';
  const projected: DemoErpRow[] = source.map((row, index) => ({
    key: `row-${index}`,
    sourceIndex: index,
    source: row,
    cells: Object.fromEntries(columns.map((column) => [column.fieldName, resolveErpCell(row, column, meta)])),
  }));
  const filtered = projected.filter(
    (row) =>
      !query ||
      Object.values(row.cells).some((cell) =>
        `${cell.text} ${cell.subValue ?? ''}`.toLocaleLowerCase('ru-RU').includes(query),
      ),
  );
  const sorting = state.sort;
  const sortColumn =
    sorting &&
    columns.find(
      (column) => column.fieldName === sorting.fieldName && column.metadata.isFilterSort !== false,
    );
  if (sorting && sortColumn)
    filtered.sort((a, b) => {
      const left = a.cells[sortColumn.fieldName],
        right = b.cells[sortColumn.fieldName];
      if (left.empty !== right.empty) return left.empty ? 1 : -1;
      const raw = (cell: DemoErpCell): number | string => {
        const value = cell.field?.value;
        if (typeof value === 'string' && !sortColumn.metadata.isHideValue) {
          if (sortColumn.type === 'money' || sortColumn.type === 'number') return numeric(value) ?? cell.text;
          if (sortColumn.type === 'date' || sortColumn.type === 'datetime')
            return parsedDate(value)?.getTime() ?? cell.text;
        }
        return cell.text;
      };
      const av = raw(left),
        bv = raw(right);
      const comparison =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'ru-RU', { numeric: true });
      return comparison
        ? comparison * (sorting.direction === 'desc' ? -1 : 1)
        : a.sourceIndex - b.sourceIndex;
    });
  const pageSize =
    state.paginate === false
      ? Math.max(1, filtered.length)
      : Number.isFinite(state.pageSize) && Number.isInteger(state.pageSize) && state.pageSize! > 0
        ? Math.min(100, state.pageSize!)
        : 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageIndex =
    state.paginate === false
      ? 0
      : Math.max(
          0,
          Math.min(pageCount - 1, Number.isFinite(state.pageIndex) ? Math.floor(state.pageIndex!) : 0),
        );
  return {
    columns,
    rows: filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    totalRows: source.length,
    filteredRows: filtered.length,
    pageIndex,
    pageSize,
    pageCount,
    from: filtered.length ? pageIndex * pageSize + 1 : 0,
    to: Math.min((pageIndex + 1) * pageSize, filtered.length),
    additionalInfo: [...(data.data.additionalInfo ?? [])],
  };
}
