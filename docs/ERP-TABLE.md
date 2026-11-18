# ErpTableWidget в SDUI

Блок `erpTable` подключает **ваш готовый компонент `ErpTableWidget`** по предоставленному TypeScript-интерфейсу. Он отличается от простого блока `table`: SDUI не запрашивает метаданные и строки, не создаёт колонки по собственной схеме и не подменяет встроенные действия реестра. Сам `ErpTableWidget` получает `tableUrl` и выполняет свои запросы.

В этом отдельном проекте приватный пакет таблицы недоступен. Без подключённого адаптера предпросмотр честно показывает состояние «Таблица подключается в приложении». Запросы к вымышленным ERP endpoint не выполняются. Структуры `FilterParam`, `ISplitMicrofront`, `ErpTableCustomParams` и ответов сервера не угадываются: передаются JSON или исходные callback-аргументы по контракту вашего реестра.

## Описание блока

```json
{
  "id": "related-registry",
  "type": "erpTable",
  "title": "Связанные документы",
  "height": 480,
  "tableUrl": { "kind": "binding", "path": "entity.relatedRegistryUrl" },
  "options": {
    "defaultRowSize": "small",
    "enableFilters": true,
    "enableColumns": true,
    "paginationSize": { "size": "xs", "slots": 9 },
    "isUrlFiltersEnabled": false
  },
  "props": {
    "defaultQueryFiltres": { "kind": "binding", "path": "tableContext.filters" },
    "customParams": { "kind": "binding", "path": "tableContext.queryParams" },
    "mfAdditionalProps.entityId": { "kind": "binding", "path": "$context.entityId" },
    "defaultSelectRows": { "kind": "literal", "value": ["row-1", 2] }
  },
  "events": {
    "onSelectChange": { "type": "host", "name": "registrySelectionChanged" },
    "onEditSuccess": { "type": "refresh" }
  }
}
```

`tableUrl` может быть относительным адресом `/api/...` или абсолютным HTTP(S)-адресом, который поддерживает хост. Произвольные значения берутся из любого безопасного пути данных API. Шаблон содержит данные и декларации событий, а функции создаёт фронтовый адаптер.

`options` содержит простые настройки. `props` позволяет взять значения тех же настроек из API; они переопределяют одноимённые корневые `options`. Для объекта задавайте либо весь параметр (`customParams`), либо его вложенные пути (`customParams.taskCode`). `defaultSelectRows` сериализуется списком и перед передачей в компонент преобразуется в `Set<string | number>`.

## Просмотр с моками

В «Блоки → ERP-таблица» доступен локальный пример. В конструкторе добавьте ERP-таблицу и нажмите «Посмотреть с мок-данными» в её свойствах. Кнопка задаёт демонстрационный `tableUrl: "/demo/erp-table"`; перед интеграцией замените его рабочим адресом.

Демонстрация получает `mockMeta` и `mockData` через тот же `createErpTableAdapter`, который используется для настоящего компонента. Фикстуры лежат в `src/demo/erp-table-fixture.ts` и соответствуют предоставленным `IMetaDataResponse` и `IRowData`: колонки в `mockMeta.data.metadata`, строки в `mockData.data.rows[].fields`, пагинация в `mockData.data.page`. Значения вымышлены. Исходные JSON доступны прямо под таблицей в «Входные данные: mockMeta и mockData».

В отдельном проекте отсутствует приватный пакет, поэтому видимый компонент — **локальный просмотр контракта на FinAI Table**, а не сам `ErpTableWidget`. Он показывает колонки по `fieldName` и `position`, скрытие колонок, типы значений, бейджи и `subValue`; поиск, сортировка и пагинация работают локально. Полный набор возможностей приватной таблицы, включая её действия, фильтры и редактирование, этот просмотр не воспроизводит. Технические ID строк не выводятся из данных предположением, выбор строк и бизнес-действия не имитируются.

Во всём демоприложении этот адаптер использует локальные моки и не обращается по `tableUrl`, даже если задан рабочий адрес. Моки не добавляются в SDUI JSON, серверные данные карточек и опубликованные шаблоны. В реальном приложении замените адаптер, как описано ниже: запросы остаются ответственностью вашего `ErpTableWidget`.

## Подключение настоящего компонента

```tsx
// Импортируйте ErpTableWidget из фактического пакета вашего проекта.
// Путь приватного пакета в отдельном SDUI-проекте не задан.
import { createErpTableAdapter, SplitView } from './split-studio';

const erpTableAdapter = createErpTableAdapter(ErpTableWidget, {
  props: {
    setRightContent,
    setActiveSplit,
    rowCheckboxDisabled,
    microFrontendComponents,
    customImportMap,
    // $css и isEditModeActive — только доверенный код хоста.
  },
  handlers: {
    registrySelectionChanged: (...args) => handleSelection(...args),
  },
});

<SplitView document={resolvedSplit} erpTableAdapter={erpTableAdapter} />;
```

