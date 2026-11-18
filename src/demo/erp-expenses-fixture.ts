import type { IField, IMetaDataItem, IMetaDataResponse, IRowData } from './erp-table-types';

export const ERP_EXPENSES_DEMO_URL = '/api/demo/erp-table/expenses';
/** Synthetic values only. Keys and nullable envelopes follow the supplied network example. */
// Column order is part of the 3.7 wire contract. Technical IDs remain in the schema even when hidden.
const expenseColumns: IMetaDataItem[] = [
  { fieldName: 'statusName', fieldTitle: 'Статус расхода', filterType: 'multiselect', isHideByDefault: true },
  { fieldName: 'documentNumber', fieldTitle: 'Номер документа', isWrapEnabled: true },
  {
    fieldName: 'documentDate',
    fieldTitle: 'Дата документа',
    type: 'date',
    filterType: 'date',
    isHideByDefault: true,
  },
  { fieldName: 'documentName', fieldTitle: 'Документ', isHideByDefault: true },
  { fieldName: 'costTypeName', fieldTitle: 'Вид расхода', filterType: 'multiselect', isWrapEnabled: true },
  { fieldName: 'amount', fieldTitle: 'Сумма расхода', type: 'money' },
  { fieldName: 'currencyLetterCode', fieldTitle: 'Валюта', filterType: 'multiselect' },
  { fieldName: 'currencyRateValue', fieldTitle: 'Курс валюты', type: 'money', isHideByDefault: true },
  {
    fieldName: 'currencyRateUseDate',
    fieldTitle: 'Дата курса',
    type: 'date',
    filterType: 'date',
    isHideByDefault: true,
  },
  {
    fieldName: 'hasCurrencyRateSourceDocument',
    fieldTitle: 'Подтверждение курса',
    type: 'boolean',
    isHideByDefault: true,
  },
  {
    fieldName: 'taxAccountingIndicatorName',
    fieldTitle: 'Признак учёта',
    filterType: 'multiselect',
    isHideByDefault: true,
  },
  { fieldName: 'vatAmountRub', fieldTitle: 'НДС, ₽', type: 'money' },
  { fieldName: 'hasNoVat', fieldTitle: 'Без НДС', type: 'boolean', isHideByDefault: true },
  { fieldName: 'incomeTaxBaseAmountRub', fieldTitle: 'База налога, ₽', type: 'money' },
  {
    fieldName: 'incomeTaxWithholdReasonName',
    fieldTitle: 'Основание удержания',
    filterType: 'multiselect',
    isHideByDefault: true,
    isWrapEnabled: true,
  },
  {
    fieldName: 'paymentTypeName',
    fieldTitle: 'Способ оплаты',
    filterType: 'multiselect',
    isHideByDefault: true,
  },
  {
    fieldName: 'businessTripDestinationFullName',
    fieldTitle: 'Место командировки',
    isHideByDefault: true,
    isWrapEnabled: true,
  },
  { fieldName: 'expenseDaysCount', fieldTitle: 'Количество дней', type: 'number', isHideByDefault: true },
  { fieldName: 'reportId', fieldTitle: 'Идентификатор отчёта', isHideAlways: true },
  { fieldName: 'id', fieldTitle: 'Идентификатор расхода', isHideAlways: true, isMain: true },
];
const columns: IMetaDataItem[] = expenseColumns.map((column, position) => {
  const technical = column.isHideAlways === true;
  return {
    type: 'string',
    minimalWidth: 100,
    isEditable: false,
    isFilterSort: !technical,
    isMain: false,
    isHideAvailable: technical,
    isPinnedByDefault: false,
    isHideByDefault: technical,
    isHideAlways: false,
    isEnableSwitchVisibility: technical,
    isTechnicalField: technical,
    isWrapEnabled: false,
    filterType: technical ? null : 'string',
    sortType: null,
    clickActionId: null,
    ...column,
    position,
  };
});
export const erpExpensesMockMeta: IMetaDataResponse = {
  data: {
    tableApiVersion: '3.7',
    isRowURLEnabled: false,
    isShowSideCalendar: false,
    sideCalendarRowId: null,
    isGlobalEditable: false,
    isGlobalSearchEnabled: true,
    isGlobalFilteringEnabled: true,
    isGlobalSortingEnabled: true,
    isGlobalMultiselectionEnabled: true,
    isGlobalPinEnabled: true,
    isGlobalColumnsSizeChangingEnabled: true,
    isGlobalRowSizeChangingEnabled: true,
    isGlobalHideEnabled: true,
    isGlobalColumnPositionChangingEnabled: true,
    aggregateRowPosition: null,
    emptyTableDescription: 'Расходы по этому демонстрационному отчёту не найдены',
    metadata: columns,
    actions: [],
    badges: [
      { badgeId: 'positive', view: 'positive', isTransparent: true },
      { badgeId: 'warning', view: 'warning', isTransparent: true },
      { badgeId: 'negative', view: 'negative', isTransparent: true },
    ],
  },
  messages: [],
};
const field = (fieldName: string, value: IField['value'], badgeId: string | null = null): IField => ({
  fieldName,
  value,
  label: null,
  badgeId,
  iconId: null,
});
const names = ['Проживание', 'Проезд на поезде', 'Такси', 'Суточные'];
const states = [
  { name: 'Проверен', badgeId: 'positive' },
  { name: 'На проверке', badgeId: 'warning' },
  { name: 'Отклонён', badgeId: 'negative' },
];
export const erpExpensesMockData: IRowData = {
  data: {
    rows: Array.from({ length: 16 }, (_, index) => {
      const local = index % 8;
      const reportId = index < 8 ? 'demo-report-001' : 'demo-report-002';
      const currency = local % 3 === 0 ? 'EUR' : 'RUB';
      const state = states[local % states.length];
      return {
        fields: [
          field('reportId', reportId),
          field('id', `demo-expense-${String(index + 1).padStart(3, '0')}`),
          field('documentName', `Демо: ${names[local % names.length]}`),
          field('documentDate', `2026-11-${String(local + 1).padStart(2, '0')}`),
          field('documentNumber', `ДЕМО-${String(index + 1).padStart(3, '0')}`),
          field('amount', (currency === 'EUR' ? 80 + local * 12.5 : 1200 + local * 850).toFixed(2)),
          field('costTypeName', names[local % names.length]),
          field('currencyLetterCode', currency),
          field('incomeTaxBaseAmountRub', String(300 + local * 50)),
          field('currencyRateValue', currency === 'EUR' ? '100' : '1'),
          field('vatAmountRub', local % 2 === 0 ? '0' : '200'),
          field('currencyRateUseDate', '2026-11-01'),
          field('expenseDaysCount', String(local + 1)),
          field('hasNoVat', local % 2 === 0 ? 'true' : 'false'),
          field('hasCurrencyRateSourceDocument', currency === 'EUR' ? 'true' : 'false'),
          field('incomeTaxWithholdReasonName', null),
          field('taxAccountingIndicatorName', null),
          field('businessTripDestinationFullName', local % 2 === 0 ? null : 'Демонстрационный филиал'),
          field('paymentTypeName', local % 2 === 0 ? 'Банковская карта' : 'Наличные'),
          field('statusName', state.name, state.badgeId),
        ],
        actions: [],
      };
    }),
    additionalInfo: null,
    page: { offset: 0, limit: null, count: 16, totalElements: 16 },
  },
  messages: [],
};
