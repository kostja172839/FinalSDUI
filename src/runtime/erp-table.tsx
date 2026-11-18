import {
  Component,
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from 'react';
import { AlertCircle, Table2 } from 'lucide-react';
import type { ErpTableNode, WidgetContext, WidgetRuntimeEvent } from '../../shared/model';
import { createErpTableCallbacks, resolveErpTableInput } from './erp-table-data';
import { resolveValue } from '../../shared/values';
export {
  ERP_TABLE_DATA_PROPS,
  ERP_TABLE_EVENTS,
  resolveErpTableInput,
  safeErpTableUrl,
} from './erp-table-data';

export interface ErpTableHandle {
  refetch?: () => void | Promise<unknown>;
  saveAllChanges?: () => void | Promise<void | undefined>;
}
export interface ErpTableTrustedOptions {
  /** Local-only CSS, callbacks, mockData/mockMeta and component/import maps belong here. */
  props?: Record<string, unknown>;
  handlers?: Readonly<Record<string, (...args: unknown[]) => unknown>>;
  onRightContent?: (value: unknown, context: WidgetContext) => unknown;
}
export interface ErpTableAdapter {
  render: (props: Record<string, unknown> & { tableUrl: string }, ref: Ref<ErpTableHandle>) => ReactNode;
  options: ErpTableTrustedOptions;
}

/** A typed bridge to the actual private forwardRef component; no package name is guessed. */
export function createErpTableAdapter<P extends { tableUrl: string }>(
  ErpTableWidget: ComponentType<P>,
  options: ErpTableTrustedOptions = {},
): ErpTableAdapter {
  return {
    options,
    render: (props, ref) => createElement(ErpTableWidget, { ...props, ref } as unknown as P),
  };
}

class ErpTableBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface InstanceProps {
  node: ErpTableNode;
  data: Record<string, unknown>;
  context: WidgetContext;
  adapter: ErpTableAdapter;
  onEvent?: (event: WidgetRuntimeEvent) => void;
  refreshToken?: number;
}
const ErpTableInstance = forwardRef<ErpTableHandle, InstanceProps>(function ErpTableInstance(
  { node, data, context, adapter, onEvent, refreshToken },
  forwardedRef,
) {
  const container = useRef<HTMLDivElement>(null);
  const componentRef = useRef<ErpTableHandle>(null);
  const [width, setWidth] = useState(0);
  const [activeSplit, setActiveSplit] = useState(false);
  const [error, setError] = useState<{ token: symbol; message: string }>();
  const callbacks = useRef({ onEvent });
  callbacks.current = { onEvent };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useImperativeHandle(
    forwardedRef,
    () => ({
      refetch: () => {
        if (alive.current) return componentRef.current?.refetch?.();
      },
      saveAllChanges: () => (alive.current ? componentRef.current?.saveAllChanges?.() : undefined),
    }),
    [],
  );
  useLayoutEffect(() => {
    const measure = () => {
      if (!container.current) return;
      setWidth(Math.max(0, Math.floor(container.current.getBoundingClientRect().width)));
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      if (container.current) observer.observe(container.current);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const inputResult = useMemo(() => {
    try {
      return { input: resolveErpTableInput(node, data, context), error: '' };
    } catch (cause) {
      return {
        input: undefined,
        error: cause instanceof Error ? cause.message : 'Проверьте настройки таблицы.',
      };
    }
  }, [node, data, context]);
  const generation = useRef({ input: inputResult.input, adapter, token: Symbol('table') });
  if (generation.current.input !== inputResult.input || generation.current.adapter !== adapter)
    generation.current = { input: inputResult.input, adapter, token: Symbol('table') };
  const token = generation.current.token;
  const isCurrent = () => alive.current && generation.current.token === token;
  const emit = (event: WidgetRuntimeEvent) => {
    if (!isCurrent()) return;
    if (event.type === 'error') setError({ token, message: event.message });
    callbacks.current.onEvent?.(event);
  };
  const previousRefresh = useRef(refreshToken);
  useEffect(() => {
    if (previousRefresh.current === refreshToken) return;
    previousRefresh.current = refreshToken;
    setError(undefined);
    try {
      const result = componentRef.current?.refetch?.();
      if (result && typeof (result as PromiseLike<unknown>).then === 'function')
        Promise.resolve(result).catch(() => {
          if (isCurrent()) emit({ type: 'error', message: 'Не удалось обновить таблицу.' });
        });
    } catch {
      emit({ type: 'error', message: 'Не удалось обновить таблицу.' });
    }
  }, [refreshToken]);
  let props: (Record<string, unknown> & { tableUrl: string }) | undefined;
  if (inputResult.input) {
    // The JSON resolver has already converted defaultSelectRows to Set. It is a native prop,
    // not connector JSON; preserve it separately while generating event functions.
    const { defaultSelectRows, ...jsonData } = inputResult.input.data;
    const callbackData = createErpTableCallbacks(inputResult.input.events, {
      context,
      emit,
      isCurrent,
      setActiveSplit,
      onRightContent: adapter.options.onRightContent,
      trustedProps: adapter.options.props,
      handlers: adapter.options.handlers,
    });
    props = {
      ...adapter.options.props,
      ...jsonData,
      ...(defaultSelectRows instanceof Set ? { defaultSelectRows } : {}),
      ...callbackData,
      activeSplit,
      tableViewPort: width,
      tableUrl: String(inputResult.input.data.tableUrl),
    };
  }
  const message = inputResult.error || (error?.token === token ? error.message : '');
  return (
    <div
      ref={container}
      className="erp-table-host"
      style={{ minHeight: node.height, width: '100%', minWidth: 0 }}
    >
      {message ? (
        <div className="block-error" role="alert">
          <AlertCircle size={18} />
          {message}
        </div>
      ) : width > 0 && props ? (
        <ErpTableBoundary
          key={String(inputResult.input?.data.tableUrl)}
          onError={() =>
            emit({ type: 'error', message: 'Не удалось показать таблицу. Проверьте подключение компонента.' })
          }
        >
          {adapter.render(props, componentRef)}
        </ErpTableBoundary>
      ) : (
        <p className="runtime-note">Подготовка таблицы…</p>
      )}
    </div>
  );
});

export function ErpTableHost({
  node,
  data,
  context,
  adapter,
  onEvent,
  handleRef,
  refreshToken,
}: {
  node: ErpTableNode;
  data: Record<string, unknown>;
  context: WidgetContext;
  adapter?: ErpTableAdapter;
  onEvent?: (event: WidgetRuntimeEvent) => void;
  handleRef?: Ref<ErpTableHandle>;
  refreshToken?: number;
}) {
  if (!adapter)
    return (
      <div className="runtime-empty" style={{ minHeight: node.height }}>
        <Table2 size={24} />
        <p>Таблица подключается в приложении</p>
        <span>
          Для просмотра подключите компонент ErpTableWidget. Адрес и параметры таблицы сохраняются в шаблоне.
        </span>
      </div>
    );
  const url = resolveValue({ ...data, $context: context }, node.tableUrl);
  return (
    <ErpTableInstance
      key={`${node.id}:${context.entityId}:${context.instanceId}:${typeof url === 'string' ? url : ''}`}
      ref={handleRef}
      node={node}
      data={data}
      context={context}
      adapter={adapter}
      onEvent={onEvent}
      refreshToken={refreshToken}
    />
  );
}
