# ErpTableWidget в SDUI

Для будущего подключения **настоящего `ErpTableWidget`** подготовлены SDUI-блок `erpTable`, адаптер, синтетические данные и локальные endpoints по присланным контрактам. Приватный компонент по умолчанию не подключён. В конструкторе сохраняются его настройки, а область блока показывает «Таблица подключается в приложении».

Таблица появится после передачи компонента из `@sber-sbererp/sdds-kit` через `erpTableAdapter`. Сам `ErpTableWidget` получает `tableUrl` и выполняет запросы метаданных и строк. Подготовленные данные можно проверить напрямую через HTTP уже сейчас.

Старый блок `table` больше не рисует таблицу из UI kit. Если он есть в сохранённом шаблоне, renderer показывает подсказку о замене на `erpTable`; старые данные и версии шаблона не изменяются автоматически.

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

## Подготовленные данные

В конструкторе добавьте ERP-таблицу и нажмите **«Пример: расходы по отчёту»**. Кнопка задаёт `tableUrl: "/api/demo/erp-table/expenses"`, фильтр `reportId = demo-report-001` и демонстрационные `customParams`. Настройку можно отменить через Undo. До подключения настоящего компонента в области блока остаётся состояние подключения.

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
  "pageable": { "offset": 0, "limit": 10 }
}
```

Путь, HTTP-методы и форма `sorts` / `filters` / `pageable` воспроизводят предоставленные реальные запросы. По умолчанию `pageable` — `{offset: 0, limit: 10}`. Допустимы целый `offset` от 0 до 1000000 и целый `limit` от 1 до 100. Сортировка принимает до 5 уникальных полей с `isFilterSort: true`, `sortType` — `ASC` или `DESC`. `data.page.totalElements` содержит число найденных записей, `count` — число строк текущего ответа. За пределами диапазона возвращается пустой список.

Демо расходов содержит 16 вымышленных записей двух отчётов. Фильтр `demo-report-001` оставляет 8 записей. Ответ сохраняет `page.limit: null`, `additionalInfo: null` и nullable `label`, `badgeId`, `iconId`, как в присланном примере. При работе со страницами используется отправленный `pageable.limit`. Поля `id` и `reportId` скрыты метаданными. Валюта передаётся отдельно в `currencyLetterCode`; данные не содержат предположения, что все суммы выражены в рублях.

Для проверки HTTP-запроса передайте фильтры явно в `filters`. Сервер поддерживает `EQ`, `IN`, `LIKE`, `BETWEEN`, `GT`, `LT`; плоские группы интерпретируются как «все AND, хотя бы один OR при наличии, ни одного NOT». Например, `AND reportId` вместе с несколькими `OR LIKE` оставляет поиск в пределах отчёта. Это явно заданная семантика демосервера; полная семантика фильтров и общего поиска рабочего SDK не предполагается.

Для запроса строк поддержаны имена query-параметров `mode` и `accounting-template-code`, например `/api/demo/erp-table/expenses?mode=demo-approve&accounting-template-code=DEMO_TRAVEL`. Пример настроек блока использует `customParams.mode` и `customParams.accountingTemplateCode`; их обработку выполняет подключённый компонент. Подготовленный демосервер принимает эти параметры как контекст запроса, не выполняя бизнес-операции.

В обоих маршрутах поддержаны query-параметры:

- `scenario=normal` — вымышленные записи; `empty` — пустые строки; `error` — HTTP 503.
- `delay=0..3000` — задержка HTTP-ответа в миллисекундах, по умолчанию 200.

Сценарии проверяются прямыми HTTP-запросами. Невалидные параметры дают HTTP 400, неверный метод — 405. Ответы не кэшируются. Разрыв соединения отменяет искусственную задержку на сервере.

**HTTP-форма проверена по присланным примерам, реализация остаётся демонстрационной.** Сам приватный пакет здесь отсутствует; для проверки его полного поведения требуется подключение компонента. Мы не обращаемся к рабочему стенду и не сохраняем его адреса, реальные записи или идентификаторы в демонстрационном проекте.

Фикстуры находятся в `src/demo/erp-table-fixture.ts` и `src/demo/erp-expenses-fixture.ts`; API — в `server/erp-table-demo.ts`. Метаданные и строки возвращаются отдельно от определения SDUI. В определении сохраняются адрес таблицы, настройки и привязки параметров.

### Проверка данных без компонента

После `pnpm dev` API доступен на порту `4310`. Следующий PowerShell-пример получает метаданные и 8 расходов первого демонстрационного отчёта:

```powershell
$base = 'http://127.0.0.1:4310/api/demo/erp-table/expenses'
$metadata = Invoke-RestMethod -Method Get -Uri "${base}/metadata?delay=0"
$payload = @{
  sorts = @(@{ sortParam = 'statusName'; sortType = 'ASC' })
  filters = @(@{
    predicateHighLevel = 'AND'
    fieldName = 'reportId'
    search = @('demo-report-001')
    predicateLowLevel = 'EQ'
  })
  pageable = @{ offset = 0; limit = 10 }
} | ConvertTo-Json -Depth 8
$rows = Invoke-RestMethod -Method Post `
  -Uri "${base}?mode=demo-approve&accounting-template-code=DEMO_TRAVEL&delay=0" `
  -ContentType 'application/json' -Body $payload
