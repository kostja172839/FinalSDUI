import type { ContentNode, EntitySummary, SplitTemplate, TemplateRecord } from './model';

export interface SeedEntity extends EntitySummary {
  version: string;
  data: Record<string, unknown>;
}
const field = (
  id: string,
  label: string,
  binding: string,
  format: 'text' | 'date' | 'money' | 'number' | 'status' | 'person' | 'link' = 'text',
) => ({ id, label, binding: `entity.${binding}`, format });
const details: ContentNode[] = [
  {
    id: 'main-facts',
    type: 'fields',
    title: 'Общие сведения',
    columns: 2,
    fields: [
      field('accounting', 'Субъект учёта', 'accountingEntity'),
      field('kind', 'Вид актива', 'entityKind'),
    ],
  },
  {
    id: 'contract',
    type: 'section',
    title: 'Договор',
    collapsible: true,
    defaultOpen: true,
    children: [
      {
        id: 'contract-fields',
        type: 'fields',
        title: 'Реквизиты договора',
        columns: 2,
        fields: [
          field('contract-no', 'Номер договора', 'contractNumber'),
          field('contract-date', 'Дата договора', 'contractDate', 'date'),
          field('ownership-date', 'Дата перехода права', 'ownershipDate', 'date'),
          field('contract-link', 'Карточка договора', 'contractUrl', 'link'),
        ],
      },
    ],
  },
  {
    id: 'identification',
    type: 'fields',
    title: 'Идентификационные признаки',
    columns: 2,
    fields: [
      field('inventory', 'Инвентарный номер', 'inventoryNumber'),
      field('serial', 'Серийный номер', 'serialNumber'),
      field('tax-code', 'Код объекта для НУ', 'taxCode'),
    ],
  },
  {
    id: 'location',
    type: 'fields',
    title: 'Местоположение',
    columns: 2,
    fields: [
      field('region', 'Регион', 'region'),
      field('country', 'Страна происхождения', 'country'),
      field('address', 'Адрес', 'address'),
    ],
  },
  {
    id: 'description',
    type: 'text',
    title: 'Описание объекта',
    binding: 'entity.description',
    collapsible: true,
  },
];
const costNodes: ContentNode[] = [
  {
    id: 'ownership',
    type: 'fields',
    title: 'Использование и хранение',
    columns: 2,
    fields: [
      field('cost-accounting', 'Субъект учёта', 'accountingEntity'),
      field('storage', 'Место хранения', 'storageLocation'),
      field('custodian', 'Ответственный за сохранность', 'custodian', 'person'),
      field('purpose', 'Цель использования', 'purpose'),
      field('quantity', 'Количество, шт.', 'quantity', 'number'),
    ],
  },
  {
    id: 'bookkeeping',
    type: 'section',
    title: 'Бухгалтерский учёт',
    collapsible: true,
    defaultOpen: true,
    children: [
      {
        id: 'book-values',
        type: 'fields',
        title: 'Стоимость',
        columns: 2,
        fields: [
          field('book-value', 'Балансовая стоимость, ₽', 'bookValue', 'money'),
          field('reserve', 'Резерв под обесценение, ₽', 'impairmentReserve', 'money'),
        ],
      },
    ],
  },
  {
    id: 'tax-accounting',
    type: 'section',
    title: 'Налоговый учёт',
    collapsible: true,
    defaultOpen: true,
    children: [
      {
        id: 'tax-values',
        type: 'fields',
        title: 'Стоимость для НУ',
        columns: 2,
        fields: [field('tax-value', 'Стоимость, ₽', 'taxValue', 'money')],
      },
    ],
  },
];
const eventNodes: ContentNode[] = [
  {
    id: 'events-table',
    type: 'table',
    title: 'Продуктовые события',
    binding: 'collections.events',
    searchable: true,
    pageSize: 5,
    columns: [
      { id: 'event-id', label: 'ID события', binding: 'id', format: 'text' },
      { id: 'event-kind', label: 'Вид события', binding: 'kind', format: 'text' },
      { id: 'event-date', label: 'Дата события', binding: 'occurredAt', format: 'date' },
      { id: 'event-status', label: 'Статус', binding: 'status', format: 'status' },
      { id: 'effective-date', label: 'Дата факта', binding: 'effectiveAt', format: 'date' },
    ],
  },
];
const base: SplitTemplate = {
  schemaVersion: 1,
  id: 'fixed-asset',
  name: 'Основное средство',
  entityType: 'asset',
  header: {
    titleBinding: 'entity.title',
    subtitleBinding: 'entity.subtitle',
    statusBinding: 'entity.status',
    showStatus: true,
    actions: [
      {
        id: 'header-open-card',
        label: 'Открыть карточку объекта',
        kind: 'openWidget',
        widgetId: 'asset-editor',
      },
      {
        id: 'header-documents',
        label: 'Связанные документы',
        kind: 'openWidget',
        widgetId: 'asset-documents',
      },
    ],
  },
  shell: { defaultWidth: 840, minWidth: 600, maxWidthPercent: 70 },
  tabs: [
    { id: 'main', title: 'Основное', nodes: details },
    { id: 'costs', title: 'Стоимость, количество', nodes: costNodes },
    { id: 'events', title: 'Продуктовые события', nodes: eventNodes },
  ],
  footer: {
    show: true,
    text: 'Демонстрационные данные · Только просмотр',
    widgetId: 'asset-editor',
    actionLabel: 'Открыть виджет',
    actions: [
      {
        id: 'footer-open-card',
        label: 'Открыть карточку объекта',
        kind: 'openWidget',
        widgetId: 'asset-editor',
      },
      {
        id: 'footer-documents',
        label: 'Связанные документы',
        kind: 'openWidget',
        widgetId: 'asset-documents',
      },
    ],
  },
};
const intangible = structuredClone(base);
intangible.id = 'intangible-asset';
intangible.name = 'Нематериальный актив';
intangible.tabs[0].nodes[2] = {
  id: 'identification',
  type: 'fields',
  title: 'Идентификационные признаки',
  columns: 2,
  fields: [
    field('inventory', 'Инвентарный номер', 'inventoryNumber'),
    field('batch', 'Номер партии', 'batchNumber'),
    field('material-kind', 'Вид ТМЦ', 'materialKind'),
    field('country', 'Страна происхождения', 'country'),
  ],
};
intangible.tabs[0].nodes = intangible.tabs[0].nodes.filter((n) => n.id !== 'location');

