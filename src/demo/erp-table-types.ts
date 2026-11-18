/**
 * Minimal projection of the user-provided ERP metadata/rows contracts for a local demo.
 * Original field names and value shapes are retained; this is not the private SDK or its full source.
 */
export interface ArrayObjectItem {
  value: string;
  techValue: string;
}
export interface IField {
  fieldName: string;
  value: string | string[] | ArrayObjectItem[] | null;
  subValue?: string | null;
  entityName?: string | null;
  label?: string;
  badgeId?: string;
  iconId?: string;
  indicatorId?: string;
  clickActionId?: string;
  descriptionIconValues?: { value?: string }[];
  clickIconActionId?: string | null;
}
export interface IRow {
  fields?: IField[];
  actions?: string[];
}
export interface IPage {
  offset: number;
  limit: number;
  count: number;
  totalElements: number;
}
export interface IAddInfo {
  text?: string;
  view?: 'info' | 'warning' | 'default' | 'positive' | 'negative';
}
export interface IAggregateRowData {
  aggregateFieldName: string;
  aggregateValue: string;
}
export interface IData {
  rows?: IRow[];
  page: IPage;
  aggregateRowData?: IAggregateRowData[];
  additionalInfo?: IAddInfo[];
}
export interface IRowData {
  data: IData;
  messages: unknown;
}
export interface IMetaDataItem {
  fieldName?: string | null;
  fieldTitle?: string | null;
  position?: number | null;
  dataType?: 'number' | 'string' | 'date' | 'datetime' | 'money' | 'boolean' | null;
  type?: 'number' | 'string' | 'date' | 'datetime' | 'money' | 'boolean' | 'array' | 'arrayObject' | null;
  minimalWidth?: number | null;
  columnSize?: 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL';
  isEditable?: boolean | null;
  isFilterSort?: boolean | null;
  isMain?: boolean | null;
  isHideAvailable?: boolean | null;
  isHideByDefault?: boolean | null;
  isWrapEnabled?: boolean | null;
  isHideAlways?: boolean;
  isTechnicalField?: unknown;
  isHideValue?: boolean | null;
  fieldTooltip?: string | null;
}
export interface IBadges {
  badgeId?: string | null;
  view?: 'main' | 'default' | 'accent' | 'positive' | 'warning' | 'negative' | 'dark' | 'light' | null;
  isTransparent?: boolean | null;
  size?: 'l' | 'm' | 's' | 'xs' | null;
  pilled?: boolean | null;
  clear?: boolean | null;
  customColor?: string | null;
  customBackgroundColor?: string | null;
}
export interface RawMetadata {
  isGlobalFilteringEnabled?: boolean | null;
  isGlobalSortingEnabled?: boolean | null;
  isGlobalRowSizeChangingEnabled?: boolean | null;
  isGlobalColumnsSizeChangingEnabled?: boolean | null;
  isGlobalHideEnabled?: boolean | null;
  isGlobalColumnPositionChangingEnabled?: boolean | null;
  isGlobalSearchEnabled?: boolean | null;
  isGlobalPaginationEnabled?: boolean | null;
  isGlobalFullscreenEnabled?: boolean | null;
  emptyTableDescription?: string | null;
  metadata?: IMetaDataItem[] | null;
  badges?: IBadges[] | null;
}
export interface IMetaDataResponse {
  data?: RawMetadata | null;
  messages?: { type?: string | null; description?: string | null }[] | null;
}
