import type {
  ContentNode,
  DataValidationIssue,
  FieldDefinition,
  FieldFormat,
  SplitTemplate,
  ValueSource,
} from './model';
import { readPath, resolveBindingPath, resolveValue } from './values';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && !value.trim()) ||
  (Array.isArray(value) && value.length === 0);

export function isValidDataHref(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (/^\/(?!\/)/.test(value) && !value.includes('\\')) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isValidDateValue(value: unknown): boolean {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)
  )
    return false;
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10));
  const days = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  if (month < 1 || month > 12 || day < 1 || day > days) return false;
  return !Number.isNaN(new Date(value).getTime());
}

/** Type and business constraints are shared by literal authoring and resolved-data checks. */
export function validateFieldValue(
  field: Pick<FieldDefinition, 'format' | 'validation'>,
  value: unknown,
): string[] {
  const result: string[] = [];
  const rules = field.validation;
  if (isEmpty(value)) return rules?.required ? ['Заполните обязательное значение.'] : [];
  if (field.format === 'number' || field.format === 'money') {
    if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value)))
      return ['Ожидается конечное число, например 1250.5.'];
    if (rules?.min !== undefined && Number(value) < rules.min)
      result.push(`Значение должно быть не меньше ${rules.min}.`);
    if (rules?.max !== undefined && Number(value) > rules.max)
      result.push(`Значение должно быть не больше ${rules.max}.`);
  } else if (field.format === 'date' && !isValidDateValue(value)) {
    result.push('Ожидается существующая дата в формате ГГГГ-ММ-ДД или ISO дата со временем.');
  } else if (field.format === 'link') {
    const href = isRecord(value) ? value.href : value;
    if (!isValidDataHref(href)) result.push('Укажите HTTP/HTTPS ссылку или путь, начинающийся с одного /.');
  } else if (
    ['person', 'status'].includes(field.format) &&
    typeof value !== 'string' &&
    !(isRecord(value) && typeof (value.label ?? value.name) === 'string')
  ) {
    result.push('Ожидается текст или объект с текстовым name / label.');
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (rules?.minLength !== undefined && length < rules.minLength)
      result.push(`Введите не меньше ${rules.minLength} символов.`);
    if (rules?.maxLength !== undefined && length > rules.maxLength)
      result.push(`Допустимо не больше ${rules.maxLength} символов.`);
  }
  return result;
}