const createdAt = '2026-11-16T09:00:00.000Z';
export const seedTemplates: TemplateRecord[] = [base, intangible].map((definition) => ({
  id: definition.id,
  draft: structuredClone(definition),
  draftVersion: 1,
  updatedAt: createdAt,
  versions: [{ revision: 1, createdAt, definition: structuredClone(definition) }],
  activeRevision: 1,
}));

export const seedEvents = Array.from({ length: 27 }, (_, i) => ({
  id: `ПС-2026-${String(i + 1).padStart(3, '0')}`,
  kind: ['Перемещение', 'Принятие к учёту', 'Начисление амортизации', 'Переоценка', 'Инвентаризация'][i % 5],
  occurredAt: `2026-${String(11 - Math.floor(i / 3)).padStart(2, '0')}-${String(25 - (i % 20)).padStart(2, '0')}`,
  effectiveAt: `2026-${String(11 - Math.floor(i / 3)).padStart(2, '0')}-${String(26 - (i % 20)).padStart(2, '0')}`,
  status: i % 7 === 0 ? 'Отменено' : i % 5 === 0 ? 'В обработке' : 'Проведено',
  amount: (i + 1) * 12500,
}));
const common = {
  status: 'Открыта',
  accountingEntity: 'АО «Демо Финанс»',
  contractNumber: 'Д-2026/041',
  contractDate: '2026-04-15',
  ownershipDate: '2026-04-20',
  contractUrl: { label: 'Договор Д-2026/041', href: '/contracts/demo-041' },
  serialNumber: 'DEMO-SRV-22041',
  taxCode: '22',
  region: 'Московская область',
  country: 'Российская Федерация',
  address: 'г. Москва, ул. Примерная, д. 15',
  batchNumber: 'П-2026-008',
  materialKind: 'Корпоративные материалы',
  storageLocation: 'Москва · Центральный офис',
  custodian: 'Анна Сергеевна Петрова',
  purpose: 'Для управленческих нужд',
  quantity: 1,
  bookValue: 1200000,
  impairmentReserve: 10000,
  taxValue: 1200000,
  description:
    'Объект используется для обслуживания клиентов. Данные подготовлены специально для демонстрации конструктора и не относятся к реальным активам.',
};
function entity(
  id: string,
  title: string,
  inventoryNumber: string,
  overrides: Record<string, unknown>,
): SeedEntity {
  const asset: Record<string, unknown> = { ...common, title, inventoryNumber, ...overrides };
  return {
    id,
    title,
    type: String(asset.entityKind),
    status: String(asset.status),
    inventoryNumber,
    version: '1',
    data: { entity: asset, collections: { events: structuredClone(seedEvents) } },
  };
}
export const seedEntities: SeedEntity[] = [
  entity('asset-001', 'Банкомат офисный SelfServ 22', 'ОС-000041', {
    entityKind: 'Основное средство',
    subtitle: 'Основное средство · Компьютерная техника и информационные системы',
  }),
  entity('asset-002', 'Исключительные права на персонажа «Лесной друг»', 'НМА-000008', {
    entityKind: 'Нематериальный актив',
    subtitle: 'Нематериальные активы · Исключительные права',
    serialNumber: null,
    bookValue: 20000,
    impairmentReserve: 100,
    taxValue: 20000,
  }),
  entity('asset-003', 'Сервер вычислительного кластера', 'ОС-000127', {
    entityKind: 'Основное средство',
    subtitle: 'Основное средство · Серверное оборудование',
    status: 'На проверке',
    inventoryNumber: 'ОС-000127',
    storageLocation: 'Казань · Технический центр',
    bookValue: 2480000,
    taxValue: 2480000,
  }),
];