$metadata.data.metadata
$rows.data.page
$rows.data.rows[0].fields
```

Ожидаемая страница: `offset = 0`, `limit = null`, `count = 8`, `totalElements = 8`. Для второго отчёта замените значение фильтра на `demo-report-002`. JSON запроса выше можно использовать и в любом HTTP-клиенте.

## Подключение настоящего компонента

```tsx
// Например, в src/main.tsx после подключения приватного пакета в хосте.
import { ErpTableWidget } from '@sber-sbererp/sdds-kit';
import App from './App';
import { createErpTableAdapter } from './runtime/erp-table';

const erpTableAdapter = createErpTableAdapter(ErpTableWidget);
<App erpTableAdapter={erpTableAdapter} />;
```

По умолчанию `App` запускается без адаптера. При его передаче один настоящий компонент используется и в конструкторе, и в приложении. Для отдельного встраивания renderer:

```tsx
import { SplitView } from './index';

<SplitView document={resolvedSplit} erpTableAdapter={erpTableAdapter} />;
```

При необходимости хост добавляет доверенные функции, CSS и карты микрофронтов:

```tsx
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
```

После подключения адаптер рендерит настоящий компонент в том же React-дереве, сохраняя тему и контекст хоста. Он поддерживает `memo(forwardRef(...))`, передаёт ref компонента, управляет `activeSplit` и оборачивает `setActiveSplit`/`setRightContent`. Исходные payload правой панели и `Set` выбранных ID передаются обработчикам без изменения формы.

Передать правое содержимое с контекстом SDUI можно также через `onRightContent(value, context)` в параметрах адаптера. Поле `value` намеренно имеет тип `unknown`: интеграция приложения знает фактический `ISplitMicrofront` и решает, как его показать.

Ширина `tableViewPort` измеряется `ResizeObserver`. Скрытая вкладка не монтирует таблицу с нулевой шириной; при появлении компонент получает фактическую ширину контейнера. При смене URL или объекта экземпляр таблицы пересоздаётся. При обычном обновлении данных параметры обновляются, события предыдущих параметров перестают действовать.

## Обновление и ref

При подключённом компоненте кнопка обновления Split-view в приложении увеличивает счётчик и вызывает `refetch()` таблицы. При отдельном встраивании передайте этот счётчик через `SplitView.tableRefreshToken` и увеличивайте его в своём `onRefresh` вместе с обновлением данных карточки. Например:

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
