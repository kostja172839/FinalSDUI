# ErpTableWidget в SDUI

Блок `erpTable` подключает **ваш готовый компонент `ErpTableWidget`** по предоставленному TypeScript-интерфейсу. Он отличается от простого блока `table`: SDUI не запрашивает метаданные и строки, не создаёт колонки по собственной схеме и не подменяет встроенные действия реестра. Сам `ErpTableWidget` получает `tableUrl` и выполняет свои запросы.

В этом отдельном проекте приватный пакет таблицы недоступен. Без подключённого адаптера renderer показывает состояние «Таблица подключается в приложении». В демоприложении подключён отдельный сетевой адаптер: он обращается к локальному демо-API, описанному ниже. Запросы к рабочим ERP-сервисам этот адаптер не выполняет. Настоящий `ErpTableWidget` подключается приложением через тот же интерфейс адаптера.

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

## Просмотр через демо-API

В «Блоки → ERP-таблица» сразу доступен сетевой пример расходов. В конструкторе добавьте ERP-таблицу и нажмите **«Пример: расходы по отчёту»**. Кнопка задаёт `tableUrl: "/api/demo/erp-table/expenses"`, фильтр `reportId = demo-report-001` и демонстрационные `customParams`. Это действие отменяется через Undo. Отдельная кнопка **«Подключить демо API»** у пустого блока подключает продуктовые события. Старый адрес `/demo/erp-table` поддержан как псевдоним источника событий.

Демокомпонент запрашивает метаданные и первую страницу параллельно. Поиск, сортировка, переключение страниц и обновление выполняют новые HTTP-запросы. Во время загрузки показывается индикатор; при HTTP-ошибке доступна кнопка повторного запроса. Отменённый или запоздавший ответ не перезаписывает результат нового запроса. В **«Запросы и ответы демо API»** под таблицей видны адреса, тело запроса строк и оба полученных JSON.

Видимый компонент — **просмотр контракта на FinAI Table**, подключённый через `createErpTableAdapter`. Приватный `ErpTableWidget` здесь отсутствует. Он показывает колонки по `fieldName` и `position`, скрытие колонок, типы значений, бейджи и `subValue`. Действия, фильтры и редактирование приватной таблицы этот просмотр не воспроизводит. Технические ID строк не угадываются, выбор строк и бизнес-действия не имитируются.

### Маршруты и ответы

Два локальных `tableUrl`: `/api/demo/erp-table/expenses` и `/api/demo/erp-table/product-events`.

| Запрос                    | Ответ                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `GET {tableUrl}/metadata` | `IMetaDataResponse`: колонки в `data.metadata`, оформления статусов в `data.badges` |
| `POST {tableUrl}`         | `IRowData`: сырые `data.rows[].fields`, `data.page`, `data.additionalInfo`          |

Пример тела запроса строк:

```json
{
  "sorts": [{ "sortParam": "statusName", "sortType": "ASC" }],
  "filters": [
    {
      "predicateHighLevel": "AND",
      "fieldName": "reportId",
      "search": ["demo-report-001"],
      "predicateLowLevel": "EQ"
    }
  ],
  "pageable": { "offset": 0, "limit": 5 }
}
```

Путь, HTTP-методы и форма `sorts` / `filters` / `pageable` воспроизводят предоставленные реальные запросы. По умолчанию `pageable` — `{offset: 0, limit: 10}`. Допустимы целый `offset` от 0 до 1000000 и целый `limit` от 1 до 100. Сортировка принимает до 5 уникальных полей с `isFilterSort: true`, `sortType` — `ASC` или `DESC`. `data.page.totalElements` содержит число найденных записей, `count` — число строк текущего ответа. За пределами диапазона возвращается пустой список.

Демо расходов содержит 16 вымышленных записей двух отчётов. Фильтр `demo-report-001` оставляет 8 записей. Как в фактическом ответе, допускаются `page.limit: null`, `additionalInfo: null`, nullable `label`, `badgeId` и `iconId`; размер страницы для навигации берётся из отправленного `pageable.limit`. Поля `id` и `reportId` скрыты метаданными. Формат `money` показывает число с двумя знаками: валюта указывается отдельным полем либо в заголовке, автоматически ₽ не подставляется.

`defaultQueryFiltres`, `techFilters` и `initialFilters` объединяются в `filters`. Демопоиск добавляет `OR` + `LIKE` по полям метаданных, исключая `isHideAlways`; это поведение нашего демонстрационного адаптера. Фактический payload общего поиска приватного SDK пока не предоставлен. Сервер поддерживает `EQ`, `IN`, `LIKE`, `BETWEEN`, `GT`, `LT`; плоские группы интерпретируются как «все AND, хотя бы один OR при наличии, ни одного NOT». Поэтому общий поиск не снимает обязательный фильтр отчёта. Эти правила работы демосервера не заявляются полной реализацией семантики рабочего backend.

`customParams.mode` добавляет `mode`, `customParams.accountingTemplateCode` — `accounting-template-code` к запросу строк, например `/api/demo/erp-table/expenses?mode=approve&accounting-template-code=DEMO_TRAVEL`. Метаданные загружаются без этих query-параметров, как в присланном примере. Другие параметры приватного SDK демоадаптер не угадывает.

В обоих маршрутах поддержаны query-параметры:

- `scenario=normal` — вымышленные записи; `empty` — пустые строки; `error` — HTTP 503.
- `delay=0..3000` — задержка в миллисекундах, по умолчанию 200. Например, `tableUrl: "/api/demo/erp-table/product-events?delay=1500"` помогает увидеть индикатор загрузки.

Сценарий можно переключить прямо в таблице. Этот переключатель влияет только на текущий предпросмотр. Невалидные параметры дают HTTP 400, неверный метод — 405. Ответы не кэшируются. Разрыв соединения отменяет искусственную задержку на сервере.

**HTTP-форма проверена по присланным примерам, реализация остаётся демонстрационной.** Сам приватный пакет здесь отсутствует; для проверки его полного поведения требуется подключение компонента. Мы не обращаемся к рабочему стенду и не сохраняем его адреса, реальные записи или идентификаторы в демонстрационном проекте.

Фикстуры находятся в `src/demo/erp-table-fixture.ts` и `src/demo/erp-expenses-fixture.ts`; API — в `server/erp-table-demo.ts`. Демо-данные не записываются в SDUI JSON, данные карточек и опубликованные шаблоны. Сетевой демоадаптер принимает только указанные локальные демонстрационные адреса; для других `tableUrl` подключите настоящий компонент приложения.

## Подключение настоящего компонента

```tsx
// Приватный пакет импортируется в вашем фронтовом хосте.
import { ErpTableWidget } from '@sber-sbererp/sdds-kit';
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
