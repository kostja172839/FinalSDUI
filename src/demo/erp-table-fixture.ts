import type { IField, IMetaDataResponse, IRowData } from './erp-table-types';

export const ERP_TABLE_DEMO_URL = '/demo/erp-table';

/** Fictional product events in the envelopes supplied by the user. No ERP row ID is invented. */
export const erpTableMockMeta: IMetaDataResponse = {
  data: {
    isGlobalSearchEnabled: true,
    isGlobalSortingEnabled: true,
    isGlobalFilteringEnabled: true,
    isGlobalPaginationEnabled: true,
    isGlobalRowSizeChangingEnabled: true,
    isGlobalColumnsSizeChangingEnabled: true,
    isGlobalHideEnabled: true,
    isGlobalColumnPositionChangingEnabled: true,
    isGlobalFullscreenEnabled: true,
    emptyTableDescription: 'Продуктовых событий пока нет',
    metadata: [
      {
        fieldName: 'status',
        fieldTitle: 'Статус',
        position: 40,
        type: 'string',
        minimalWidth: 160,
        columnSize: 'M',
        isFilterSort: true,
      },
      {
        fieldName: 'eventNumber',
        fieldTitle: 'Номер события',
        position: 10,
        type: 'string',
        minimalWidth: 170,
        isMain: true,
        isFilterSort: true,
      },
      {
        fieldName: 'occurredAt',
        fieldTitle: 'Дата события',
        position: 30,
        type: 'date',
        dataType: 'date',
        minimalWidth: 145,
        isFilterSort: true,
      },
      {
        fieldName: 'kind',
        fieldTitle: 'Вид события',
        position: 20,
        type: 'string',
        minimalWidth: 210,
        isWrapEnabled: true,
        isFilterSort: true,
      },
      {
        fieldName: 'amount',
        fieldTitle: 'Сумма, ₽',
        position: 50,
        type: 'money',
        dataType: 'money',
        minimalWidth: 155,
        isFilterSort: true,
      },
      {
        fieldName: 'participants',
        fieldTitle: 'Ответственные',
        position: 60,
        type: 'arrayObject',
        minimalWidth: 210,
        isWrapEnabled: true,
      },
      {
        fieldName: 'tags',
        fieldTitle: 'Признаки',
        position: 70,
        type: 'array',
        minimalWidth: 180,
        isHideByDefault: true,
        isHideAvailable: true,
        isWrapEnabled: true,
      },
      {
        fieldName: 'comment',
        fieldTitle: 'Комментарий',
        position: 80,
        type: 'string',
        minimalWidth: 230,
        isHideByDefault: true,
        isHideAvailable: true,
        isWrapEnabled: true,
      },
      {
        fieldName: 'confirmed',
        fieldTitle: 'Подтверждено',
        position: 85,
        type: 'boolean',
        minimalWidth: 145,
        isHideByDefault: true,
        isHideAvailable: true,
      },
      {
        fieldName: 'processedAt',
        fieldTitle: 'Время обработки',
        position: 90,
        type: 'datetime',
        minimalWidth: 190,
        isHideByDefault: true,
        isHideAvailable: true,
      },
      {
        fieldName: 'sourceSystem',
        fieldTitle: 'Система-источник',
        position: 100,
        type: 'string',
        isHideAlways: true,
        isTechnicalField: true,
      },
    ],
    badges: [
      { badgeId: 'event-posted', view: 'positive', isTransparent: true, size: 'xs' },
      { badgeId: 'event-review', view: 'warning', isTransparent: true, size: 'xs' },
      { badgeId: 'event-cancelled', view: 'negative', isTransparent: true, size: 'xs' },
    ],
  },
  messages: [],
};

const kinds = [
  'Принятие к учёту',
  'Перемещение',
  'Изменение стоимости',
  'Начисление амортизации',
  'Инвентаризация',
  'Списание',
];
const statuses = [
  { value: 'Проведено в ГБК', badgeId: 'event-posted' },
  { value: 'На проверке', badgeId: 'event-review' },
  { value: 'Отменено', badgeId: 'event-cancelled' },
];
const fields = (index: number): IField[] => {
  const day = String(16 - index).padStart(2, '0');
  const status = statuses[index % statuses.length];
  return [
    { fieldName: 'eventNumber', value: `ПС-2026-${String(index + 1).padStart(4, '0')}` },
    {
      fieldName: 'kind',
      value: kinds[index % kinds.length],
      subValue: index % 3 === 0 ? 'Основание: акт приёма-передачи' : null,
    },
    { fieldName: 'occurredAt', value: `2026-11-${day}` },
    { fieldName: 'status', ...status },
    {
      fieldName: 'amount',
      value: index === 0 ? '1200000.50' : index % 5 === 0 ? null : String(15000 + index * 2375.25),
    },
    {
      fieldName: 'participants',
      value:
        index % 4 === 0
          ? [
              { value: 'Анна Сергеева', techValue: 'demo-employee-a' },
              { value: 'Михаил Лебедев', techValue: 'demo-employee-b' },
            ]
          : [{ value: 'Елена Смирнова', techValue: 'demo-employee-c' }],
    },
    { fieldName: 'tags', value: index % 2 === 0 ? ['Плановое', 'Бухгалтерский учёт'] : ['Внеплановое'] },
    { fieldName: 'comment', value: index % 3 === 0 ? null : 'Синтетическая запись для проверки карточки.' },
    { fieldName: 'confirmed', value: index % 2 === 0 ? 'true' : 'false' },
    { fieldName: 'processedAt', value: `2026-11-${day}T10:15:00Z` },
    { fieldName: 'sourceSystem', value: 'Демонстрационный источник' },
  ];
};

export const erpTableMockData: IRowData = {
  data: {
    rows: Array.from({ length: 16 }, (_, index) => ({ fields: fields(index) })),
    page: { offset: 0, limit: 16, count: 16, totalElements: 16 },
    additionalInfo: [{ text: 'Демонстрационный реестр: события и данные вымышлены.', view: 'info' }],
  },
  messages: [],
};
