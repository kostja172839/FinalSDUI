import { useEffect, useRef, useState } from 'react';
import type { ValueSource } from '../../shared/model';
import { resolveValue } from '../../shared/values';
import { Button } from '../ui';
import {
  resolveTableRoute,
  suggestedTableBaseUrl,
  tableMetadataUrl,
  useErpTableConnections,
} from '../runtime/erp-table-connections';
import { usePreviewData } from './previewData';

function MetadataCheck({ url }: { url: string }) {
  const pending = useRef<AbortController>();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => () => pending.current?.abort(), []);

  async function check() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setChecking(true);
    setResult('');
    try {
      const response = await fetch(tableMetadataUrl(url), {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      let message: string;
      if (response.status === 401) message = 'Проверьте срок действия сессии в профиле стенда.';
      else if (response.status === 403)
        message = 'Проверьте права пользователя на этот реестр и доступ к профилю.';
      else if (!response.ok) message = 'Проверьте адрес таблицы и доступность стенда.';
      else {
        try {
          const payload = await response.json();
          const columns = payload?.data?.metadata;
          message = Array.isArray(columns)
            ? `Метаданные получены. Колонок в ответе — ${columns.length}.`
            : 'API вернул JSON. Проверьте, содержит ли ответ список колонок в data.metadata.';
        } catch {
          message = 'Ожидался JSON метаданных. Проверьте адрес и сессию на стенде.';
        }
      }
      if (!controller.signal.aborted) setResult(`HTTP ${response.status}. ${message}`);
    } catch {
      if (!controller.signal.aborted) setResult('Локальный прокси недоступен. Проверьте dev-сервер и сеть.');
    } finally {
      pending.current = undefined;
      if (!controller.signal.aborted) setChecking(false);
    }
  }
  return (
    <>
      <Button size="sm" onClick={check} disabled={checking}>
        {checking ? 'Проверка…' : 'Проверить metadata'}
      </Button>
      {result && (
        <p className="builder-property-copy" role="status">
          {result}
        </p>
      )}
    </>
  );
}

export function ErpTableConnectionPanel({ source }: { source: ValueSource }) {
  const state = useErpTableConnections();
  const preview = usePreviewData();
  if (!state) return null;
  const value = resolveValue(preview.scopeData, source);
  const tableUrl = typeof value === 'string' ? value : '';
  const route = resolveTableRoute(tableUrl, state, window.location.origin);
  let status: string;
  if (route.kind === 'proxy')
    status = route.connection.authenticated
      ? `Профиль «${route.connection.id}» · cookie настроена`
      : `Профиль «${route.connection.id}» · без cookie`;
  else if (route.kind === 'pending') status = 'Загрузка списка подключений…';
  else if (route.kind === 'error') status = route.message;
  else if (!tableUrl) status = 'Укажите URL или выберите поле с адресом таблицы.';
  else if (tableUrl.startsWith('/')) status = 'Относительный адрес приложения.';
  else status = 'Прямой запрос виджета. Для локального прокси добавьте профиль с базовым URL этого API.';

  return (
    <section className="erp-connection-panel" aria-label="Подключение к стенду">
      <strong>Подключение к стенду</strong>
      <p className="builder-property-copy" role="status">
        {status}
      </p>
      {route.kind === 'proxy' && (
        <>
          <code>{route.connection.baseUrl}</code>
          <MetadataCheck key={route.url} url={route.url} />
        </>
      )}
      <details>
        <summary>Настроить локальный прокси</summary>
        <p>
          В корне проекта добавьте в <code>.env.local</code> профиль с базовым путём API, общим для нужных
          таблиц.
        </p>
        <pre>{`ERP_TABLE_CONNECTIONS='[{"id":"qa","baseUrl":"${suggestedTableBaseUrl(tableUrl)}","cookieEnv":"ERP_TABLE_COOKIE_QA"}]'
ERP_TABLE_COOKIE_QA='session_name=YOUR_TEST_SESSION_VALUE'`}</pre>
        <p>
          Задайте <code>ERP_TABLE_COOKIE_QA</code> в окружении dev-сервера для своей тестовой сессии.
          Перезапустите Studio и введите полный адрес таблицы. Профиль выбирается по адресу автоматически.
        </p>
        {state.status === 'ready' && state.connections.length > 0 && (
          <ul aria-label="Доступные профили">
            {state.connections.map(({ id, baseUrl }) => (
              <li key={id}>
                <b>{id}</b> · <code>{baseUrl}</code>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
