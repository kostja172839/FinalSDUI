import type { Catalog, ErpTableNode, ErpTableOptions, WidgetDescriptor } from '../../shared/model';
import { Button, Input, Select, Toggle } from '../ui';
import { ValueSourceEditor } from './ValueSourceEditor';
import { WidgetInvocationEditor } from './WidgetInvocationEditor';
import { connectExpensesDemo } from '../demo/erp-table-examples';

const descriptor: WidgetDescriptor = {
  id: 'erp-table',
  name: 'ErpTableWidget',
  mode: 'embedded',
  version: 'host',
  description: 'Компонент таблицы приложения',
  inputs: [
    {
      name: 'defaultQueryFiltres',
      label: 'Постоянные фильтры',
      type: 'json',
      defaultValue: [],
      description: 'Список FilterParam из вашего API; структуру задаёт контракт таблицы.',
    },
    { name: 'techFilters', label: 'Технические фильтры', type: 'json', defaultValue: [] },
    { name: 'initialFilters', label: 'Начальные фильтры', type: 'json', defaultValue: [] },
    {
      name: 'defaultSelectRows',
      label: 'Выделенные строки',
      type: 'json',
      defaultValue: [],
      description: 'Список строковых или числовых ID. Адаптер преобразует список в Set.',
    },
    { name: 'mfAdditionalProps', label: 'Параметры микрофронтов таблицы', type: 'json', defaultValue: {} },
    {
      name: 'customParams',
      label: 'Параметры запросов таблицы',
      type: 'json',
      defaultValue: {},
      description: 'Например, mode, taskCode или accountingTemplateCode, если они предусмотрены вашим API.',
    },
    { name: 'customOffset', label: 'Дополнительный отступ', type: 'number', defaultValue: 0 },
    {
      name: 'tableFullscreenZIndex',
      label: 'Порядок полноэкранной таблицы',
      type: 'number',
      defaultValue: 300,
    },
    { name: 'isTabs', label: 'Учитывать вкладки над таблицей', type: 'boolean', defaultValue: false },
    { name: 'isRegistryPageUsage', label: 'Оболочка страницы реестра', type: 'boolean', defaultValue: false },
    { name: 'defaultRowSize', label: 'Размер строк', type: 'text', defaultValue: 'small' },
    {
      name: 'showInControlRowSize',
      label: 'Переключатель размера строк',
      type: 'boolean',
      defaultValue: true,
    },
    { name: 'paginationSize', label: 'Пагинация', type: 'json', defaultValue: { size: 's', slots: 7 } },
    { name: 'stend', label: 'Стенд', type: 'text', defaultValue: 'alpha' },
    { name: 'enableFilters', label: 'Панель фильтров', type: 'boolean', defaultValue: true },
    { name: 'enableColumns', label: 'Управление колонками', type: 'boolean', defaultValue: true },
    {
      name: 'isUrlFiltersEnabled',
      label: 'Фильтры из адресной строки',
      type: 'boolean',
      defaultValue: false,
    },
  ],
  events: [
    { name: 'setActiveSplit', label: 'Состояние правой панели' },
    { name: 'setRightContent', label: 'Открытие правого содержимого' },
    { name: 'onSelectChange', label: 'Выделенные ID изменились' },
    { name: 'onEditSuccess', label: 'Изменения сохранены' },
    { name: 'onEditLoading', label: 'Состояние сохранения' },
    { name: 'onEditError', label: 'Ошибка сохранения' },
    { name: 'onFetchData', label: 'Данные таблицы загружены' },
    { name: 'onSelectRowsChange', label: 'Выделенные строки изменились' },
    { name: 'onChangeNoteInfo', label: 'Дополнительная информация изменилась' },
  ],
};

