import { createServer as httpCreateServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog as demoCatalog } from '../shared/catalog';
import { seedEntities, seedTemplates } from '../shared/seeds';
import { validateTemplate, type ValidationCapabilities } from '../shared/validation';
import type { Catalog, EntitySummary, PreviewScenario, SplitTemplate, TemplateRecord } from '../shared/model';
import { isJsonValue } from '../shared/values';
import { TemplateStore } from './store';
import { ApiError, resolveSplit, type EntityData } from './resolve';

export interface ServerOptions {
  dataDir?: string;
  production?: boolean;
  distDir?: string;
  catalog?: Catalog;
  loadEntity?: (
    entityId: string,
    entityType: string,
  ) => EntityData | undefined | Promise<EntityData | undefined>;
  listEntities?: () => EntitySummary[] | Promise<EntitySummary[]>;
}
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 1_000_000) throw new ApiError(413, 'Размер запроса превышает 1 МБ.');
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length && !(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json'))
    throw new ApiError(415, 'Для JSON-запроса используйте Content-Type: application/json.');
  let parsed: unknown;
  try {
    parsed = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  } catch {
    throw new ApiError(400, 'Некорректный JSON.');
  }
  if (!object(parsed)) throw new ApiError(400, 'Ожидается JSON-объект.');
  return parsed;
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}
function find(records: TemplateRecord[], id: string) {
  const record = records.find((r) => r.id === id);
  if (!record) throw new ApiError(404, 'Шаблон не найден.');
  return record;
}
function expected(record: TemplateRecord, value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value))
    throw new ApiError(400, 'Передайте expectedDraftVersion.');
  if (value !== record.draftVersion)
    throw new ApiError(409, 'Черновик изменён в другом окне. Загрузите актуальную версию перед сохранением.');
}
function draft(value: unknown, id: string, catalog: Catalog): SplitTemplate {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    value.id !== id ||
    typeof value.name !== 'string' ||
    !Array.isArray(value.tabs) ||
    !object(value.header) ||
    !object(value.shell) ||
    !object(value.footer)
  )
    throw new ApiError(422, 'Некорректная корневая структура шаблона.', validateTemplate(value, { catalog }));
  return structuredClone(value) as unknown as SplitTemplate;
}
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
async function staticFile(req: IncomingMessage, res: ServerResponse, rawPath: string, distDir: string) {
  if (!['GET', 'HEAD'].includes(req.method ?? '')) throw new ApiError(405, 'Метод не поддерживается.');
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new ApiError(400, 'Некорректный URL.');
  }
  if (
    decoded.includes('\0') ||
    decoded.includes('\\') ||
    decoded.split('/').some((part) => part === '..' || part.startsWith('.'))
  )
    throw new ApiError(400, 'Недопустимый путь.');
  const root = path.resolve(distDir);
  let target = path.resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
    throw new ApiError(400, 'Недопустимый путь.');
  try {
    if (!(await stat(target)).isFile()) target = path.join(root, 'index.html');
  } catch {
    if (path.extname(decoded)) throw new ApiError(404, 'Файл не найден.');
    target = path.join(root, 'index.html');
  }
  let content: Buffer;
  try {
    content = await readFile(target);
  } catch {
    throw new ApiError(404, 'Сборка приложения не найдена. Выполните npm run build.');
  }
  res.writeHead(200, {
    'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
  });
  res.end(req.method === 'HEAD' ? undefined : content);
}

