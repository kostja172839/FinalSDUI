import {
  Component,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Accordion, AccordionItem, Badge, Table, Tabs, TabItem } from '@salutejs/sdds-finai';
import {
  AlertCircle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Maximize2,
  Minimize2,
  Puzzle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type {
  ContentNode,
  FieldDefinition,
  FieldFormat,
  OpenWidgetIntent,
  ResolvedSplit,
  TableNode,
  WidgetContext,
  WidgetMount,
  WidgetNode,
  WidgetRuntimeEvent,
  DataValidationIssue,
  HostActionRegistry,
  HostActionDescriptor,
} from '../../shared/model';
import { Button, IconButton, Input } from '../ui';
import { displayText, isVisible, safeHref } from './bindings';
import { resolveValue, resolveWidgetInput } from '../../shared/values';
import { validateResolvedData, validateFieldValue, isValidDateValue } from '../../shared/data-validation';
import { RichBlock } from './RichBlocks';
import { demoWidgetRegistry, type WidgetRegistry } from './widgets';
import { getFooterActions, getHeaderActions } from '../../shared/actions';
import { ActionMenu } from './ActionMenu';
import { FooterButtons } from './FooterButtons';
import { DisplayBlock } from './DisplayBlocks';
import { ErpTableHost, type ErpTableAdapter } from './erp-table';
import './runtime.css';
import { editorSelection, fieldSelectionClass } from './editorSelection';
import { EditorNodeFrame, EditorContainerDrop } from '../builder/dragAndDrop';

// FinAI Accordion derives its DOM IDs from numeric event keys.
let nextAccordionKey = 0;

export function FormattedValue({ value, format }: { value: unknown; format: FieldFormat }) {
  if (value === null || value === undefined || value === '')
    return <span className="empty-value">Не указано</span>;
  if (format === 'status') {
    const text = displayText(value);
    const view = /отмен|списан|ошиб/i.test(text)
      ? 'negative'
      : /открыт|учёт|учет|проведен|актив/i.test(text)
        ? 'positive'
        : 'accent';
    return <Badge size="xs" view={view} text={text} transparent />;
  }
  if (format === 'person')
    return (
      <span className="person-value">
        <span className="person-avatar" aria-hidden="true">
          {displayText(value)
            .split(' ')
            .slice(0, 2)
            .map((part) => part[0])
            .join('')}
        </span>
        {displayText(value)}
      </span>
    );
  if (format === 'link') {
    const href = safeHref(typeof value === 'object' ? (value as Record<string, unknown>).href : value);
    return href ? (
      <a className="value-link" href={href} target="_blank" rel="noopener noreferrer">
        {displayText(value)}
        <ArrowUpRight size={14} />
      </a>
    ) : (
      <span>{displayText(value)}</span>
    );
  }
  if (format === 'date') {
    const date = new Date(String(value));
    return (
      <>
        {!isValidDateValue(value)
          ? displayText(value)
          : new Intl.DateTimeFormat('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(date)}
      </>
    );
  }
  if (format === 'money' || format === 'number') {
    const number = Number(value);
    return (
      <>
        {['number', 'string'].includes(typeof value) && String(value).trim() && Number.isFinite(number)
          ? new Intl.NumberFormat(
              'ru-RU',
              format === 'money'
                ? { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }
                : { maximumFractionDigits: 4 },
            ).format(number)
          : displayText(value)}
      </>
    );
  }
  return <>{displayText(value)}</>;
}

class BlockBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: false });
  }
  render() {
    return this.state.error ? (
      <div className="block-error" role="alert">
        <AlertCircle size={18} />
        Не удалось показать блок. Проверьте его настройки.
      </div>
    ) : (
      this.props.children
    );
  }
}

