import { createSberERPWidgetAdapter, type ConnectorComponentProps } from '../runtime/connector';
import type { WidgetRegistry } from '../runtime/widgets';
import { Button } from '../ui';
import './demo-connector.css';

const names = {
  history: '@SberERP/taskman-ui-task/statusHistoryWidget',
  uploader: '@SberERP-docform/documentUploader',
  viewer: '@SberERP-docform/documentViewModal',
};
function eventAt(data: Record<string, unknown>, path: string) {
  let value: unknown = data;
  for (const part of path.split('.'))
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
  return typeof value === 'function' ? value : undefined;
}
function event(data: Record<string, unknown>, path: string, ...args: unknown[]) {
  eventAt(data, path)?.(...args);
}
function preview(value: unknown) {
  return JSON.stringify(
    value,
    (_key, item: unknown) => (typeof item === 'function' ? '[обработчик хоста]' : item),
    2,
  );
}
/** Local contract preview, deliberately not presented as a deployed enterprise widget. */
export function DemoSberERPConnector({ name, data }: ConnectorComponentProps) {
  return (
    <section className="demo-connector">
      <h3>
        {name === names.history
          ? 'История статусов'
          : name === names.uploader
            ? 'Документы'
            : 'Просмотр документа'}
      </h3>
      <p className="demo-connector-note">
        Локальный пример контракта. Для рабочего микрофронта подключите SberERPConnector в хосте.
      </p>
      <dl>
        <dt>Микрофронт</dt>
        <dd>
          <code>{name}</code>
        </dd>
        {name === names.history && (
          <>
            <dt>flowId</dt>
            <dd>{String(data.flowId ?? 'Не передан')}</dd>
          </>
        )}
        {name === names.uploader && (
          <>
            <dt>Потребитель</dt>
            <dd>{String(data.consumer ?? 'Не указан')}</dd>
            <dt>Режим</dt>
            <dd>{data.readonly ? 'Только просмотр' : 'Редактирование разрешено хостом'}</dd>
          </>
        )}
        {name === names.viewer && (
          <>
            <dt>Документ</dt>
            <dd>{String(data.fileName ?? 'Не указан')}</dd>
          </>
        )}
      </dl>
      <details>
        <summary>Переданные параметры и события</summary>
        <pre>{preview(data)}</pre>
      </details>
      <div className="demo-connector-actions">
        {name === names.history && data.setOpened instanceof Function && (
          <Button size="sm" onClick={() => event(data, 'setOpened', false)}>
            Закрыть историю
          </Button>
        )}
        {name === names.uploader && (
          <Button
            size="sm"
            disabled={!eventAt(data, 'onView')}
            onClick={() => event(data, 'onView', { id: 'demo-document', name: 'Пример документа' })}
          >
            Проверить событие просмотра
          </Button>
        )}
        {name === names.viewer && (
          <>
            <Button
              size="sm"
              disabled={!eventAt(data, 'buttons.accept.handler')}
              onClick={() => event(data, 'buttons.accept.handler')}
            >
              Проверить событие печати
            </Button>
            <Button size="sm" disabled={!eventAt(data, 'onClose')} onClick={() => event(data, 'onClose')}>
              Закрыть документ
            </Button>
          </>
        )}
      </div>
      {((name === names.uploader && !eventAt(data, 'onView')) ||
        (name === names.viewer &&
          (!eventAt(data, 'onClose') || !eventAt(data, 'buttons.accept.handler')))) && (
        <p className="demo-connector-note">
          Чтобы проверить кнопки, настройте соответствующие события виджета в конструкторе.
        </p>
      )}
    </section>
  );
}
const demoHandlers = {
  printDocument: () => undefined,
  viewDocument: () => undefined,
  documentsChanged: () => undefined,
  deleteDocument: () => undefined,
};
export const demoConnectorRegistry: WidgetRegistry = {
  'taskman-history': createSberERPWidgetAdapter(DemoSberERPConnector, {
    name: names.history,
    defaults: { isStepper: true },
  }),
  'document-uploader': createSberERPWidgetAdapter(DemoSberERPConnector, {
    name: names.uploader,
    defaults: { consumer: 'split-studio', readonly: true, uploadedFiles: [] },
    handlers: demoHandlers,
  }),
  'document-viewer': createSberERPWidgetAdapter(DemoSberERPConnector, {
    name: names.viewer,
    openProp: 'open',
    handlers: demoHandlers,
  }),
};
