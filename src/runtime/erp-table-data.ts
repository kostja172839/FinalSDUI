import type {
  ErpTableNode,
  WidgetContext,
  WidgetInput,
  WidgetRuntimeEvent,
  WidgetEventBinding,
} from '../../shared/model';
import { isJsonValue, resolveValue, resolveWidgetInput } from '../../shared/values';
import { createConnectorData } from './connector-data';
import {
  ERP_TABLE_DATA_PROPS,
  ERP_TABLE_EVENTS,
  safeErpTableUrl,
  validateErpTableOptions,
} from '../../shared/erp-table-contract';
export { ERP_TABLE_DATA_PROPS, ERP_TABLE_EVENTS, safeErpTableUrl } from '../../shared/erp-table-contract';
const allowed = new Set<string>(ERP_TABLE_DATA_PROPS);
const events = new Set<string>(ERP_TABLE_EVENTS);

/** Compile node data only. ErpTableWidget itself loads metadata/rows from tableUrl. */
export function resolveErpTableInput(
  node: ErpTableNode,
  data: Record<string, unknown>,
  context: WidgetContext,
): WidgetInput {
  const scope = { ...data, $context: context };
  const tableUrl = resolveValue(scope, node.tableUrl);
  if (!safeErpTableUrl(tableUrl))
    throw new Error('Укажите адрес таблицы из данных API или задайте путь /api/...');
  const resolved = resolveWidgetInput({ props: node.props, events: node.events }, data, context);
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...node.options, ...resolved.data })) {
    if (!allowed.has(key)) throw new Error('Параметр таблицы не поддерживается в SDUI');
    if (!isJsonValue(value)) throw new Error('Параметры таблицы должны содержать данные JSON');
    props[key] = structuredClone(value);
  }
  for (const key of Object.keys(node.events ?? {}))
    if (!events.has(key)) throw new Error('Событие таблицы не поддерживается');
  const optionIssues = validateErpTableOptions(props);
  if (optionIssues.length) throw new Error(optionIssues[0].message);
  // A Set cannot cross JSON. Recreate precisely the type required by ErpTableWidget.
  if (props.defaultSelectRows !== undefined) {
    if (
      !Array.isArray(props.defaultSelectRows) ||
      !props.defaultSelectRows.every(
        (id) => typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id)),
      )
    )
      throw new Error('Выделенные строки должны содержать список ID');
    props.defaultSelectRows = new Set(props.defaultSelectRows);
  }
  return { data: { ...props, tableUrl }, ...(resolved.events ? { events: resolved.events } : {}) };
}

export interface ErpTableEventOptions {
  context: WidgetContext;
  emit: (event: WidgetRuntimeEvent) => void;
  isCurrent: () => boolean;
  setActiveSplit: (open: boolean) => void;
  onRightContent?: (value: unknown, context: WidgetContext) => unknown;
  trustedProps?: Record<string, unknown>;
  handlers?: Readonly<Record<string, (...args: unknown[]) => unknown>>;
}

/** Native callbacks keep opaque private payloads intact; only their effects are declarative. */
export function createErpTableCallbacks(
  mappings: Record<string, WidgetEventBinding> | undefined,
  options: ErpTableEventOptions,
): Record<string, (...args: unknown[]) => void> {
  const { isCurrent, emit } = options;
  const declared = createConnectorData(
    { data: {}, events: mappings },
    emit,
    { name: 'ErpTableWidget', handlers: options.handlers },
    isCurrent,
  );
  const callbacks: Record<string, (...args: unknown[]) => void> = {};
  const call = (handler: unknown, args: unknown[]) => {
    if (typeof handler !== 'function') return;
    const result = handler(...args);
    if (result && typeof (result as PromiseLike<unknown>).then === 'function')
      Promise.resolve(result).catch(() => {
        if (isCurrent()) emit({ type: 'error', message: 'Не удалось обработать событие таблицы.' });
      });
  };
  for (const name of ERP_TABLE_EVENTS) {
    const trusted = options.trustedProps?.[name];
    const mapping = declared[name];
    if (
      !['setActiveSplit', 'setRightContent'].includes(name) &&
      typeof mapping !== 'function' &&
      typeof trusted !== 'function'
    )
      continue;
    callbacks[name] = (...args: unknown[]) => {
      if (!isCurrent()) return;
      try {
        if (name === 'setActiveSplit' && typeof args[0] === 'boolean') options.setActiveSplit(args[0]);
        if (name === 'setRightContent') call(options.onRightContent, [args[0], options.context]);
        call(trusted, args);
        call(mapping, args);
      } catch {
        emit({ type: 'error', message: 'Не удалось обработать событие таблицы.' });
      }
    };
  }
  return callbacks;
}