export function ErpTableEditor({
  node,
  catalog,
  onChange,
}: {
  node: ErpTableNode;
  catalog: Catalog;
  onChange: (node: ErpTableNode) => void;
}) {
  const options = node.options ?? {};
  const change = (update: Partial<ErpTableOptions>) =>
    onChange({ ...node, options: { ...options, ...update } });
  return (
    <div className="builder-setting-stack">
      <ValueSourceEditor
        label="Адрес таблицы"
        path="tableUrl"
        source={node.tableUrl}
        fields={catalog.fields}
        hint="Адрес, который ожидает ErpTableWidget, например /api/table/registry. Метаданные и строки загружает сам компонент."
        onChange={(tableUrl) => onChange({ ...node, tableUrl })}
      />
      {node.tableUrl.kind === 'literal' && !node.tableUrl.value && (
        <Button
          size="sm"
          onClick={() =>
            onChange({ ...node, tableUrl: { kind: 'literal', value: '/api/demo/erp-table/product-events' } })
          }
        >
          Пример: продуктовые события
        </Button>
      )}
      <Button size="sm" onClick={() => onChange(connectExpensesDemo(node))}>
        Пример: расходы по отчёту
      </Button>
      <p className="builder-property-copy">
        Демо API и данные подготовлены для ErpTableWidget. Кнопки примеров заполняют адрес и параметры.
        Таблица появится после подключения вашего компонента в приложении.
      </p>
      <Input
        label="Высота блока, px"
        path="height"
        type="number"
        min={200}
        max={1600}
        value={node.height}
        onChange={(event) => onChange({ ...node, height: Number(event.target.value) })}
      />
      <p className="builder-property-copy">
        Колонки, действия, фильтры и данные реестра определяются его метаданными. Здесь настраивается
        размещение готового компонента.
      </p>
      <Select
        label="Размер строк"
        path="options.defaultRowSize"
        value={options.defaultRowSize ?? 'small'}
        options={[
          { value: 'small', label: 'Маленькие' },
          { value: 'medium', label: 'Средние' },
          { value: 'big', label: 'Большие' },
        ]}
        onChange={(event) =>
          change({ defaultRowSize: event.target.value as ErpTableOptions['defaultRowSize'] })
        }
      />
      <Toggle
        label="Показывать фильтры"
        checked={options.enableFilters ?? true}
        onChange={(enableFilters) => change({ enableFilters })}
      />
      <Toggle
        label="Настраивать колонки"
        checked={options.enableColumns ?? true}
        onChange={(enableColumns) => change({ enableColumns })}
      />
      <Toggle
        label="Переключать размер строк"
        checked={options.showInControlRowSize ?? true}
        onChange={(showInControlRowSize) => change({ showInControlRowSize })}
      />
      <Toggle
        label="Фильтры из адресной строки"
        checked={options.isUrlFiltersEnabled ?? false}
        onChange={(isUrlFiltersEnabled) => change({ isUrlFiltersEnabled })}
      />
      <Toggle
        label="Учитывать вкладки над таблицей"
        checked={options.isTabs ?? false}
        onChange={(isTabs) => change({ isTabs })}
      />
      <Toggle
        label="Оболочка страницы реестра"
        checked={options.isRegistryPageUsage ?? false}
        onChange={(isRegistryPageUsage) => change({ isRegistryPageUsage })}
      />
      <Input
        label="Дополнительный отступ, px"
        path="options.customOffset"
        type="number"
        min={0}
        value={options.customOffset ?? 0}
        hint="Передаётся как customOffset; уменьшает высоту внутри компонента таблицы."
        onChange={(event) => change({ customOffset: Number(event.target.value) })}
      />
      <Select
        label="Размер пагинации"
        path="options.paginationSize.size"
        value={options.paginationSize?.size ?? 's'}
        options={[
          { value: 's', label: 'Обычная' },
          { value: 'xs', label: 'Компактная' },
        ]}
        onChange={(event) =>
          change({ paginationSize: { ...options.paginationSize, size: event.target.value as 's' | 'xs' } })
        }
      />
      <Select
        label="Количество слотов пагинации"
        path="options.paginationSize.slots"
        value={String(options.paginationSize?.slots ?? 7)}
        options={Array.from({ length: 9 }, (_, index) => ({
          value: String(index + 7),
          label: String(index + 7),
        }))}
        onChange={(event) =>
          change({
            paginationSize: {
              ...options.paginationSize,
              slots: Number(event.target.value) as NonNullable<ErpTableOptions['paginationSize']>['slots'],
            },
          })
        }
      />
      <details>
        <summary>Параметры и события таблицы</summary>
        <p className="builder-property-copy">
          Для фильтров и составных параметров можно выбрать любой путь в данных API или задать JSON по
          контракту вашего реестра. Параметры ниже переопределяют одноимённые опции выше.
        </p>
        <WidgetInvocationEditor
          value={{ props: node.props, events: node.events }}
          widget={descriptor}
          fields={catalog.fields}
          onChange={(invocation) => onChange({ ...node, ...invocation })}
        />
      </details>
      <p className="builder-property-copy">
        Функции, компоненты микрофронтов, карта импортов и CSS подключаются разработчиком в приложении. Их не
        нужно вводить в шаблон.
      </p>
    </div>
  );
}