export function WidgetHost({
  node,
  context,
  registry,
  onRefresh,
  data = {},
  onWidgetEvent,
}: {
  node: WidgetNode;
  context: WidgetContext;
  registry: WidgetRegistry;
  onRefresh?: () => void;
  data?: Record<string, unknown>;
  onWidgetEvent?: (event: WidgetRuntimeEvent) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const eventRef = useRef(onWidgetEvent);
  eventRef.current = onWidgetEvent;
  const input = resolveWidgetInput(node, data, context);
  const inputSignature = JSON.stringify(input);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [closed, setClosed] = useState(false);
  const adapter = registry[node.widgetId];
  useEffect(() => setClosed(false), [adapter, context.entityId, context.instanceId]);
  useEffect(() => {
    if (closed) return;
    let disposed = false;
    let errored = false;
    let mounted: WidgetMount | undefined;
    setStatus('loading');
    setMessage('');
    if (!adapter || !container.current) {
      setStatus('error');
      setMessage('Виджет не зарегистрирован в хост-приложении');
      return;
    }
    const mountRoot = window.document.createElement('div');
    container.current.append(mountRoot);
    Promise.resolve()
      .then(() =>
        disposed
          ? undefined
          : adapter.mount(
              mountRoot,
              context,
              (event) => {
                if (disposed) return;
                if (event.type === 'dataChanged') refreshRef.current?.();
                else if (event.type === 'error') {
                  errored = true;
                  setMessage(event.message);
                  setStatus('error');
                } else {
                  if (event.type === 'close') setClosed(true);
                  eventRef.current?.(event);
                }
              },
              input,
            ),
      )
      .then((result) => {
        if (!result) return;
        if (disposed) result.unmount();
        else {
          mounted = result;
          if (!errored) setStatus('ready');
        }
      })
      .catch(() => {
        if (!disposed) {
          setStatus('error');
          setMessage('Виджет недоступен. Попробуйте обновить карточку.');
        }
      });
    return () => {
      disposed = true;
      mountRoot.remove();
      if (mounted) queueMicrotask(() => mounted?.unmount());
    };
  }, [
    adapter,
    context.entityId,
    context.entityType,
    context.instanceId,
    context.locale,
    inputSignature,
    closed,
  ]);
  if (closed)
    return (
      <div className="runtime-note">
        Виджет закрыт.{' '}
        <Button size="sm" onClick={() => setClosed(false)}>
          Открыть снова
        </Button>
      </div>
    );
  return (
    <div className="widget-container" style={{ minHeight: node.height }}>
      {status === 'loading' && <p className="runtime-note">Загрузка виджета…</p>}
      {status === 'error' && (
        <div className="block-error" role="alert">
          <AlertCircle size={18} />
          {message}
        </div>
      )}
      <div ref={container} hidden={status === 'error'} />
    </div>
  );
}

function ReadOnlyTable({
  node,
  data,
  selectedNodeId,
  onSelectNode,
}: {
  node: TableNode;
  data: Record<string, unknown>;
  selectedNodeId?: string;
  onSelectNode?: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ binding: string; desc: boolean } | null>(null);
  const source = resolveValue(data, node.source, node.binding);
  const rows = Array.isArray(source)
    ? source.filter(
        (row): row is Record<string, unknown> =>
          row !== null && typeof row === 'object' && !Array.isArray(row),
      )
    : [];
  const invalidRows = Array.isArray(source) ? source.length - rows.length : 0;
  const filtered = useMemo(() => {
    const result = rows.filter(
      (row) =>
        !node.searchable ||
        node.columns.some((column) =>
          displayText(resolveValue(row, column.source, column.binding))
            .toLocaleLowerCase('ru')
            .includes(query.toLocaleLowerCase('ru')),
        ),
    );
    if (sort)
      result.sort((a, b) => {
        const column = node.columns.find((item) => item.id === sort.binding);
        const av = resolveValue(a, column?.source, column?.binding),
          bv = resolveValue(b, column?.source, column?.binding);
        const compared =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : displayText(av).localeCompare(displayText(bv), 'ru', { numeric: true });
        return sort.desc ? -compared : compared;
      });
    return result;
  }, [rows, query, sort, node.columns, node.searchable]);
  const pageSize = Math.max(1, node.pageSize);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const tableData = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize).map((row, index) => {
    const item: { id: string; [key: string]: string | number | object } = { id: String(row.id ?? index) };
    node.columns.forEach((column) => {
      item[`cell_${column.id}`] = { raw: resolveValue(row, column.source, column.binding) };
    });
    return item;
  });
  return (
    <div className="records-table">
      <div className="table-heading">
        <h3>{node.title}</h3>
        <span>{rows.length} записей</span>
      </div>
      {source !== undefined && source !== null && !Array.isArray(source) && (
        <p className="block-error" role="alert">
          Источник таблицы должен содержать список объектов. Проверьте путь к данным.
        </p>
      )}
      {invalidRows > 0 && (
        <p className="runtime-note" role="status">
          Пропущено строк с некорректными данными: {invalidRows}. Каждая строка должна быть объектом.
        </p>
      )}
      {node.searchable && (
        <div className="table-search">
          <Search size={16} />
          <Input
            aria-label={`Поиск: ${node.title}`}
            placeholder="Поиск по записям"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </div>
      )}
      <div className="table-sort">
        <span>Сортировать:</span>
        {node.columns.map((column) => (
          <button
            type="button"
            key={column.id}
            aria-pressed={sort?.binding === column.id}
            onClick={() => {
              setSort({
                binding: column.id,
                desc: sort?.binding === column.id ? !sort.desc : false,
              });
              setPage(0);
            }}
          >
            {column.label}
            {sort?.binding === column.id ? (sort.desc ? ' ↓' : ' ↑') : ''}
          </button>
        ))}
      </div>
      {tableData.length ? (
        <div className="fin-table-scroll">
          <div style={{ minWidth: node.columns.length * 170 }}>
            <Table
              size="s"
              borderVariant="rows"
              data={tableData}
              columns={node.columns.map((column) => ({
                id: `cell_${column.id}`,
                label: column.label,
                width: column.format === 'status' ? 180 : 200,
                enableResizing: true,
                enableEditing: false,
                renderCell: (value: unknown) => (
                  <div
                    {...editorSelection(column.id, column.label, selectedNodeId, onSelectNode)}
                    className={fieldSelectionClass(column.id, selectedNodeId, onSelectNode)}
                  >
                    <FormattedValue value={(value as { raw: unknown }).raw} format={column.format} />
                    <div className="runtime-field-errors">
                      {validateFieldValue(column, (value as { raw: unknown }).raw).map((message) => (
                        <p key={message}>{message}</p>
                      ))}
                    </div>
                  </div>
                ),
              }))}
            />
          </div>
        </div>
      ) : (
        <div className="runtime-empty">
          {query && node.searchable ? 'По вашему запросу ничего не найдено' : 'Связанных записей пока нет'}
        </div>
      )}
      <div className="table-pagination">
        <span>
          {filtered.length
            ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, filtered.length)} из ${filtered.length}`
            : '0 записей'}
        </span>
        <div>
          <IconButton label="Первая страница" disabled={safePage === 0} onClick={() => setPage(0)}>
            <ChevronsLeft size={16} />
          </IconButton>
          <IconButton
            label="Предыдущая страница"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronLeft size={16} />
          </IconButton>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <IconButton
            label="Следующая страница"
            disabled={safePage === pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronRight size={16} />
          </IconButton>
          <IconButton
            label="Последняя страница"
            disabled={safePage === pageCount - 1}
            onClick={() => setPage(pageCount - 1)}
          >
            <ChevronsRight size={16} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

interface RenderContext {
  document: ResolvedSplit;
  registry: WidgetRegistry;
  widgetContext: WidgetContext;
  selectedNodeId?: string;
  onSelectNode?: (id: string) => void;
  onRefresh?: () => void;
  onWidgetEvent?: (event: WidgetRuntimeEvent) => void;
  onOpenWidget?: (intent: OpenWidgetIntent) => void;
  dataIssues: DataValidationIssue[];
  erpTableAdapter?: ErpTableAdapter;
  tableRefreshToken?: number;
}
function FieldDataErrors({
  issues,
  nodeId,
  fieldId,
}: {
  issues: DataValidationIssue[];
  nodeId: string;
  fieldId?: string;
}) {
  const matching = issues.filter((issue) => issue.nodeId === nodeId && issue.fieldId === fieldId);
  return matching.length ? (
    <div className="runtime-field-errors" role="status">
      {[...new Set(matching.map((issue) => issue.message))].map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  ) : null;
}
function ContentBlock({ node, context }: { node: ContentNode; context: RenderContext }) {
  const [accordionKey] = useState(() => ++nextAccordionKey);
  const defaultOpen =
    node.type === 'section' ? node.defaultOpen : node.type === 'text' ? !node.collapsible : true;
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  const data = context.document.data;
  const error = context.document.errors.find((item) => item.nodeId === node.id);
  if (!isVisible(node.visibleWhen, data))
    return context.onSelectNode ? (
      <button className="hidden-block" onClick={() => context.onSelectNode?.(node.id)} type="button">
        {node.title || 'Блок'} скрыт условием
      </button>
    ) : null;
  let content: ReactNode;
  if (error)
    content = (
      <div className="block-error" role="alert">
        <AlertCircle size={18} />
        <div>
          <strong>{node.title}</strong>
          <p>{error.message}</p>
          {context.onRefresh && (
            <Button size="sm" variant="ghost" onClick={context.onRefresh}>
              Повторить загрузку
            </Button>
          )}
        </div>
      </div>
    );
  else
    switch (node.type) {
      case 'fields':
        content = (
          <>
            {node.title && <h3 className="block-heading">{node.title}</h3>}
            <dl className="field-grid" style={{ '--columns': node.columns } as CSSProperties}>
              {node.fields.map((field) => (
                <div
                  key={field.id}
                  {...editorSelection(field.id, field.label, context.selectedNodeId, context.onSelectNode)}
                  className={`detail-field ${fieldSelectionClass(field.id, context.selectedNodeId, context.onSelectNode)}`}
                >
                  <dt>{field.label}</dt>
                  <dd>
                    <FormattedValue
                      value={resolveValue(data, field.source, field.binding)}
                      format={field.format}
                    />
                    <FieldDataErrors issues={context.dataIssues} nodeId={node.id} fieldId={field.id} />
                  </dd>
                </div>
              ))}
            </dl>
          </>
        );
        break;
      case 'section': {
        const children = node.children.map((child) => (
          <ContentBlock key={child.id} node={child} context={context} />
        ));
        content = node.collapsible ? (
          <Accordion size="s" view="clear">
            <AccordionItem
              eventKey={accordionKey}
              title={node.title}
              opened={open}
              onClick={() => setOpen((value) => !value)}
              defaultIconContent="chevron"
              defaultIconPlacement="left"
              bodyProps={{
                // Hidden tabs have zero offsetWidth during FinAI's initial measurement.
                // This adapter always uses the same chevron; derive its indent from the
                // kit's own icon and gap tokens without a mount-time DOM measurement.
                style: {
                  paddingLeft:
                    'calc(var(--plasma-accordion-item-icon-size, 1rem) + var(--plasma-accordion-item-gap, 0.375rem))',
                },
              }}
            >
              <div className="section-content">{children}</div>
            </AccordionItem>
          </Accordion>
        ) : (
          <>
            <h3 className="block-heading">{node.title}</h3>
            <div className="section-content">{children}</div>
          </>
        );
        break;
      }
      case 'text':
        content = (
          <>
            {node.title && <h3 className="block-heading">{node.title}</h3>}
            <div className={`description-content ${node.collapsible && !open ? 'is-clamped' : ''}`}>
              {displayText(resolveValue(data, node.source, node.binding))}
            </div>
            {node.collapsible && (
              <button className="text-toggle" type="button" onClick={() => setOpen((value) => !value)}>
                {open ? 'Свернуть описание' : 'Развернуть описание'}
              </button>
            )}
          </>
        );
        break;
      case 'table':
        content = (
          <ReadOnlyTable
            node={node}
            data={data}
            selectedNodeId={context.selectedNodeId}
            onSelectNode={context.onSelectNode}
          />
        );
        break;
      case 'erpTable':
        content = (
          <>
            <h3 className="block-heading">{node.title}</h3>
            <ErpTableHost
              node={node}
              data={data}
              context={context.widgetContext}
              adapter={context.erpTableAdapter}
              refreshToken={context.tableRefreshToken}
              onEvent={(event) => {
                if (event.type === 'dataChanged') context.onRefresh?.();
                else context.onWidgetEvent?.(event);
              }}
            />
          </>
        );
        break;
      case 'badge':
      case 'avatar':
      case 'image':
      case 'progress':
      case 'divider':
        content = <DisplayBlock node={node} data={data} />;
        break;
      case 'widget':
        content = (
          <>
            <div className="block-widget-heading">
              <h3 className="block-heading">{node.title}</h3>
              <span>
                <Puzzle size={13} />
                Виджет
              </span>
            </div>
            <WidgetHost
              node={node}
              context={context.widgetContext}
              registry={context.registry}
              onRefresh={context.onRefresh}
              data={data}
              onWidgetEvent={context.onWidgetEvent}
            />
          </>
        );
        break;
      case 'callout':
      case 'metrics':
      case 'recordList':
      case 'documents':
        content = (
          <RichBlock
            node={node}
            data={data}
            widgetContext={context.widgetContext}
            onOpenWidget={context.onOpenWidget}
            dataIssues={context.dataIssues}
            selectedNodeId={context.selectedNodeId}
            onSelectNode={context.onSelectNode}
            renderValue={(value, format) => <FormattedValue value={value} format={format} />}
          />
        );
        break;
      default:
        content = <div className="block-error">Этот блок не поддерживается текущим клиентом</div>;
    }
  return (
    <EditorNodeFrame nodeId={node.id} label={node.title}>
      <section
        data-node-id={node.id}
        className={`runtime-block runtime-${node.type} ${context.selectedNodeId === node.id ? 'is-selected' : ''} ${context.onSelectNode ? 'can-select' : ''}`}
        onClick={
          context.onSelectNode
            ? (event) => {
                event.stopPropagation();
                context.onSelectNode?.(node.id);
              }
            : undefined
        }
      >
        <BlockBoundary resetKey={JSON.stringify(node)}>{content}</BlockBoundary>
      </section>
    </EditorNodeFrame>
  );
}

export interface SplitViewProps {
  document: ResolvedSplit;
  registry?: WidgetRegistry;
  selectedNodeId?: string;
  onSelectNode?: (id: string) => void;
  onClose?: () => void;
  onRefresh?: () => void;
  onOpenWidget?: (intent: OpenWidgetIntent) => void;
  onWidgetEvent?: (event: WidgetRuntimeEvent) => void;
  actionHandlers?: HostActionRegistry;
  actionDescriptors?: HostActionDescriptor[];
  floating?: boolean;
  previewWidth?: number;
  erpTableAdapter?: ErpTableAdapter;
  tableRefreshToken?: number;
}
function includesNode(nodes: ContentNode[], id: string): boolean {
  return nodes.some(
    (node) =>
      node.id === id ||
      ((node.type === 'fields' || node.type === 'recordList') &&
        node.fields.some((field) => field.id === id)) ||
      (node.type === 'metrics' && node.items.some((field) => field.id === id)) ||
      (node.type === 'table' && node.columns.some((field) => field.id === id)) ||
      (node.type === 'section' && includesNode(node.children, id)),
  );
}
export function SplitView({
  document: doc,
  registry = demoWidgetRegistry,
  selectedNodeId,
  onSelectNode,
  onClose,
  onRefresh,
  onOpenWidget,
  onWidgetEvent,
  actionHandlers,
  actionDescriptors,
  floating = false,
  previewWidth,
  erpTableAdapter,
  tableRefreshToken,
}: SplitViewProps) {
  const panelPrefix = useId();
  const [activeTab, setActiveTab] = useState(doc.definition.tabs[0]?.id ?? '');
  const [fullscreen, setFullscreen] = useState(false);
  const [width, setWidth] = useState(doc.definition.shell.defaultWidth);
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  const scrollPositions = useRef(new Map<string, number>());
  const tabs = doc.definition.tabs;
  const tabIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTab),
  );
  const currentTab = tabs[tabIndex];
  useEffect(() => {
    if (selectedNodeId) {
      const tab = tabs.find((item) => item.id === selectedNodeId || includesNode(item.nodes, selectedNodeId));
      if (tab) setActiveTab(tab.id);
    }
  }, [selectedNodeId, tabs]);
  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) setActiveTab(tabs[0]?.id ?? '');
  }, [tabs, activeTab]);
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = scrollPositions.current.get(activeTab) ?? 0;
  }, [activeTab]);
  useLayoutEffect(() => {
    if (!onSelectNode || !selectedNodeId || !root.current || !body.current) return;
    const selected = Array.from(
      root.current.querySelectorAll<HTMLElement>('[data-node-id],[data-field-id]'),
    ).find(
      (element) => element.dataset.nodeId === selectedNodeId || element.dataset.fieldId === selectedNodeId,
    );
    // A selection can switch tabs or await the server preview. Scroll only after its DOM is visible.
    if (selected && body.current.contains(selected) && selected.getClientRects().length)
      selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedNodeId, activeTab, doc.definition, onSelectNode]);
  useEffect(() => {
    if (!fullscreen) return;
    priorFocus.current = window.document.activeElement as HTMLElement;
    const oldOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    root.current?.focus();
    return () => {
      window.document.body.style.overflow = oldOverflow;
      priorFocus.current?.focus();
    };
  }, [fullscreen]);
  const widgetContext = useMemo(
    () => ({
      entityId: doc.entityId,
      entityType: doc.definition.entityType,
      instanceId: doc.instanceId,
      locale: 'ru-RU',
    }),
    [doc.entityId, doc.definition.entityType, doc.instanceId],
  );
  const dataIssues = useMemo(
    () => validateResolvedData(doc.definition, doc.data, widgetContext),
    [doc.definition, doc.data, widgetContext],
  );
  const context: RenderContext = {
    document: doc,
    registry,
    widgetContext,
    selectedNodeId,
    onSelectNode,
    onRefresh,
    onWidgetEvent,
    onOpenWidget,
    dataIssues,
    erpTableAdapter,
    tableRefreshToken,
  };
  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = root.current?.getBoundingClientRect().width ?? width;
    handle.setPointerCapture(event.pointerId);
    const onMove = (next: PointerEvent) => {
      const max = Math.max(
        doc.definition.shell.minWidth,
        (window.innerWidth * doc.definition.shell.maxWidthPercent) / 100,
      );
      setWidth(
        Math.max(
          Math.min(doc.definition.shell.minWidth, window.innerWidth - 32),
          Math.min(max, startWidth + startX - next.clientX),
        ),
      );
    };
    const stop = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('lostpointercapture', stop);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('lostpointercapture', stop);
  };
  const handleKeys = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (fullscreen) {
        event.preventDefault();
        event.stopPropagation();
        setFullscreen(false);
      } else if (floating) onClose?.();
    }
    if (fullscreen && event.key === 'Tab') {
      const nodes = Array.from(
        root.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,[tabindex="0"]',
        ) || [],
      ).filter((element) => element.offsetParent !== null);
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (!first) return;
      if (
        event.shiftKey &&
        (window.document.activeElement === first || window.document.activeElement === root.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && window.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  return (
    <>
      {fullscreen && <div className="split-overlay" />}
      <div
        ref={root}
        tabIndex={-1}
        role={fullscreen ? 'dialog' : undefined}
        aria-modal={fullscreen || undefined}
        aria-label="Карточка объекта"
        className={`split-view ${fullscreen ? 'is-fullscreen' : ''} ${floating ? 'is-floating' : ''}`}
        style={
          !fullscreen
            ? {
                width: previewWidth || (floating ? width : '100%'),
                maxWidth: floating ? `${doc.definition.shell.maxWidthPercent}vw` : '100%',
              }
            : undefined
        }
        onKeyDown={handleKeys}
      >
        {floating && !fullscreen && (
          <div
            className="split-resizer"
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}
            aria-label="Ширина сплита: стрелки для изменения, Enter для сброса"
            aria-valuenow={width}
            aria-valuemin={doc.definition.shell.minWidth}
            aria-valuemax={Math.round((window.innerWidth * doc.definition.shell.maxWidthPercent) / 100)}
            onPointerDown={resize}
            onDoubleClick={() => setWidth(doc.definition.shell.defaultWidth)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setWidth(doc.definition.shell.defaultWidth);
              if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
                event.preventDefault();
                setWidth((current) =>
                  Math.max(
                    Math.min(doc.definition.shell.minWidth, window.innerWidth - 32),
                    Math.min(
                      (window.innerWidth * doc.definition.shell.maxWidthPercent) / 100,
                      current + (event.key === 'ArrowLeft' ? 24 : -24),
                    ),
                  ),
                );
              }
            }}
          />
        )}
        <header
          className={`split-header ${onSelectNode ? 'can-select' : ''} ${selectedNodeId === '$header' ? 'is-selected' : ''}`}
          onClick={() => onSelectNode?.('$header')}
        >
          <div className="split-title">
            <h2>
              {displayText(
                resolveValue(doc.data, doc.definition.header.titleSource, doc.definition.header.titleBinding),
              )}
            </h2>
            <p>
              {displayText(
                resolveValue(
                  doc.data,
                  doc.definition.header.subtitleSource,
                  doc.definition.header.subtitleBinding,
                ),
              )}
            </p>
            <FieldDataErrors issues={dataIssues} nodeId="$header" />
            {doc.definition.header.showStatus && (
              <FormattedValue
                value={resolveValue(
                  doc.data,
                  doc.definition.header.statusSource,
                  doc.definition.header.statusBinding,
                )}
                format="status"
              />
            )}
            {!!doc.definition.header.fields?.length && (
              <dl className="field-grid header-meta" style={{ '--columns': 3 } as CSSProperties}>
                {doc.definition.header.fields.map((field) => (
                  <div
                    key={field.id}
                    {...editorSelection(field.id, field.label, selectedNodeId, onSelectNode)}
                    className={`detail-field ${fieldSelectionClass(field.id, selectedNodeId, onSelectNode)}`}
                  >
                    <dt>{field.label}</dt>
                    <dd>
                      <FormattedValue
                        value={resolveValue(doc.data, field.source, field.binding)}
                        format={field.format}
                      />
                      <FieldDataErrors issues={dataIssues} nodeId="$header" fieldId={field.id} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div className="split-controls">
            <ActionMenu
              actions={getHeaderActions(doc.definition)}
              context={widgetContext}
              data={doc.data}
              onOpenWidget={onOpenWidget}
              placement="header"
            />
            {onRefresh && (
              <IconButton
                label="Обновить данные карточки"
                onClick={(event) => {
                  event.stopPropagation();
                  onRefresh();
                }}
              >
                <RefreshCw size={16} />
              </IconButton>
            )}
            <IconButton
              label={fullscreen ? 'Выйти из полноэкранного режима' : 'Развернуть сплит'}
              onClick={(event) => {
                event.stopPropagation();
                setFullscreen((current) => !current);
              }}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </IconButton>
            <IconButton
              label="Закрыть сплит"
              onClick={(event) => {
                event.stopPropagation();
                onClose?.();
              }}
            >
              <X size={17} />
            </IconButton>
          </div>
        </header>
        <nav className="split-tabbar" aria-label="Разделы карточки">
          <Tabs size="s" view="filled" index={tabIndex} hasDivider={false}>
            {tabs.map((tab) => (
              <TabItem
                key={tab.id}
                size="s"
                view="secondary"
                isActive={currentTab?.id === tab.id}
                aria-selected={currentTab?.id === tab.id}
                aria-controls={`${panelPrefix}-panel-${tab.id}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  onSelectNode?.(tab.id);
                }}
              >
                {tab.title}
              </TabItem>
            ))}
          </Tabs>
        </nav>
        <div
          className="split-body"
          ref={body}
          onScroll={(event) => scrollPositions.current.set(activeTab, event.currentTarget.scrollTop)}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              id={`${panelPrefix}-panel-${tab.id}`}
              role="tabpanel"
              aria-label={tab.title}
              hidden={tab.id !== currentTab?.id}
            >
              {tab.nodes.length ? (
                tab.nodes.map((node) => <ContentBlock key={node.id} node={node} context={context} />)
              ) : (
                <div className="runtime-empty">
                  В этом разделе пока нет блоков
                  {onSelectNode && <span>Выберите «Добавить блок» в структуре слева</span>}
                </div>
              )}
              <EditorContainerDrop containerId={tab.id} label={`В конец вкладки «${tab.title}»`} />
            </div>
          ))}
        </div>
        {doc.definition.footer.show && (
          <footer
            className={`split-footer ${selectedNodeId === '$footer' ? 'is-selected' : ''}`}
            onClick={() => onSelectNode?.('$footer')}
          >
            <span>{doc.definition.footer.text}</span>
            <div className="split-footer-actions">
              <FooterButtons
                buttons={doc.definition.footer.buttons ?? []}
                context={widgetContext}
                data={doc.data}
                actionHandlers={actionHandlers}
                actionDescriptors={actionDescriptors}
                onOpenWidget={onOpenWidget}
                onRefresh={onRefresh}
                onClose={onClose}
              />
              <ActionMenu
                actions={getFooterActions(doc.definition)}
                context={widgetContext}
                data={doc.data}
                onOpenWidget={onOpenWidget}
                placement="footer"
              />
            </div>
          </footer>
        )}
      </div>
    </>
  );
}
