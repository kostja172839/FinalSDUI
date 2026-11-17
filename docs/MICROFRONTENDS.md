# Микрофронты через SberERPConnector

SDUI описывает, **какой зарегистрированный виджет открыть, какие данные передать и какие события обработать**. Фронтовый хост создаёт React-компонент `SberERPConnector` с привычными `name` и `data`. В JSON нет функций, импортов, URL исполняемых модулей или `eval`.

В проекте добавлены контракты из предоставленных примеров:

| widgetId            | name коннектора                                | Размещение                 |
| ------------------- | ---------------------------------------------- | -------------------------- |
| `taskman-history`   | `@SberERP/taskman-ui-task/statusHistoryWidget` | Блок внутри карточки       |
| `document-uploader` | `@SberERP-docform/documentUploader`            | Блок внутри карточки       |
| `document-viewer`   | `@SberERP-docform/documentViewModal`           | Отдельное открытие из меню |

Эти три реализации в Split Studio — **локальные демонстрации интерфейса передачи данных**. Они не загружают внутренние пакеты вашей системы, не отправляют файлы, не печатают документы и не выполняют бизнес-операции. Рабочий коннектор импортируется из реального пакета вашего проекта в хосте.

## Подключение рабочего коннектора

```tsx
// SberERPConnector импортируется из фактического пакета вашего проекта.
import { createSberERPWidgetAdapter, SplitView, ExternalWidgetHost } from './split-studio';

const registry = {
  'taskman-history': createSberERPWidgetAdapter(SberERPConnector, {
    name: '@SberERP/taskman-ui-task/statusHistoryWidget',
    defaults: { isStepper: true },
  }),
  'document-viewer': createSberERPWidgetAdapter(SberERPConnector, {
    name: '@SberERP-docform/documentViewModal',
    openProp: 'open',
    handlers: {
      printDocument: (...args) => handlePrint(...args),
    },
  }),
};

// Ваше состояние управляет текущим запросом открытия.
<SplitView document={resolvedSplit} registry={registry} onOpenWidget={setIntent} />;
{
  intent && <ExternalWidgetHost intent={intent} registry={registry} onResult={handleWidgetResult} />;
}
```

`ExternalWidgetHost` по умолчанию не рисует дополнительное окно: микрофронт может сам использовать `createPortal(..., document.body)` и собственную модальную оболочку, как в вашем примере. `chrome` включает боковую оболочку только для демонстрации в Split Studio. В продакшене её можно не включать.

`name` фиксируется при регистрации адаптера в коде хоста. Для другого микрофронта добавьте свой дескриптор в каталог, переданный серверу через `ServerOptions.catalog`, и адаптер с тем же `widgetId` в `registry`. Каталог содержит описание параметров и событий для конструктора; значения параметров при этом произвольные.

## Встроенный блок

```json
{
  "id": "task-history",
  "type": "widget",
  "title": "История согласования",
  "widgetId": "taskman-history",
  "height": 240,
  "props": {
    "flowId": { "kind": "binding", "path": "task.flow.id" },
    "isStepper": { "kind": "literal", "value": true }
  }
}
```

Данные берутся из любого безопасного пути в `ResolvedSplit.data`. Контекст доступен под `$context`: например, `$context.entityId`. Можно передавать строки, числа, `false`, `null`, массивы и объекты. Двоичные файлы не помещаются в JSON: передавайте идентификатор/метаданные, а получение самого файла выполняет хост или микрофронт.

## Действие открытия и обработчики

```json
{
  "id": "view-report",
  "label": "Открыть отчёт",
  "kind": "openWidget",
  "widgetId": "document-viewer",
  "props": {
    "file": { "kind": "binding", "path": "report.file" },
    "fileName": { "kind": "binding", "path": "report.title" },
    "footer": { "kind": "literal", "value": true },
    "buttons.cancel.label": { "kind": "literal", "value": "Закрыть" },
    "buttons.accept.label": { "kind": "literal", "value": "Печать" }
  },
  "events": {
    "onClose": { "type": "close" },
    "buttons.cancel.handler": { "type": "close" },
    "buttons.accept.handler": { "type": "host", "name": "printDocument" }
  }
}
```

Адаптер сформирует вложенный `data.buttons.cancel.handler` как локальную функцию. Настройки `props` не должны дублировать пути друг друга: задавайте либо целый объект `buttons`, либо отдельные пути к его свойствам.

Виды событий:

- `close`: закрывает текущий экземпляр. `setOpened(false)` закрывает, `setOpened(true)` не закрывает; функция изменения состояния из удалённого кода не выполняется.
- `refresh`: сообщает об изменении данных. Встроенный блок вызывает обновление карточки. Для внешнего виджета `ExternalWidgetHost` запоминает изменение и возвращает `dataChanged: true` при закрытии.
- `host`: вызывает только обработчик из `ConnectorOptions.handlers` с исходными аргументами. Например, `onView` можно сопоставить с `viewDocument`, а `onChange` — с `documentsChanged`. Неподключённый обработчик показывает ошибку интеграции. Промисы поддерживаются; ошибка обработчика изолируется.

При размонтировании и обновлении параметров старые функции перестают отправлять события. Ошибка микрофронта изолируется, React-root освобождается, поздно завершившийся асинхронный `mount` также корректно очищается. `correlationId` связывает результат с конкретным запросом открытия; хост должен проверять его перед обновлением текущей карточки.