Адаптер рендерит компонент в том же React-дереве, сохраняя тему и контекст хоста. Он поддерживает `memo(forwardRef(...))`, передаёт ref компонента, управляет `activeSplit` и оборачивает `setActiveSplit`/`setRightContent`. Исходные payload правой панели и `Set` выбранных ID передаются обработчикам без изменения формы.

Передать правое содержимое с контекстом SDUI можно также через `onRightContent(value, context)` в параметрах адаптера. Поле `value` намеренно имеет тип `unknown`: интеграция приложения знает фактический `ISplitMicrofront` и решает, как его показать.

Ширина `tableViewPort` измеряется `ResizeObserver`. Скрытая вкладка не монтирует таблицу с нулевой шириной; при появлении компонент получает фактическую ширину контейнера. При смене URL или объекта экземпляр таблицы пересоздаётся. При обычном обновлении данных параметры обновляются, события предыдущих параметров перестают действовать.

## Обновление и ref

В демонстрационном приложении кнопка обновления Split-view увеличивает счётчик и вызывает `refetch()` подключённой таблицы. При встраивании передайте этот счётчик через `SplitView.tableRefreshToken` и увеличивайте его в своём `onRefresh` вместе с обновлением данных карточки. Например:

```tsx
const [tableRefreshToken, setTableRefreshToken] = useState(0);
<SplitView
  document={resolvedSplit}
  erpTableAdapter={erpTableAdapter}
  tableRefreshToken={tableRefreshToken}
  onRefresh={() => {
    setTableRefreshToken((value) => value + 1);
    refreshCardData();
  }}
/>;
```

Отдельно используемый `ErpTableHost` принимает `refreshToken?: number`; изменение счётчика после первого рендера запрашивает обновление через настоящий ref компонента. Сам адаптер не повторяет загрузку данных.

Для отдельного использования можно получить методы через `handleRef`:

```tsx
const tableRef = useRef<ErpTableHandle>(null);
<ErpTableHost node={node} data={data} context={context} adapter={erpTableAdapter} handleRef={tableRef} />;

await tableRef.current?.refetch?.();
// Только если ваш хост включил режим редактирования:
await tableRef.current?.saveAllChanges?.();
```

SDUI первой версии сам не включает редактирование и не вызывает сохранение автоматически. `isEditModeActive` задаётся доверенным хостом.

Для проверки настоящего компонента с подготовленными фикстурами передайте их в доверенные пропсы:

```tsx
import { erpTableMockMeta, erpTableMockData } from './src/demo/erp-table-fixture';

const erpTableAdapter = createErpTableAdapter(ErpTableWidget, {
  props: { mockMeta: erpTableMockMeta, mockData: erpTableMockData },
});
```

Типизация не раскрывает обязательные служебные колонки или соглашения вашего API об ID строк. В моке таких соглашений не придумано. После подключения приватного пакета проверьте, нужны ли ему дополнительные технические поля.

## Разрешённые параметры и события

JSON-настройки: `isTabs`, `isRegistryPageUsage`, `customOffset`, `defaultRowSize`, `showInControlRowSize`, `paginationSize`, `stend`, `enableFilters`, `enableColumns`, `isUrlFiltersEnabled`, `tableFullscreenZIndex`, `defaultSelectRows`, `defaultQueryFiltres`, `techFilters`, `initialFilters`, `mfAdditionalProps`, `customParams`.

События: `setActiveSplit`, `setRightContent`, `onSelectChange`, `onEditSuccess`, `onEditLoading`, `onEditError`, `onFetchData`, `onSelectRowsChange`, `onChangeNoteInfo`. Они сопоставляются с существующими действиями `host`, `refresh` или `close`. Например, `onFetchData` удобно передать обработчику хоста; связывать его с постоянным обновлением карточки обычно не требуется.

Функции, CSS, `mockMeta`, `mockData`, карты компонентов и импортов задаются только в `ErpTableTrustedOptions.props`. `activeSplit`, `tableViewPort` и ref принадлежат адаптеру; JSON не может их переопределить. Неверный тип динамического параметра, недопустимый URL и ошибка callback показываются как ошибка блока. Запоздавшие события после обновления или размонтирования игнорируются.

Проверены разрешение произвольных параметров, точное сохранение непрозрачных фильтров и payload, преобразование ID в Set, запрещённые host-only параметры, контролируемое состояние, поздние события и ошибки асинхронных обработчиков. Работу приватного компонента с реальным API нужно проверить в вашем фронтовом хосте после подключения самого пакета.