export function createHandler(options: ServerOptions = {}) {
  const catalog = options.catalog ?? demoCatalog;
  const store = new TemplateStore(
    options.dataDir ?? process.env.SDUI_DATA_DIR ?? path.join(projectRoot, 'server', 'data'),
  );
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const rawPath = (req.url ?? '/').split('?')[0];
      const pathname = decodeURIComponent(rawPath);
      const method = req.method ?? 'GET';
      if (pathname === '/api/health' && method === 'GET')
        return json(res, 200, { status: 'ok', mode: 'read-only' });
      if (pathname === '/api/catalog' && method === 'GET') return json(res, 200, catalog);
      if (pathname === '/api/entities' && method === 'GET')
        return json(
          res,
          200,
          options.listEntities
            ? await options.listEntities()
            : seedEntities.map(({ data: _data, version: _version, ...summary }) => summary),
        );
      if (pathname === '/api/templates' && method === 'GET') return json(res, 200, await store.read());
      if (pathname === '/api/templates' && method === 'POST') {
        const input = await body(req);
        const result = await store.mutate((records) => {
          const source =
            input.baseId === undefined ? seedTemplates[0].draft : find(records, String(input.baseId)).draft;
          const definition = structuredClone(source);
          definition.id = `split-${randomUUID().slice(0, 8)}`;
          definition.name =
            typeof input.name === 'string' && input.name.trim()
              ? input.name.trim().slice(0, 200)
              : `${source.name} · копия`;
          const record: TemplateRecord = {
            id: definition.id,
            draft: definition,
            draftVersion: 1,
            updatedAt: new Date().toISOString(),
            versions: [],
            activeRevision: null,
          };
          records.push(record);
          return record;
        });
        return json(res, 201, result);
      }
      const match = /^\/api\/templates\/([^/]+)(?:\/(validate|publish|activate))?$/.exec(pathname);
      if (match) {
        const [, id, operation] = match;
        if (!operation && method === 'GET') return json(res, 200, find(await store.read(), id));
        if (!operation && method === 'PUT') {
          const input = await body(req);
          const result = await store.mutate((records) => {
            const record = find(records, id);
            expected(record, input.expectedDraftVersion);
            record.draft = draft(input.definition, id, catalog);
            record.draftVersion++;
            record.updatedAt = new Date().toISOString();
            return record;
          });
          return json(res, 200, result);
        }
        if (operation === 'validate' && method === 'POST') {
          const input = await body(req);
          const record = find(await store.read(), id);
          return json(res, 200, validateTemplate(input.definition ?? record.draft, { catalog }));
        }
        if (operation === 'publish' && method === 'POST') {
          const input = await body(req);
          const result = await store.mutate((records) => {
            const record = find(records, id);
            expected(record, input.expectedDraftVersion);
            const issues = validateTemplate(record.draft, { catalog });
            if (issues.some((i) => i.severity === 'error'))
              throw new ApiError(422, 'Исправьте ошибки перед публикацией.', issues);
            const revision = Math.max(0, ...record.versions.map((v) => v.revision)) + 1;
            const createdAt = new Date().toISOString();
            record.versions.push({ revision, createdAt, definition: structuredClone(record.draft) });
            record.activeRevision = revision;
            record.updatedAt = createdAt;
            return record;
          });
          return json(res, 200, result);
        }
        if (operation === 'activate' && method === 'POST') {
          const input = await body(req);
          const result = await store.mutate((records) => {
            const record = find(records, id);
            if (!record.versions.some((v) => v.revision === input.revision))
              throw new ApiError(404, 'Опубликованная ревизия не найдена.');
            record.activeRevision = input.revision as number;
            record.updatedAt = new Date().toISOString();
            return record;
          });
          return json(res, 200, result);
        }
        throw new ApiError(405, 'Метод не поддерживается.');
      }
      if (pathname === '/api/resolve' && method === 'POST') {
        const input = await body(req);
        if (typeof input.templateId !== 'string' || typeof input.entityId !== 'string')
          throw new ApiError(400, 'Укажите templateId и entityId.');
        if (!['draft', 'published'].includes(String(input.mode)))
          throw new ApiError(400, 'Режим должен быть draft или published.');
        if (
          input.scenario !== undefined &&
          !['normal', 'long', 'empty', 'error'].includes(String(input.scenario))
        )
          throw new ApiError(400, 'Неизвестный сценарий предпросмотра.');
        const record = find(await store.read(), input.templateId);
        let definition = record.draft;
        let revision: number | 'draft' = 'draft';
        if (input.mode === 'published') {
          if (input.previewData !== undefined)
            throw new ApiError(400, 'Данные предпросмотра нельзя передавать для опубликованного шаблона.');
          if (input.definition !== undefined)
            throw new ApiError(400, 'Опубликованный шаблон нельзя переопределить в запросе.');
          const version = record.versions.find((v) => v.revision === record.activeRevision);
          if (!version) throw new ApiError(404, 'У шаблона нет активной опубликованной ревизии.');
          definition = version.definition;
          revision = version.revision;
        } else if (input.definition !== undefined) definition = draft(input.definition, record.id, catalog);
        if (
          input.previewData !== undefined &&
          (!object(input.previewData) || !isJsonValue(input.previewData))
        )
          throw new ApiError(
            400,
            'Данные предпросмотра должны быть JSON-объектом без служебных свойств (до 24 уровней).',
          );
        let capabilities: ValidationCapabilities | undefined;
        if (input.capabilities !== undefined) {
          if (
            !object(input.capabilities) ||
            ['nodeTypes', 'widgetIds', 'actionIds'].some(
              (key) =>
                input.capabilities &&
                object(input.capabilities) &&
                input.capabilities[key] !== undefined &&
                (!Array.isArray(input.capabilities[key]) ||
                  !(input.capabilities[key] as unknown[]).every((v) => typeof v === 'string')),
            )
          )
            throw new ApiError(400, 'Некорректное описание возможностей клиента.');
          capabilities = input.capabilities as ValidationCapabilities;
        }
        let entity: EntityData | undefined;
        if (input.previewData !== undefined)
          entity = { data: input.previewData as Record<string, unknown>, version: 'preview' };
        else if (options.loadEntity) {
          entity = await options.loadEntity(input.entityId, definition.entityType);
          if (!entity) throw new ApiError(404, 'Объект не найден.');
          if (!object(entity.data) || !isJsonValue(entity.data) || typeof entity.version !== 'string')
            throw new ApiError(502, 'Источник вернул некорректные данные объекта.');
        }
        return json(
          res,
          200,
          resolveSplit(
            definition,
            input.entityId,
            revision,
            (input.scenario ?? 'normal') as PreviewScenario,
            { ...capabilities, catalog },
            entity ? { data: entity.data, entityVersion: entity.version } : undefined,
          ),
        );
      }
      if (pathname.startsWith('/api/')) throw new ApiError(404, 'Маршрут API не найден.');
      if (options.production)
        return await staticFile(req, res, rawPath, options.distDir ?? path.join(projectRoot, 'dist'));
      throw new ApiError(404, 'Откройте интерфейс через Vite dev server.');
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof URIError) return json(res, 400, { message: 'Некорректный URL.' });
      if (error instanceof ApiError)
        return json(res, error.status, {
          message: error.message,
          ...(error.issues ? { issues: error.issues } : {}),
        });
      console.error(error);
      json(res, 500, { message: 'Внутренняя ошибка сервера. Подробности доступны в журнале.' });
    }
  };
}
export function createServer(options: ServerOptions = {}) {
  return httpCreateServer(createHandler(options));
}