/** Checks each visible value while leaving the remaining card usable. */
export function validateResolvedData(
  definition: SplitTemplate,
  data: Record<string, unknown>,
): DataValidationIssue[] {
  const issues: DataValidationIssue[] = [];
  const dataPath = (source?: ValueSource, legacy?: string, prefix?: string) => {
    if (source?.kind === 'literal') return undefined;
    const value = source?.path ?? legacy;
    if (!value) return undefined;
    return prefix ? `${prefix}.${value}` : resolveBindingPath(data, value);
  };
  const add = (
    nodeId: string,
    path: string,
    message: string,
    fieldId?: string,
    itemIndex?: number,
    valuePath?: string,
  ) =>
    issues.push({
      nodeId,
      path,
      message,
      ...(fieldId ? { fieldId } : {}),
      ...(itemIndex === undefined ? {} : { itemIndex }),
      ...(valuePath ? { dataPath: valuePath } : {}),
    });
  const fields = (
    values: FieldDefinition[],
    scope: unknown,
    nodeId: string,
    path: string,
    itemIndex?: number,
    prefix?: string,
  ) =>
    values.forEach((field, i) =>
      validateFieldValue(field, resolveValue(scope, field.source, field.binding)).forEach((message) =>
        add(
          nodeId,
          `${path}[${i}]`,
          `${field.label}: ${message}`,
          field.id,
          itemIndex,
          itemIndex !== undefined && !prefix ? undefined : dataPath(field.source, field.binding, prefix),
        ),
      ),
    );
  const visible = (node: ContentNode) => {
    if (!node.visibleWhen) return true;
    const value = readPath(data, node.visibleWhen.binding);
    return node.visibleWhen.operator === 'notEmpty'
      ? !isEmpty(value)
      : String(value ?? '') === node.visibleWhen.value;
  };
  const sourceField = (
    nodeId: string,
    scope: unknown,
    source: ValueSource | undefined,
    path: string,
    format: FieldFormat,
    itemIndex?: number,
    prefix?: string,
  ) => {
    if (!source) return;
    validateFieldValue(
      {
        format,
        validation: path.endsWith('.itemTitle')
          ? { required: true }
          : path.endsWith('.itemSize')
            ? { min: 0 }
            : undefined,
      },
      resolveValue(scope, source),
    ).forEach((message) =>
      add(
        nodeId,
        path,
        message,
        undefined,
        itemIndex,
        itemIndex !== undefined && !prefix ? undefined : dataPath(source, undefined, prefix),
      ),
    );
  };
  const rows = (node: Extract<ContentNode, { type: 'table' | 'recordList' | 'documents' }>, path: string) => {
    const value = resolveValue(data, node.source, node.binding);
    if (value === undefined || value === null) return;
    if (!Array.isArray(value)) {
      add(
        node.id,
        `${path}.source`,
        'Ожидается список объектов. Проверьте путь к данным.',
        undefined,
        undefined,
        dataPath(node.source, node.binding),
      );
      return;
    }
    const prefix = dataPath(node.source, node.binding);
    value.forEach((row, index) => {
      const rowPath = `${path}.rows[${index}]`;
      const itemPath = prefix ? `${prefix}.${index}` : undefined;
      if (!isRecord(row)) {
        add(node.id, rowPath, 'Строка должна быть объектом.', undefined, index, itemPath);
        return;
      }
      if (node.type === 'table') fields(node.columns, row, node.id, `${rowPath}.columns`, index, itemPath);
      else if (node.type === 'recordList') {
        fields(node.fields, row, node.id, `${rowPath}.fields`, index, itemPath);
        sourceField(node.id, row, node.itemTitle, `${rowPath}.itemTitle`, 'text', index, itemPath);
        sourceField(node.id, row, node.itemHref, `${rowPath}.itemHref`, 'link', index, itemPath);
      } else {
        sourceField(node.id, row, node.itemTitle, `${rowPath}.itemTitle`, 'text', index, itemPath);
        sourceField(node.id, row, node.itemHref, `${rowPath}.itemHref`, 'link', index, itemPath);
        sourceField(node.id, row, node.itemStatus, `${rowPath}.itemStatus`, 'status', index, itemPath);
        sourceField(node.id, row, node.itemSize, `${rowPath}.itemSize`, 'number', index, itemPath);
      }
    });
  };
  const visit = (nodes: ContentNode[], path: string) =>
    nodes.forEach((node, index) => {
      const p = `${path}[${index}]`;
      if (!visible(node)) return;
      if (node.type === 'section') visit(node.children, `${p}.children`);
      else if (node.type === 'fields') fields(node.fields, data, node.id, `${p}.fields`);
      else if (node.type === 'metrics') fields(node.items, data, node.id, `${p}.items`);
      else if (['table', 'recordList', 'documents'].includes(node.type))
        rows(node as Extract<ContentNode, { type: 'table' | 'recordList' | 'documents' }>, p);
    });
  const header = definition.header;
  validateFieldValue(
    { format: 'text', validation: { required: true } },
    resolveValue(data, header.titleSource, header.titleBinding),
  ).forEach((message) =>
    add(
      '$header',
      '$.header.titleSource',
      `Заголовок: ${message}`,
      undefined,
      undefined,
      dataPath(header.titleSource, header.titleBinding),
    ),
  );
  if (header.showStatus)
    validateFieldValue(
      { format: 'status' },
      resolveValue(data, header.statusSource, header.statusBinding),
    ).forEach((message) =>
      add(
        '$header',
        '$.header.statusSource',
        `Статус: ${message}`,
        undefined,
        undefined,
        dataPath(header.statusSource, header.statusBinding),
      ),
    );
  fields(header.fields ?? [], data, '$header', '$.header.fields');
  definition.tabs.forEach((tab, index) => visit(tab.nodes, `$.tabs[${index}].nodes`));
  return issues;
}
