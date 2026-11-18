import { useEffect, useRef, useState } from 'react';
import type { ValueSource } from '../../shared/model';
import { resolveValue } from '../../shared/values';
import { Button } from '../ui';
import {
  connectionLoadError,
  resolveTableRoute,
  suggestedTableBaseUrl,
  tableMetadataUrl,
  useErpTableConnections,
  type TableRoute,
} from '../runtime/erp-table-connections';
import { usePreviewData } from './previewData';

async function describeMetadataResponse(response: Response): Promise<string> {
  if (!response.ok) {
    if (response.headers.get('X-Erp-Proxy-Error') === '1') {
      const diagnostic = await response.json().catch(() => null);
      return typeof diagnostic?.message === 'string' && diagnostic.message.trim()
        ? `Локальный прокси. ${diagnostic.message}`
        : 'Локальный прокси не смог выполнить запрос.';
    }
    if (response.status === 401) return 'Стенд требует вход. Проверьте срок действия тестовой сессии.';
    if (response.status === 403) return 'Стенд отказал в доступе. Проверьте права на этот реестр.';
    if (response.status === 502)
      return 'Стенд вернул 502 Bad Gateway. Проверьте доступность API таблицы на стенде.';
    return 'Стенд вернул ошибку. Проверьте адрес таблицы.';
  }
  try {
    const payload = await response.json();
    const columns = payload?.data?.metadata;
    return Array.isArray(columns)
      ? `Метаданные получены. Колонок в ответе — ${columns.length}.`
      : 'API вернул JSON. Проверьте, содержит ли ответ список колонок в data.metadata.';
  } catch {
    return 'Ожидался JSON метаданных. Проверьте адрес и сессию на стенде.';
  }
}

function TableRequestTargets({ route }: { route: Extract<TableRoute, { kind: 'proxy' }> }) {
  const local = new URL(route.url);
  const alias = '/__erp_tables/' + encodeURIComponent(route.connection.id);
  const base = new URL(route.connection.baseUrl);
  const rowsUrl = base.origin + base.pathname.replace(/\/$/, '') + local.pathname.slice(alias.length);
  return (
    <>
      <p className="builder-property-copy">
        В Network виден локальный путь <code>{alias}</code>. Прокси отправляет запросы на стенд по адресам
        ниже.
      </p>
      <code>GET {tableMetadataUrl(rowsUrl)}</code>
      <code>POST {rowsUrl}</code>
      {local.search && (
        <p className="builder-property-copy">Параметры из ссылки также передаются на стенд.</p>
      )}
    </>
  );
}

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
      const message = await describeMetadataResponse(response);
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
  if (state.status === 'error') status = state.message || connectionLoadError;
  else if (route.kind === 'proxy')
    status = route.connection.authenticated
      ? `Профиль «${route.connection.id}». Cookie задана в настройках. Доступ к метаданным проверяется запросом ниже.`
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
          <TableRequestTargets route={route} />
          <MetadataCheck key={route.url} url={route.url} />
        </>
      )}
      <details>
        <summary>Настроить локальный прокси</summary>
        <p>
          В <code>.env.local</code> рядом с <code>vite.config.ts</code> задайте параметр <code>baseUrl</code>.
          Для HTTPS-адресов вида <code>…/tables/имя</code> и <code>…/erp-table/имя</code> достаточно домена.
          Для остальных добавьте к домену общий путь к API таблиц.
        </p>
        <pre>{`ERP_TABLE_CONNECTIONS='[{"id":"qa","baseUrl":"${suggestedTableBaseUrl(tableUrl)}","cookieEnv":"ERP_TABLE_COOKIE_QA"}]'
ERP_TABLE_COOKIE_QA='session_name=YOUR_TEST_SESSION_VALUE'`}</pre>
        <p>
          Задайте <code>ERP_TABLE_COOKIE_QA</code> в окружении dev-сервера для своей тестовой сессии.
          Перезапустите Studio и введите полный URL конкретной таблицы в поле «Адрес таблицы».
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
