import type { CatalogField, JsonValue } from './model';
import { isJsonValue, isSafeBinding, resolveBindingPath } from './values';

const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const indexOf = (key: string) => (/^(0|[1-9]\d*)$/.test(key) ? Number(key) : undefined);

/** Immutable authoring edit. Existing parent values are never silently replaced. */
export function writeBinding(
  data: Record<string, unknown>,
  binding: string,
  value: JsonValue,
): Record<string, unknown> {
  if (!isSafeBinding(binding)) throw new Error('Укажите безопасный путь через точку.');
  if (/^\$(?:context|item|root)(?:\.|$)/.test(binding))
    throw new Error('Контекст формирует хост; изменяйте данные карточки.');
  if (!isJsonValue(value)) throw new Error('Нужно JSON-значение без служебных ключей.');
  const path = resolveBindingPath(data, binding).split('.');
  if (path.length > 24) throw new Error('Допустимо до 24 уровней вложенности.');
  const result = structuredClone(data);
  let current: Record<string, unknown> | unknown[] = result;
  for (let position = 0; position < path.length; position++) {
    const key = path[position];
    if (Array.isArray(current)) {
      const index = indexOf(key);
      if (index === undefined || index > current.length || index > 20000)
        throw new Error('Для списка укажите существующий индекс или следующую строку без пропусков.');
    }
    if (position === path.length - 1) {
      (current as Record<string, unknown>)[key] = structuredClone(value);
      break;
    }
    if (!own(current, key))
      (current as Record<string, unknown>)[key] = indexOf(path[position + 1]) === undefined ? {} : [];
    const next = (current as Record<string, unknown>)[key];
    if (next === null || typeof next !== 'object')
      throw new Error(
        `«${path.slice(0, position + 1).join('.')}» уже содержит простое значение. Сначала задайте ему объект или выберите другой путь.`,
      );
    current = next as Record<string, unknown> | unknown[];
  }
  if (!isJsonValue(result))
    throw new Error('Получившиеся данные превышают ограничения JSON: 24 уровня и 20 000 значений.');
  return result;
}

/** Actual API keys augment the catalog, including the first sample row of arrays. */
export function dataBindingSuggestions(data: unknown): CatalogField[] {
  const result: CatalogField[] = [];
  const seen = new WeakSet<object>();
  const visit = (value: unknown, path: string, depth: number) => {
    if (result.length >= 180 || depth > 8) return;
    if (path && isSafeBinding(path))
      result.push({
        binding: path,
        label: path.split('.').at(-1)!,
        group: 'Данные предпросмотра',
        type: typeof value === 'number' ? 'number' : 'text',
        description: 'Поле из текущих данных предпросмотра',
        example:
          value === null
            ? 'null'
            : typeof value === 'object'
              ? Array.isArray(value)
                ? '[…]'
                : '{…}'
              : String(value ?? ''),
      });
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length) visit(value[0], path ? `${path}.0` : '0', depth + 1);
    } else
      for (const [key, child] of Object.entries(value)) {
        if (result.length >= 180) break;
        if (!key.includes('.') && isSafeBinding(key)) visit(child, path ? `${path}.${key}` : key, depth + 1);
      }
  };
  visit(data, '', 0);
  return result;
}
