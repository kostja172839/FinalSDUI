import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { decodeTablePath } from '../shared/erp-dev-path';

const prefix = '/__erp_tables';
const loopbackPeers = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const localHost = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i;
const jsonType = /^application\/(?:json|[\w.+-]+\+json)(?:\s*;|$)/i;
type Environment = Record<string, string | undefined>;
interface Connection {
  id: string;
  baseUrl: string;
  scope: string;
  cookie?: string;
}

class GatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function connectionsFromEnv(env: Environment): Connection[] {
  let input: unknown;
  try {
    input = JSON.parse(env.ERP_TABLE_CONNECTIONS ?? '[]');
  } catch {
    throw new Error('ERP_TABLE_CONNECTIONS должен содержать JSON-массив подключений.');
  }
  if (!Array.isArray(input)) throw new Error('ERP_TABLE_CONNECTIONS должен быть массивом.');
  const ids = new Set<string>();
  const bases = new Set<string>();
  return input
    .map((profile) => {
      if (
        !profile ||
        typeof profile.id !== 'string' ||
        !/^[a-z0-9][a-z0-9_-]*$/.test(profile.id) ||
        profile.id === 'connections' ||
        ids.has(profile.id)
      ) {
        throw new Error('Проверьте уникальность и формат id в ERP_TABLE_CONNECTIONS.');
      }
      const raw = profile.baseUrl;
      const path = typeof raw === 'string' && /^https:\/\/[^/?#\\\s]+(\/[^?#\s]*)$/u.exec(raw)?.[1];
      if (!path || path === '/' || decodeTablePath(path) === undefined) {
        throw new Error(`Укажите HTTPS baseUrl с путём к API таблиц для ${profile.id}.`);
      }
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        throw new Error(`Некорректный baseUrl для ${profile.id}.`);
      }
      const baseUrl = url.href.replace(/\/$/, '');
      const scope = decodeURIComponent(baseUrl);
      if (url.username || url.password || bases.has(scope)) {
        throw new Error(
          `Проверьте baseUrl подключения ${profile.id}. Адрес должен быть уникальным и без учётных данных.`,
        );
      }
      let cookie: string | undefined;
      if (profile.cookieEnv !== undefined) {
        if (
          typeof profile.cookieEnv !== 'string' ||
          !/^ERP_TABLE_COOKIE_[A-Z0-9_]+$/.test(profile.cookieEnv)
        ) {
          throw new Error(`Для ${profile.id} укажите имя переменной ERP_TABLE_COOKIE_… в cookieEnv.`);
        }
        cookie = env[profile.cookieEnv];
        if (!cookie || !/^[\x20-\x7e]+$/.test(cookie) || !cookie.includes('=')) {
          throw new Error(`Проверьте значение переменной cookie для ${profile.id}.`);
        }
      }
      ids.add(profile.id);
      bases.add(scope);
      return { id: profile.id, baseUrl, scope, cookie };
    })
    .sort((a, b) => b.scope.length - a.scope.length);
}

function verifyLocalRequest(req: IncomingMessage) {
  const host = req.headers.host ?? '';
  const scheme = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http';
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (
    !loopbackPeers.has(req.socket.remoteAddress ?? '') ||
    !localHost.test(host) ||
    (site && site !== 'same-origin' && site !== 'none') ||
    (origin !== undefined && origin !== `${scheme}://${host}`) ||
    (req.method === 'POST' && !origin && site !== 'same-origin')
  ) {
    throw new GatewayError(403, 'Подключения ERP доступны из локальной вкладки Studio.');
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<string> {
  if (!jsonType.test(req.headers['content-type'] ?? '')) {
    throw new GatewayError(415, 'Для POST таблицы требуется Content-Type application/json.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 2 * 1024 * 1024) throw new GatewayError(413, 'Слишком большой запрос таблицы.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createErpDevMiddleware(env: Environment, upstreamFetch: typeof fetch = fetch) {
  const profiles = connectionsFromEnv(env);
  async function handle(req: IncomingMessage, res: ServerResponse, rawUrl: string) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    verifyLocalRequest(req);
    const queryStart = rawUrl.indexOf('?');
    const path = queryStart === -1 ? rawUrl : rawUrl.slice(0, queryStart);
    const query = queryStart === -1 ? '' : rawUrl.slice(queryStart);
    if (decodeTablePath(path) === undefined || rawUrl.includes('#') || /[\u0000-\u001f\u007f]/.test(rawUrl)) {
      throw new GatewayError(400, 'Некорректный путь таблицы.');
    }
    if (path === `${prefix}/connections`) {
      if (req.method !== 'GET') throw new GatewayError(405, 'Список подключений доступен через GET.');
      return sendJson(res, 200, {
        connections: profiles.map(({ id, baseUrl, cookie }) => ({
          id,
          baseUrl,
          authenticated: Boolean(cookie),
        })),
      });
    }
    if (req.method !== 'GET' && req.method !== 'POST') throw new GatewayError(405, 'Доступны GET и POST.');
    const [, , id, ...segments] = path.split('/');
    const connection = profiles.find((profile) => profile.id === id);
    if (!connection) throw new GatewayError(404, 'Локальное подключение ERP не найдено.');
    const address = connection.baseUrl + (segments.length ? `/${segments.join('/')}` : '');
    const decoded = decodeURIComponent(address);
    const owner = profiles.find(({ scope }) => decoded === scope || decoded.startsWith(`${scope}/`));
    if (owner !== connection) throw new GatewayError(403, 'Для этого пути настроено другое подключение.');

    const headers = new Headers({ Accept: 'application/json' });
    if (connection.cookie) headers.set('Cookie', connection.cookie);
    const body = req.method === 'POST' ? await readBody(req) : undefined;
    if (body !== undefined) headers.set('Content-Type', req.headers['content-type']!);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    res.once('close', cancel);
    const timeout = setTimeout(cancel, 60_000);
    try {
      const result = await upstreamFetch(address + query, {
        method: req.method,
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (result.status >= 300 && result.status < 400) {
        await result.body?.cancel();
        throw new GatewayError(
          502,
          'Стенд перенаправил запрос. Проверьте URL таблицы и срок действия сессии.',
        );
      }
      if (!result.body) {
        res.writeHead(result.status);
        res.end();
        return;
      }
      if (!jsonType.test(result.headers.get('Content-Type') ?? '')) {
        await result.body.cancel();
        throw new GatewayError(
          result.ok ? 502 : result.status,
          'Стенд вернул ответ в формате, отличном от JSON. Проверьте адрес и сессию.',
        );
      }
      res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
      await pipeline(Readable.fromWeb(result.body as Parameters<typeof Readable.fromWeb>[0]), res);
    } finally {
      clearTimeout(timeout);
      res.off('close', cancel);
    }
  }
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const rawUrl = req.url ?? '';
    if (!rawUrl.startsWith(`${prefix}/`)) return next();
    void handle(req, res, rawUrl).catch((error: unknown) => {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) return res.destroy();
      const failure =
        error instanceof GatewayError
          ? error
          : new GatewayError(502, 'Не удалось получить ответ от стенда ERP.');
      sendJson(res, failure.status, { message: failure.message });
    });
  };
}
