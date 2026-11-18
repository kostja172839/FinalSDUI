import type { IField, IMetaDataItem, IMetaDataResponse, IRowData } from './erp-table-types';

export const ERP_EXPENSES_DEMO_URL = '/api/demo/erp-table/expenses';
/** Synthetic values only. Keys and nullable envelopes follow the supplied network example. */
const columns: IMetaDataItem[] = [
  {
    fieldName: 'documentNumber',
    fieldTitle: 'Номер документа',
    position: 1,
    type: 'string',
    minimalWidth: 155,
    isFilterSort: true,
  },
  {
    fieldName: 'documentDate',
    fieldTitle: 'Дата документа',
    position: 2,
    type: 'date',
    minimalWidth: 145,
    isFilterSort: true,
  },
  {
    fieldName: 'documentName',
    fieldTitle: 'Документ',
    position: 3,
    type: 'string',
    minimalWidth: 205,
    isWrapEnabled: true,
    isFilterSort: true,
  },
  {
    fieldName: 'costTypeName',
    fieldTitle: 'Вид расхода',
    position: 4,
    type: 'string',
    minimalWidth: 180,
    isWrapEnabled: true,
    isFilterSort: true,
  },
  {
    fieldName: 'amount',
    fieldTitle: 'Сумма расхода',
    position: 5,
    type: 'money',
    minimalWidth: 155,
    isFilterSort: true,
  },
  {
    fieldName: 'currencyLetterCode',
    fieldTitle: 'Валюта',
    position: 6,
    type: 'string',
    minimalWidth: 110,
    isFilterSort: true,
  },
  {
    fieldName: 'statusName',
    fieldTitle: 'Статус расхода',
    position: 7,
    type: 'string',
    minimalWidth: 145,
    isFilterSort: true,
  },
  {
    fieldName: 'incomeTaxBaseAmountRub',
    fieldTitle: 'База налога, ₽',
    position: 8,
    type: 'money',
    isHideByDefault: true,
  },
  {
    fieldName: 'currencyRateValue',
    fieldTitle: 'Курс валюты',
    position: 9,
    type: 'number',
    isHideByDefault: true,
  },
  { fieldName: 'vatAmountRub', fieldTitle: 'НДС, ₽', position: 10, type: 'money', isHideByDefault: true },
  {
    fieldName: 'currencyRateUseDate',
    fieldTitle: 'Дата курса',
    position: 11,
    type: 'date',
    isHideByDefault: true,
  },
  {
    fieldName: 'expenseDaysCount',
    fieldTitle: 'Количество дней',
    position: 12,
    type: 'number',
    isHideByDefault: true,
  },
  { fieldName: 'hasNoVat', fieldTitle: 'Без НДС', position: 13, type: 'boolean', isHideByDefault: true },
  {
    fieldName: 'hasCurrencyRateSourceDocument',
    fieldTitle: 'Подтверждение курса',
    position: 14,
    type: 'boolean',
    isHideByDefault: true,
  },
  {
    fieldName: 'incomeTaxWithholdReasonName',
    fieldTitle: 'Основание удержания',
    position: 15,
    type: 'string',
    isHideByDefault: true,
  },
  {
    fieldName: 'taxAccountingIndicatorName',
    fieldTitle: 'Признак учёта',
    position: 16,
    type: 'string',
    isHideByDefault: true,
  },
  {
    fieldName: 'businessTripDestinationFullName',
    fieldTitle: 'Место командировки',
    position: 17,
    type: 'string',
    isHideByDefault: true,
  },
  {
    fieldName: 'paymentTypeName',
    fieldTitle: 'Способ оплаты',
    position: 18,
    type: 'string',
    isHideByDefault: true,
  },
  {
    fieldName: 'reportId',
    fieldTitle: 'Идентификатор отчёта',
    position: 19,
    type: 'string',
    isHideAlways: true,
    isTechnicalField: true,
    isFilterSort: false,
  },
  {
    fieldName: 'id',
    fieldTitle: 'Идентификатор расхода',
    position: 20,
    type: 'string',
    isMain: true,
    isHideAlways: true,
    isTechnicalField: true,
    isFilterSort: false,
  },
];
export const erpExpensesMockMeta: IMetaDataResponse = {
  data: {
    isGlobalSearchEnabled: true,
    isGlobalFilteringEnabled: true,
    isGlobalSortingEnabled: true,
    isGlobalPaginationEnabled: true,
    isGlobalColumnsSizeChangingEnabled: true,
    isGlobalRowSizeChangingEnabled: true,
    isGlobalHideEnabled: true,
    isGlobalColumnPositionChangingEnabled: true,
    isGlobalFullscreenEnabled: true,
    emptyTableDescription: 'Расходы по этому демонстрационному отчёту не найдены',
    metadata: columns,
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
