import { Component, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { OpenWidgetIntent, WidgetAdapter, WidgetResult, WidgetRuntimeEvent } from '../../shared/model';
import type { WidgetRegistry } from './widgets';
import { Button, IconButton } from '../ui';
import { X } from 'lucide-react';
import { createConnectorData, type ConnectorOptions } from './connector-data';
export { createConnectorData } from './connector-data';
export type { ConnectorOptions } from './connector-data';

export interface ConnectorComponentProps {
  name: string;
  data: Record<string, unknown>;
}
class ConnectorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
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

/** Wrap the real SberERPConnector import once in the host application. */
export function createSberERPWidgetAdapter(
  Connector: ComponentType<ConnectorComponentProps>,
  options: ConnectorOptions,
): WidgetAdapter {
  if (!options.name.trim()) throw new Error('Укажите name микрофронта');
  return {
    mount(container, _context, emit, input) {
      let active = true;
      let currentInput = input;
      let generation = 0;
      // Validate initial input before creating a React root that would need disposing on failure.
      createConnectorData(currentInput, emit, options, () => false);
      const root = createRoot(container);
      const render = () => {
        const token = ++generation;
        const data = createConnectorData(currentInput, emit, options, () => active && generation === token);
        root.render(
          <ConnectorBoundary
            onError={() => {
              if (active)
                emit({
                  type: 'error',
                  message: 'Не удалось открыть микрофронт. Проверьте подключение в хосте.',
                });
            }}
          >
            <Connector name={options.name} data={data} />
          </ConnectorBoundary>,
        );
      };
      render();
      return {
        update(_nextContext, nextInput) {
          if (!active) return;
          if (nextInput !== undefined) currentInput = nextInput;
          render();
        },
        unmount() {
          if (!active) return;
          active = false;
          // Separate roots can be disposed from another React root's cleanup.
          queueMicrotask(() => root.unmount());
        },
      };
    },
  };
}

/** External widgets may render their own portal/modal; their open/close lifecycle stays in the host. */
export function ExternalWidgetHost({
  intent,
  registry,
  onResult,
  onHostEvent,
  chrome = false,
}: {
  intent: OpenWidgetIntent;
  registry: WidgetRegistry;
  onResult: (result: WidgetResult) => void;
  onHostEvent?: (event: Extract<WidgetRuntimeEvent, { type: 'host' }>) => void;
  /** Demo host chrome; keep false for widgets that create their own modal/portal. */
  chrome?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onResult, onHostEvent });
  callbacks.current = { onResult, onHostEvent };
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let changed = false;
    let completed = false;
    let cleanup: (() => void) | undefined;
    setError('');
    const finish = () => {
      if (!active || completed) return;
      completed = true;
      callbacks.current.onResult({
        correlationId: intent.correlationId,
        status: 'completed',
        dataChanged: changed,
      });
    };
    const adapter = registry[intent.widgetId];
    const container = window.document.createElement('div');
    root.current?.append(container);
    Promise.resolve()
      .then(() => {
        if (!active) return;
        if (!adapter) throw new Error('Микрофронт не зарегистрирован в хосте');
        return adapter.mount(
          container,
          intent.context,
          (event) => {
            if (!active || completed) return;
            if (event.type === 'dataChanged') changed = true;
            else if (event.type === 'close') finish();
            else if (event.type === 'error') setError(event.message);
            else callbacks.current.onHostEvent?.(event);
          },
          intent.input,
        );
      })
      .then((mounted) => {
        if (!mounted) return;
        if (active) cleanup = mounted.unmount;
        else mounted.unmount();
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Не удалось открыть микрофронт');
      });
    return () => {
      active = false;
      container.remove();
      // React may be unmounting the parent root; dispose the separate connector root after its commit.
      if (cleanup) queueMicrotask(cleanup);
    };
  }, [intent, registry]);
  const content = (
    <>
      {error && (
        <div className="block-error" role="alert">
          {error}
        </div>
      )}
      <div ref={root} hidden={Boolean(error)} />
      {error && (
        <Button
          onClick={() =>
            callbacks.current.onResult({ correlationId: intent.correlationId, status: 'cancelled' })
          }
        >
          Закрыть виджет
        </Button>
      )}
    </>
  );
  if (!chrome) return content;
  return (
    <aside className="widget-request-panel" aria-label="Микрофронт">
      <div className="utility-heading">
        <h2>Микрофронт</h2>
        <IconButton
          label="Закрыть микрофронт"
          onClick={() =>
            callbacks.current.onResult({ correlationId: intent.correlationId, status: 'cancelled' })
          }
        >
          <X size={17} />
        </IconButton>
      </div>
      <div className="utility-content">{content}</div>
    </aside>
  );
}
