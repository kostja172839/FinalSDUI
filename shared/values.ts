import type {
  ContentNode,
  SplitTemplate,
  ValueSource,
  WidgetContext,
  WidgetInput,
  WidgetInvocation,
} from './model';

const forbidden = new Set(['__proto__', 'prototype', 'constructor']);

/** Dot notation only: property names and numeric array indexes, never expressions. */
export function isSafeBinding(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 2000 &&
    path.split('.').length <= 64 &&
    path.split('.').every((part) => !forbidden.has(part) && /^[\p{L}\p{N}_$-]+$/u.test(part))
  );
}

export function resolveBindingPath(data: unknown, path: string): string {
  // Compatibility is limited to missing root namespaces. An explicitly supplied
  // legacy key always wins, including null/undefined; business data is not rewritten.
  if (data && typeof data === 'object') {
    const own = (key: string) => Object.prototype.hasOwnProperty.call(data, key);
    const root = path.split('.')[0];
    if (root === 'asset' && !own('asset') && own('entity')) path = `entity${path.slice(5)}`;
    else if (root === 'entity' && !own('entity') && own('asset')) path = `asset${path.slice(6)}`;
    else if (root === 'events' && !own('events') && own('collections')) path = `collections.${path}`;
    else if (
      path.startsWith('collections.events') &&
      !own('collections') &&
      own('events') &&
      (path === 'collections.events' || path.startsWith('collections.events.'))
    )
      path = path.slice('collections.'.length);
  }
  return path;
}

export function readPath(data: unknown, path: string): unknown {
  if (!isSafeBinding(path)) return undefined;
  path = resolveBindingPath(data, path);
  let current = data;
  for (const part of path.split('.')) {
    if (
      current === null ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, part)
    )
      return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Editable projection only. Published snapshots and literal values remain untouched. */
export function canonicalizeDefinition(definition: SplitTemplate): SplitTemplate {
  const copy = structuredClone(definition);
  const path = (value: string) =>
    typeof value !== 'string'
      ? value
      : value === 'asset' || value.startsWith('asset.')
        ? `entity${value.slice(5)}`
        : value === 'events' || value.startsWith('events.')
          ? `collections.${value}`
          : value;
  const source = (value?: ValueSource) => {
    if (value?.kind === 'binding') value.path = path(value.path);
  };
  const bound = (value: { binding: string; source?: ValueSource }) => {
    value.binding = path(value.binding);
    source(value.source);
  };
  const invocation = (value: WidgetInvocation) => Object.values(value.props ?? {}).forEach(source);
  for (const key of ['title', 'subtitle', 'status'] as const) {
    copy.header[`${key}Binding`] = path(copy.header[`${key}Binding`]);
    source(copy.header[`${key}Source`]);
  }
  copy.header.fields?.forEach(bound);
  copy.header.actions?.forEach(invocation);
  copy.footer.actions?.forEach(invocation);
  copy.footer.buttons?.forEach(({ action }) => {
    if (action.kind === 'openWidget') invocation(action);
    else if (action.kind === 'host') Object.values(action.params ?? {}).forEach(source);
  });
  const visit = (nodes: ContentNode[]) =>
    nodes.forEach((node) => {
      if (node.visibleWhen) node.visibleWhen.binding = path(node.visibleWhen.binding);
      if (node.type === 'fields') node.fields.forEach(bound);
      else if (node.type === 'metrics') node.items.forEach(bound);
      else if (node.type === 'section') visit(node.children);
      else if (node.type === 'widget') invocation(node);
      else if (node.type === 'erpTable') {
        source(node.tableUrl);
        invocation(node);
      } else if (node.type === 'badge' || node.type === 'progress') source(node.value);
      else if (node.type === 'avatar') {
        source(node.name);
        source(node.src);
      } else if (node.type === 'image') {
        source(node.src);
        source(node.alt);
      } else if ('binding' in node) {
        bound(node);
        if (node.type === 'documents' && node.action) invocation(node.action);
      }
    });
  copy.tabs.forEach((tab) => visit(tab.nodes));
  return copy;
}

export function resolveValue(data: unknown, source?: ValueSource, legacyBinding?: string): unknown {
  if (source?.kind === 'literal') return source.value;
  return readPath(data, source?.kind === 'binding' ? source.path : (legacyBinding ?? ''));
}

/** Reject executable values, prototype keys, cycles and excessively large/deep JSON values. */
export function isJsonValue(value: unknown): boolean {
  const seen = new WeakSet<object>();
  let count = 0;
  const visit = (item: unknown, depth: number): boolean => {
    if (++count > 20000 || depth > 24) return false;
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item !== 'object' || seen.has(item)) return false;
    seen.add(item);
    if (Array.isArray(item)) {
      const valid = item.every((child) => visit(child, depth + 1));
      seen.delete(item);
      return valid;
    }
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const valid = Object.entries(item).every(
      ([key, child]) => !forbidden.has(key) && visit(child, depth + 1),
    );
    seen.delete(item);
    return valid;
  };
  return visit(value, 0);
}

export function resolveWidgetInput(
  invocation: WidgetInvocation,
  data: Record<string, unknown>,
  context: WidgetContext,
): WidgetInput {
  const scope = { ...data, $context: context };
  const result: Record<string, unknown> = {};
  for (const [path, source] of Object.entries(invocation.props ?? {})) {
    if (!isSafeBinding(path)) continue;
    const value = resolveValue(scope, source);
    if (value === undefined) continue;
    const parts = path.split('.');
    let target = result;
    for (const part of parts.slice(0, -1)) {
      const previous = target[part];
      target[part] = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
      target = target[part] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]] = structuredClone(value);
  }
  return { data: result, ...(invocation.events ? { events: structuredClone(invocation.events) } : {}) };
}
