import type { CSSProperties, ReactNode } from 'react';
import { Badge } from '@salutejs/sdds-finai';
import { AlertCircle, ArrowUpRight, CheckCircle2, FileText, Info, TriangleAlert } from 'lucide-react';
import type {
  CalloutNode,
  DataValidationIssue,
  DocumentsNode,
  FieldDefinition,
  FieldFormat,
  MetricsNode,
  OpenWidgetIntent,
  RecordListNode,
  WidgetContext,
} from '../../shared/model';
import { resolveValue, resolveWidgetInput } from '../../shared/values';
import { Button } from '../ui';
import { displayText, safeHref } from './bindings';
import './RichBlocks.css';

export type RichContentNode = CalloutNode | MetricsNode | RecordListNode | DocumentsNode;
export interface RichBlockProps {
  node: RichContentNode;
  data: Record<string, unknown>;
  widgetContext: WidgetContext;
  onOpenWidget?: (intent: OpenWidgetIntent) => void;
  dataIssues?: DataValidationIssue[];
  renderValue?: (value: unknown, format: FieldFormat) => ReactNode;
}

function messages(issues: DataValidationIssue[], nodeId: string, fieldId?: string, itemIndex?: number) {
  return issues.filter(
    (issue) => issue.nodeId === nodeId && issue.fieldId === fieldId && issue.itemIndex === itemIndex,
  );
}
function Errors({ issues }: { issues: DataValidationIssue[] }) {
  return issues.length > 0 ? (
    <div className="rich-data-errors" role="status">
      {[...new Set(issues.map((issue) => issue.message))].map((message) => (
        <p key={message}>
          <AlertCircle size={13} aria-hidden="true" />
          {message}
        </p>
      ))}
    </div>
  ) : null;
}
function rowsOf(value: unknown): { row: Record<string, unknown>; index: number }[] {
  return Array.isArray(value)
    ? value.flatMap((row, index) =>
        row && typeof row === 'object' && !Array.isArray(row)
          ? [{ row: row as Record<string, unknown>, index }]
          : [],
      )
    : [];
}
function sourceErrors(value: unknown, rows: unknown[]) {
  if (value !== undefined && value !== null && !Array.isArray(value))
    return 'Проверьте источник: нужен список объектов.';
  if (Array.isArray(value) && value.length !== rows.length)
    return `Пропущено записей с некорректными данными: ${value.length - rows.length}. Каждая запись должна быть объектом.`;
  return '';
}
function bytesText(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return displayText(value);
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  const unit = value === 0 ? 0 : Math.min(3, Math.floor(Math.log(value) / Math.log(1024)));
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value / 1024 ** unit)} ${units[unit]}`;
}
function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

/** Semantic read-only blocks use the same source rules and host widget intents as the main renderer. */
export function RichBlock({
  node,
  data,
  widgetContext,
  onOpenWidget,
  dataIssues = [],
  renderValue = (value) => displayText(value),
}: RichBlockProps) {
  const fieldValue = (field: FieldDefinition, scope: Record<string, unknown>, itemIndex?: number) => {
    const issues = messages(dataIssues, node.id, field.id, itemIndex);
    return (
      <div className={`detail-field ${issues.length ? 'rich-field-invalid' : ''}`} key={field.id}>
        <dt>
          {field.label}
          {field.validation?.required && (
            <span className="rich-required" aria-label="обязательное поле">
              {' '}
              *
            </span>
          )}
        </dt>
        <dd>
          {renderValue(resolveValue(scope, field.source, field.binding), field.format)}
          <Errors issues={issues} />
        </dd>
      </div>
    );
  };
  if (node.type === 'callout') {
    const Icon = { info: Info, success: CheckCircle2, warning: TriangleAlert, error: AlertCircle }[node.tone];
    return (
      <div
        className={`rich-callout rich-callout--${node.tone}`}
        role={node.tone === 'error' ? 'alert' : 'note'}
      >
        <Icon size={18} aria-hidden="true" />
        <div>
          <h3>{node.title}</h3>
          <div className="rich-callout-message">
            {displayText(resolveValue(data, node.source, node.binding))}
          </div>
          <Errors issues={messages(dataIssues, node.id)} />
        </div>
      </div>
    );
  }
  if (node.type === 'metrics')
    return (
      <div className="rich-metrics">
        <h3 className="block-heading">{node.title}</h3>
        <dl
          className={`rich-metrics-grid rich-metrics-columns-${node.columns}`}
          style={{ '--rich-columns': node.columns } as CSSProperties}
        >
          {node.items.map((field) => (
            <div key={field.id} className="rich-metric">
              <dt>{field.label}</dt>
              <dd>
                <span className="rich-metric-value">
                  {renderValue(resolveValue(data, field.source, field.binding), field.format)}
                </span>
                {field.suffix && <span className="rich-metric-suffix">{field.suffix}</span>}
                <Errors issues={messages(dataIssues, node.id, field.id)} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );

  const source = resolveValue(data, node.source, node.binding);
  const rows = rowsOf(source);
  const shapeError = sourceErrors(source, rows);
  const listIssues = messages(dataIssues, node.id);
  if (node.type === 'recordList')
    return (
      <div className="rich-record-list">
        <h3 className="block-heading">{node.title}</h3>
        {shapeError && listIssues.length === 0 && (
          <p className="runtime-note" role="status">
            {shapeError}
          </p>
        )}
        <Errors issues={listIssues} />
        {!rows.length && <p className="runtime-empty">Записей пока нет</p>}
        {rows.map(({ row, index }) => {
          const title = displayText(resolveValue(row, node.itemTitle));
          const subtitle = resolveValue(row, node.itemSubtitle);
          const href = safeHref(resolveValue(row, node.itemHref));
          return (
            <article className="rich-record" key={`${String(row.id ?? 'record')}-${index}`}>
              <header className="rich-record-heading">
                <h4>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rich-record-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {title}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                  ) : (
                    title
                  )}
                </h4>
                {hasValue(subtitle) && <p>{displayText(subtitle)}</p>}
                <Errors issues={messages(dataIssues, node.id, undefined, index)} />
              </header>
              <dl
                className="field-grid rich-record-fields"
                style={{ '--columns': node.columns } as CSSProperties}
              >
                {node.fields.map((field) => fieldValue(field, row, index))}
              </dl>
            </article>
          );
        })}
      </div>
    );

  return (
    <div className="rich-documents">
      <h3 className="block-heading">{node.title}</h3>
      {shapeError && listIssues.length === 0 && (
        <p className="runtime-note" role="status">
          {shapeError}
        </p>
      )}
      <Errors issues={listIssues} />
      {!rows.length && <p className="runtime-empty">Документов пока нет</p>}
      <ul className="rich-document-list">
        {rows.map(({ row, index }) => {
          const title = displayText(resolveValue(row, node.itemTitle));
          const description = resolveValue(row, node.itemDescription);
          const status = resolveValue(row, node.itemStatus);
          const size = resolveValue(row, node.itemSize);
          const href = safeHref(resolveValue(row, node.itemHref));
          const rowIssues = messages(dataIssues, node.id, undefined, index);
          return (
            <li className="rich-document" key={`${String(row.id ?? 'document')}-${index}`}>
              <FileText size={20} aria-hidden="true" className="rich-document-icon" />
              <div className="rich-document-content">
                {hasValue(status) && (
                  <div className="rich-document-status">
                    <Badge size="xs" view="accent" text={displayText(status)} transparent />
                  </div>
                )}
                {node.action ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rich-document-button"
                    disabled={!onOpenWidget}
                    title={!onOpenWidget ? 'Хост не подключил открытие виджета' : undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!node.action) return;
                      onOpenWidget?.({
                        type: 'openWidget',
                        widgetId: node.action.widgetId,
                        context: widgetContext,
                        correlationId: crypto.randomUUID(),
                        input: resolveWidgetInput(node.action, { ...data, $item: row }, widgetContext),
                      });
                    }}
                  >
                    {title}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Button>
                ) : href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rich-document-title"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {title}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                ) : (
                  <span className="rich-document-title">{title}</span>
                )}
                {hasValue(description) && (
                  <p className="rich-document-description">{displayText(description)}</p>
                )}
                {hasValue(size) && <p className="rich-document-size">{bytesText(size)}</p>}
                <Errors issues={rowIssues} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
