import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { decodeTablePath, isErpTablePath } from '../../shared/erp-dev-path';

export interface ErpTableConnection {
  id: string;
  baseUrl: string;
  authenticated: boolean;
}

type ConnectionsState =
  | { status: 'loading' }
  | { status: 'error'; message?: string }
  | { status: 'ready'; connections: ErpTableConnection[] };

const ConnectionsContext = createContext<ConnectionsState | undefined>(undefined);
export const useErpTableConnections = () => useContext(ConnectionsContext);
export const connectionLoadError =
  'Не удалось прочитать локальные подключения таблиц. Проверьте конфигурацию Vite и обновите страницу.';

export function LocalErpTableConnections({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionsState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/__erp_tables/connections', {
          signal: controller.signal,
          cache: 'no-store',
          redirect: 'error',
        });
        if (response.status === 503) {
          const problem = await response.json();
          if (!controller.signal.aborted)
            setState({
              status: 'error',
              message: typeof problem?.message === 'string' ? problem.message : undefined,
            });
          return;
        }
        if (!response.ok) throw new Error();
        const { connections } = await response.json();
        if (!Array.isArray(connections) || !connections.every(isConnection)) throw new Error();
        if (!controller.signal.aborted) setState({ status: 'ready', connections });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' });
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return <ConnectionsContext.Provider value={state}>{children}</ConnectionsContext.Provider>;
}

function isConnection(value: unknown): value is ErpTableConnection {
  if (typeof value !== 'object' || !value) return false;
  const profile = value as Partial<ErpTableConnection>;
  return (
    typeof profile.id === 'string' &&
    typeof profile.authenticated === 'boolean' &&
    typeof profile.baseUrl === 'string' &&
    URL.canParse(profile.baseUrl) &&
    new URL(profile.baseUrl).protocol === 'https:'
  );
}

export type TableRoute =
  | { kind: 'direct'; url: string }
  | { kind: 'proxy'; url: string; connection: ErpTableConnection }
  | { kind: 'pending' }
  | { kind: 'error'; message: string };

/** Resolve only the private widget's tableUrl. Other HTTP clients keep their own base URLs. */
export function resolveTableRoute(
  tableUrl: string,
  state: ConnectionsState | undefined,
  studioOrigin: string,
): TableRoute {
  const direct = { kind: 'direct', url: tableUrl } as const;
  if (!state || !/^https?:\/\//i.test(tableUrl) || !URL.canParse(tableUrl)) return direct;
  const target = new URL(tableUrl);
  if (target.username || target.password || target.hash)
    return { kind: 'error', message: 'Укажите адрес API таблицы без логина, пароля и фрагмента.' };
  if (target.origin === studioOrigin) return direct;
  if (state.status === 'loading') return { kind: 'pending' };
  if (state.status === 'error') return { kind: 'error', message: state.message || connectionLoadError };
  if (target.pathname === '/')
    return {
      kind: 'error',
      message:
        'Введите полный URL таблицы с путём, например /api/tables/expenses. Виджет добавит /metadata сам.',
    };
  const profiles = state.connections.filter(({ baseUrl }) => new URL(baseUrl).origin === target.origin);
  if (!profiles.length) return direct;
  const targetPath = originalDecodedPath(tableUrl);
  if (targetPath === undefined) return { kind: 'error', message: 'Проверьте путь к таблице в адресе API.' };
  let connection: ErpTableConnection | undefined;
  let longestScope = '';
  for (const profile of profiles) {
    const scope = decodeTablePath(new URL(profile.baseUrl).pathname);
    if (
      scope &&
      scope.length > longestScope.length &&
      (scope === '/' || scope === targetPath || targetPath.startsWith(scope + '/'))
    ) {
      connection = profile;
      longestScope = scope;
    }
  }
  if (!connection) return direct;
  if (longestScope === '/' && !isErpTablePath(targetPath))
    return {
      kind: 'error',
      message:
        'Укажите URL таблицы вида …/tables/имя или …/erp-table/имя. Суффикс /metadata виджет добавит сам. Для другого маршрута задайте в baseUrl путь к API таблиц.',
    };
  const remaining = target.pathname
    .split('/')
    .slice(longestScope === '/' ? 1 : longestScope.split('/').length);
  if (longestScope === '/' && remaining.at(-1) === '') remaining.pop();
  const suffix = remaining.length ? '/' + remaining.join('/') : '';
  // An absolute local URL also takes precedence over axios.defaults.baseURL in the private SDK.
  const local = new URL('/__erp_tables/' + encodeURIComponent(connection.id) + suffix, studioOrigin);
  local.search = target.search;
  return { kind: 'proxy', connection, url: local.href };
}

function originalDecodedPath(tableUrl: string) {
  // URL normalizes dot segments before exposing pathname; inspect the original segments first.
  if (/[\\\s\u0000-\u001f\u007f]/.test(tableUrl)) return undefined;
  const match = /^https?:\/\/[^/?#]+(\/[^?#]*)?(?:[?#].*)?$/i.exec(tableUrl);
  return match ? decodeTablePath(match[1] ?? '/') : undefined;
}

export function suggestedTableBaseUrl(tableUrl: string): string {
  const fallback = 'https://erp.example.test/api/tables';
  if (!URL.canParse(tableUrl)) return fallback;
  const url = new URL(tableUrl);
  if (url.protocol !== 'https:' || url.username || url.password || !/^[a-z0-9._:[\]-]+$/i.test(url.hostname))
    return fallback;
  if (originalDecodedPath(tableUrl) === undefined) return fallback;
  const parts = decodeTablePath(url.pathname)?.split('/').filter(Boolean);
  if (!parts?.length) return url.origin;
  if (parts.length > 1) parts.pop();
  // Encode all punctuation meaningful to dotenv or shell quoting, including apostrophes and dollar signs.
  const path = parts
    .map((part) =>
      encodeURIComponent(part).replace(
        /[!'()*]/g,
        (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase(),
      ),
    )
    .join('/');
  return url.origin + '/' + path;
}

export function tableMetadataUrl(tableUrl: string) {
  const url = new URL(tableUrl);
  url.pathname = url.pathname.replace(/\/$/, '') + '/metadata';
  return url.href;
}