/** Optional authoring example; never inserted into an existing user's store implicitly. */
export const contractExampleData: Record<string, unknown> = {
  entity: {
    title: 'Договор № Д-47 от 16.11.2026',
    subtitle: 'Демонстрация компонентов по макетам · Данные вымышлены',
    status: 'Зарегистрирован',
    organization: 'АО «Пример»',
    initiator: 'Мария Сергеевна Орлова',
    department: 'Управление сопровождения',
    availableAmount: 2700,
    totalNet: 123250083,
    totalGross: 139272593.79,
    subject: 'Предоставление доступа к информационной системе и сопровождение пользователей.',
    notice: 'Доступно для распределения: 2 700,00 ₽. Это пример информационного сообщения.',
  },
  collections: {
    counterparties: [
      {
        id: 'party-1',
        name: 'ООО «Северный проект»',
        fullName: 'Общество с ограниченной ответственностью «Северный проект»',
        taxId: '7700000047',
        branchCode: '770001001',
        bic: '040000047',
        bankAccount: '40702810000000000047',
        href: '/demo/counterparties/party-1',
      },
      {
        id: 'party-2',
        name: 'АО «Горизонт»',
        fullName: 'Акционерное общество «Горизонт»',
        taxId: '7800000048',
        branchCode: '780001001',
        bic: '040000048',
        bankAccount: '40702810000000000048',
        href: '/demo/counterparties/party-2',
      },
    ],
    documents: [
      {
        id: 'doc-47',
        name: 'Договор № Д-47.pdf',
        description: 'Основной документ',
        status: 'Зарегистрирован',
        size: 2097152,
        href: '/demo/documents/doc-47',
      },
      {
        id: 'doc-48',
        name: 'Сертификат резидента.pdf',
        description: 'Дополнительный документ',
        status: 'Согласован',
        size: 548000,
        href: '/demo/documents/doc-48',
      },
    ],
    payments: [
      {
        id: 'payment-1',
        status: 'Открыт',
        service: 'Информационные услуги',
        plannedDate: '2026-12-01',
        actualDate: null,
        plannedAmount: 10000,
        actualAmount: 0,
      },
      {
        id: 'payment-2',
        status: 'Проведено',
        service: 'Сопровождение',
        plannedDate: '2026-12-15',
        actualDate: '2026-12-15',
        plannedAmount: 15000,
        actualAmount: 15000,
      },
    ],
  },
};
const fromRow = (
  id: string,
  label: string,
  binding: string,
  format: 'text' | 'number' | 'money' | 'date' | 'status' = 'text',
) => ({ id, label, binding, format });
export const contractExampleDefinition: SplitTemplate = {
  schemaVersion: 1,
  id: 'contract-components',
  name: 'Договор · новые компоненты',
  entityType: 'contract',
  header: {
    titleBinding: 'entity.title',
    subtitleBinding: 'entity.subtitle',
    statusBinding: 'entity.status',
    showStatus: true,
    fields: [
      fromRow('header-organization', 'Субъект учёта', 'entity.organization'),
      { ...fromRow('header-initiator', 'Инициатор', 'entity.initiator'), format: 'person' },
      fromRow('header-department', 'Подразделение', 'entity.department'),
    ],
    actions: [],
  },
  shell: { defaultWidth: 840, minWidth: 600, maxWidthPercent: 70 },
  tabs: [
    {
      id: 'contract-main',
      title: 'Основное',
      nodes: [
        {
          id: 'contract-message',
          type: 'callout',
          title: 'Распределение сумм',
          binding: 'entity.notice',
          tone: 'info',
        },
        {
          id: 'contract-subject',
          type: 'text',
          title: 'Предмет договора',
          binding: 'entity.subject',
          collapsible: false,
        },
        {
          id: 'contract-totals',
          type: 'metrics',
          title: 'Сумма договора',
          columns: 2,
          items: [
            {
              ...fromRow('net-total', 'Без НДС', 'entity.totalNet', 'money'),
              suffix: 'без НДС',
              validation: { required: true, min: 0 },
            },
            {
              ...fromRow('gross-total', 'С НДС', 'entity.totalGross', 'money'),
              suffix: 'с НДС',
              validation: { required: true, min: 0 },
            },
          ],
        },
      ],
    },
    {
      id: 'contract-parties',
      title: 'Контрагенты',
      nodes: [
        {
          id: 'counterparty-list',
          type: 'recordList',
          title: 'Стороны договора',
          binding: 'collections.counterparties',
          itemTitle: { kind: 'binding', path: 'name' },
          itemSubtitle: { kind: 'binding', path: 'fullName' },
          itemHref: { kind: 'binding', path: 'href' },
          columns: 3,
          fields: [
            fromRow('party-tax', 'ИНН', 'taxId'),
            fromRow('party-branch', 'КПП', 'branchCode'),
            fromRow('party-bic', 'БИК', 'bic'),
            fromRow('party-account', 'Банковский счёт', 'bankAccount'),
          ],
        },
      ],
    },
    {
      id: 'contract-schedules',
      title: 'Графики',
      nodes: [
        {
          id: 'contract-payment-section',
          type: 'section',
          title: 'График платежей',
          collapsible: true,
          defaultOpen: true,
          children: [
            {
              id: 'contract-payment-table',
              type: 'table',
              title: 'Платежи',
              binding: 'collections.payments',
              searchable: true,
              pageSize: 5,
              columns: [
                fromRow('payment-status', 'Статус', 'status', 'status'),
                fromRow('payment-service', 'Услуга', 'service'),
                fromRow('payment-date', 'Плановая дата', 'plannedDate', 'date'),
                fromRow('payment-amount', 'Плановая сумма', 'plannedAmount', 'money'),
                fromRow('payment-fact', 'Фактическая сумма', 'actualAmount', 'money'),
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'contract-documents',
      title: 'Документы',
      nodes: [
        {
          id: 'contract-files',
          type: 'documents',
          title: 'Документы договора',
          binding: 'collections.documents',
          itemTitle: { kind: 'binding', path: 'name' },
          itemDescription: { kind: 'binding', path: 'description' },
          itemStatus: { kind: 'binding', path: 'status' },
          itemSize: { kind: 'binding', path: 'size' },
          itemHref: { kind: 'binding', path: 'href' },
          action: {
            id: 'view-contract-document',
            label: 'Открыть документ',
            kind: 'openWidget',
            widgetId: 'document-viewer',
            props: {
              file: { kind: 'binding', path: '$item' },
              fileName: { kind: 'binding', path: '$item.name' },
            },
            events: { onClose: { type: 'close' } },
          },
        },
      ],
    },
  ],
  footer: { show: true, text: 'Компоненты просмотра · Данные вымышлены', actions: [] },
};
