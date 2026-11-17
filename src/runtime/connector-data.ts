import type { WidgetInput, WidgetRuntimeEvent } from '../../shared/model';

export interface ConnectorOptions {
  /** Defined by the host, never read from an executable URL in SDUI. */
  name: string;
  openProp?: string;
  defaults?: Record<string, unknown>;
  handlers?: Readonly<Record<string, (...args: unknown[]) => unknown>>;
}
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function parts(path: string): string[] {
  const result = path.split('.');
  if (!path || result.some((key) => !key || forbidden.has(key)))
    throw new Error('Недопустимое имя параметра виджета');
  return result;
}
function copyValue(value: unknown, depth = 0): unknown {
  if (depth > 20) throw new Error('Параметры виджета слишком глубоко вложены');
  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map((item) => copyValue(item, depth + 1));
  if (typeof value !== 'object') throw new Error('Параметры виджета должны содержать данные JSON');
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as object)) {
    if (forbidden.has(key)) throw new Error('Недопустимое имя параметра виджета');
    result[key] = copyValue(child, depth + 1);
  }
  return result;
}
function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = parts(path);
  let current = target;
  for (const key of keys.slice(0, -1)) {
    const previous = current[key];
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

/** JSON supplies values and event declarations. Functions are created only by this host adapter. */
export function createConnectorData(
  input: WidgetInput | undefined,
  emit: (event: WidgetRuntimeEvent) => void,
  options: ConnectorOptions,
  isActive: () => boolean = () => true,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...options.defaults, ...input?.data }))
    setPath(data, key, copyValue(value));
  if (options.openProp) setPath(data, options.openProp, true);
  for (const [path, event] of Object.entries(input?.events ?? {})) {
    setPath(data, path, (...args: unknown[]) => {
      if (!isActive()) return;
      try {
        if (event.type === 'close') {
          // React state setters can be called with true during initialization.
          // Only false (or a no-argument onClose callback) is a close request.
          if (args[0] === true || typeof args[0] === 'function') return;
          emit({ type: 'close' });
        } else if (event.type === 'refresh') emit({ type: 'dataChanged' });
        else if (event.type === 'host') {
          const handler = Object.prototype.hasOwnProperty.call(options.handlers ?? {}, event.name)
            ? options.handlers?.[event.name]
            : undefined;
          if (!handler) {
            emit({ type: 'error', message: `Обработчик «${event.name}» не зарегистрирован в хосте` });
            return;
          }
          const result = handler(...args);
          if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
            return Promise.resolve(result)
              .then(() => {
                if (isActive()) emit({ type: 'host', name: event.name, args });
              })
              .catch(() => {
                if (isActive()) emit({ type: 'error', message: 'Не удалось обработать событие виджета' });
              });
          }
          emit({ type: 'host', name: event.name, args });
        }
      } catch {
        emit({ type: 'error', message: 'Не удалось обработать событие виджета' });
      }
    });
  }
  return data;
}
