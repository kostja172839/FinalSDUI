import { useState, type CSSProperties, type ReactNode } from 'react';
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
import type { ResolvedComponentOptions } from '../../shared/component-props';
import { resolveFieldProps, type ResolvedFieldProps } from '../../shared/field-props';
import { invokeWithActionPresentation, resolveActionPresentation } from '../../shared/action-presentation';
import { Button } from '../ui';
import { displayText, safeHref } from './bindings';
import './RichBlocks.css';
import { editorSelection, fieldSelectionClass } from './editorSelection';
import { EditorFieldFrame } from '../builder/dragAndDrop';

export type RichContentNode = CalloutNode | MetricsNode | RecordListNode | DocumentsNode;
export interface RichBlockProps {
  node: RichContentNode;
  data: Record<string, unknown>;
  widgetContext: WidgetContext;
  onOpenWidget?: (intent: OpenWidgetIntent) => void;
  dataIssues?: DataValidationIssue[];
  renderValue?: (value: unknown, format: FieldFormat, options?: ResolvedFieldProps) => ReactNode;
  selectedNodeId?: string;
  onSelectNode?: (id: string) => void;
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
  selectedNodeId,
  onSelectNode,
}: RichBlockProps) {
  const [actionError, setActionError] = useState<{ scope: string; message: string }>();
  const options: ResolvedComponentOptions = node as RichContentNode & ResolvedComponentOptions;
  const fieldValue = (field: FieldDefinition, scope: Record<string, unknown>, itemIndex?: number) => {
    const issues = messages(dataIssues, node.id, field.id, itemIndex);
    const fieldScope = { ...scope, $root: data };
    const fieldOptions = {
      emptyText: options.emptyText,
      ...resolveFieldProps(field, fieldScope).props,
    };
    const label = fieldOptions.label ?? field.label;
    return (
      <EditorFieldFrame
        fieldId={field.id}
        label={label}
        {...editorSelection(field.id, label, selectedNodeId, onSelectNode)}
        className={`detail-field field-span-${Math.min(fieldOptions.span ?? 1, node.type === 'recordList' ? node.columns : 1)} ${issues.length ? 'rich-field-invalid' : ''} ${fieldSelectionClass(field.id, selectedNodeId, onSelectNode)}`}
        style={{ textAlign: fieldOptions.align }}
        key={field.id}
      >
        <dt>
          {label}
          {field.validation?.required && (
            <span className="rich-required" aria-label="обязательное поле">
              {' '}
              *
            </span>
          )}
        </dt>
        <dd>
          {renderValue(resolveValue(fieldScope, field.source, field.binding), field.format, {
            ...fieldOptions,
            suffix: undefined,
          })}
          {fieldOptions.suffix && <span className="rich-metric-suffix">{fieldOptions.suffix}</span>}
          <Errors issues={issues} />
        </dd>
      </EditorFieldFrame>
    );
  };
  if (node.type === 'callout') {
    const Icon = { info: Info, success: CheckCircle2, warning: TriangleAlert, error: AlertCircle }[node.tone];
    return (
      <div
        className={`rich-callout rich-callout--${node.tone}`}
        role={node.tone === 'error' ? 'alert' : 'note'}
      >
        {options.showIcon !== false && <Icon size={18} aria-hidden="true" />}
        <div>
          {options.showTitle !== false && <h3>{node.title}</h3>}
          <div className="rich-callout-message">
            {hasValue(resolveValue(data, node.source, node.binding))
              ? displayText(resolveValue(data, node.source, node.binding))
              : (options.emptyText ?? '—')}
          </div>
          <Errors issues={messages(dataIssues, node.id)} />
        </div>
      </div>
    );
  }
  if (node.type === 'metrics')
    return (
      <div className="rich-metrics">
        {options.showTitle !== false && <h3 className="block-heading">{node.title}</h3>}
        <dl
          className={`rich-metrics-grid rich-metrics-columns-${node.columns}`}
          style={{ '--rich-columns': node.columns } as CSSProperties}
        >
          {node.items.map((field) => {
            const fieldOptions = {
              emptyText: options.emptyText,
              ...resolveFieldProps(field, { ...data, $root: data }).props,
            };
            const label = fieldOptions.label ?? field.label;
            const suffix = fieldOptions.suffix ?? field.suffix;
            return (
              <EditorFieldFrame
                key={field.id}
                fieldId={field.id}
                label={label}
                {...editorSelection(field.id, label, selectedNodeId, onSelectNode)}
                className={`rich-metric field-span-${Math.min(fieldOptions.span ?? 1, node.columns)} ${fieldSelectionClass(field.id, selectedNodeId, onSelectNode)}`}
                style={{ textAlign: fieldOptions.align }}
              >
                <dt>{label}</dt>
                <dd>
                  <span className="rich-metric-value">
                    {renderValue(
                      resolveValue({ ...data, $root: data }, field.source, field.binding),
                      field.format,
                      {
                        ...fieldOptions,
                        suffix: undefined,
                      },
                    )}
                  </span>
                  {suffix && <span className="rich-metric-suffix">{suffix}</span>}
                  <Errors issues={messages(dataIssues, node.id, field.id)} />
                </dd>
              </EditorFieldFrame>
            );
          })}
        </dl>
      </div>
    );

  const source = resolveValue(data, node.source, node.binding);
  const allRows = rowsOf(source);
  const rows = options.maxItems === undefined ? allRows : allRows.slice(0, options.maxItems);
  const shapeError = sourceErrors(source, allRows);
  const listIssues = messages(dataIssues, node.id);
  if (node.type === 'recordList')
    return (
      <div className="rich-record-list">
        {options.showTitle !== false && <h3 className="block-heading">{node.title}</h3>}
        {shapeError && listIssues.length === 0 && (
          <p className="runtime-note" role="status">
            {shapeError}
          </p>
        )}
        <Errors issues={listIssues} />
        {!rows.length && <p className="runtime-empty">{options.emptyText ?? 'Записей пока нет'}</p>}
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
                      target={options.linkTarget === 'self' ? '_self' : '_blank'}
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
        {rows.length < allRows.length && (
          <p className="runtime-note">
            Показано {rows.length} из {allRows.length} записей
          </p>
        )}
      </div>
    );

  return (
    <div className="rich-documents">
      {options.showTitle !== false && <h3 className="block-heading">{node.title}</h3>}
      {shapeError && listIssues.length === 0 && (
        <p className="runtime-note" role="status">
          {shapeError}
        </p>
      )}
      <Errors issues={listIssues} />
      {!rows.length && <p className="runtime-empty">{options.emptyText ?? 'Документов пока нет'}</p>}
      <ul className="rich-document-list">
        {rows.map(({ row, index }) => {
          const title = displayText(resolveValue(row, node.itemTitle));
          const description = resolveValue(row, node.itemDescription);
          const status = resolveValue(row, node.itemStatus);
          const size = resolveValue(row, node.itemSize);
          const href = safeHref(resolveValue(row, node.itemHref));
          const rowIssues = messages(dataIssues, node.id, undefined, index);
          const actionScope = { ...data, $item: row };
          const actionEntry = node.action ? { ...node.action, label: title } : undefined;
          const appearance = actionEntry
            ? resolveActionPresentation(actionEntry, actionScope, widgetContext, 'ghost')
            : undefined;
          const actionErrorScope = JSON.stringify([
            node.id,
            widgetContext.entityId,
            widgetContext.instanceId,
            row,
            node.action,
          ]);
          const unavailable =
            appearance?.issues[0]?.message ??
            (appearance?.disabled ? 'Действие сейчас недоступно.' : undefined);
          return (
            <li className="rich-document" key={`${String(row.id ?? 'document')}-${index}`}>
              <FileText size={20} aria-hidden="true" className="rich-document-icon" />
              <div className="rich-document-content">
                {hasValue(status) && (
                  <div className="rich-document-status">
                    <Badge
                      size={(options.statusSize ?? 'xs') as 'xs' | 's' | 'm' | 'l'}
                      view={
                        (options.statusView ?? 'accent') as
                          | 'default'
                          | 'accent'
                          | 'positive'
                          | 'warning'
                          | 'negative'
                          | 'dark'
                          | 'light'
                      }
                      text={displayText(status)}
                      transparent={options.statusTransparent ?? true}
                      pilled={options.statusPilled}
                      clear={options.statusClear}
                    />
                  </div>
                )}
                {node.action && appearance?.visible ? (
                  <Button
                    variant={appearance.variant}
                    size={appearance.size}
                    className="rich-document-button"
                    disabled={!onOpenWidget || appearance.disabled}
                    title={unavailable ?? (!onOpenWidget ? 'Хост не подключил открытие виджета' : undefined)}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!node.action || !actionEntry || !onOpenWidget) return;
                      setActionError(undefined);
                      void invokeWithActionPresentation(actionEntry, actionScope, widgetContext, async () => {
                        await onOpenWidget({
                          type: 'openWidget',
                          widgetId: actionEntry.widgetId,
                          context: widgetContext,
                          correlationId: crypto.randomUUID(),
                          input: resolveWidgetInput(actionEntry, actionScope, widgetContext),
                        });
                      }).catch(() =>
                        setActionError({
                          scope: actionErrorScope,
                          message: 'Не удалось открыть документ. Попробуйте ещё раз.',
                        }),
                      );
                    }}
                  >
                    {appearance.label}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Button>
                ) : !node.action && href ? (
                  <a
                    href={href}
                    target={options.linkTarget === 'self' ? '_self' : '_blank'}
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
                {node.action && appearance?.visible && unavailable && (
                  <p className="runtime-note">{unavailable}</p>
                )}
                {actionError?.scope === actionErrorScope && (
                  <p className="display-value-error" role="alert">
                    {actionError.message}
                  </p>
                )}
                <Errors issues={rowIssues} />
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length < allRows.length && (
        <p className="runtime-note">
          Показано {rows.length} из {allRows.length} документов
        </p>
      )}
    </div>
  );
}
