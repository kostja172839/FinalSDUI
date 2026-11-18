import type {
  ContentNode,
  DataValidationIssue,
  FieldDefinition,
  FieldFormat,
  SplitTemplate,
  ValueSource,
  WidgetContext,
  Catalog,
} from './model';
import { readPath, resolveBindingPath, resolveValue, resolveWidgetInput } from './values';
import { safeErpTableUrl, validateErpTableOptions } from './erp-table-contract';
import { catalog as demoCatalog } from './catalog';
import { validateWidgetInputs } from './widget-input-validation';
import { resolveFieldProps } from './field-props';
import { resolveComponentNode } from './component-props';
import { validateActionPresentation } from './action-presentation';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && !value.trim()) ||
  (Array.isArray(value) && value.length === 0);

export function isValidDataHref(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return false;
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
  context?: WidgetContext,
  catalog: Pick<Catalog, 'widgets'> = demoCatalog,
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
    values.forEach((field, i) => {
      const fieldScope = { ...(isRecord(scope) ? scope : {}), $root: data };
      const fieldPath = (source?: ValueSource, legacy?: string) => {
        if (source?.kind === 'literal') return undefined;
        const path = source?.kind === 'binding' ? source.path : legacy;
        if (path === '$root') return undefined;
        if (path?.startsWith('$root.')) return resolveBindingPath(data, path.slice('$root.'.length));
        return itemIndex !== undefined && !prefix ? undefined : dataPath(source, legacy, prefix);
      };
      validateFieldValue(field, resolveValue(fieldScope, field.source, field.binding)).forEach((message) =>
        add(
          nodeId,
          `${path}[${i}]`,
          `${field.label}: ${message}`,
          field.id,
          itemIndex,
          fieldPath(field.source, field.binding),
        ),
      );
      for (const issue of resolveFieldProps(field, fieldScope).issues)
        add(
          nodeId,
          `${path}[${i}].props${issue.key ? `.${issue.key}` : ''}`,
          `${field.label}: ${issue.message}`,
          field.id,
          itemIndex,
          fieldPath(field.props?.[issue.key]),
        );
    });
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
        for (const issue of validateActionPresentation(
          node.action?.presentation,
          { ...data, $item: row },
          context,
        ))
          add(
            node.id,
            `${path}.action.presentation${issue.key ? `.${issue.key}` : ''}`,
            issue.message,
            undefined,
            index,
          );
      }
    });
  };
  const imageSource = (nodeId: string, source: ValueSource | undefined, path: string) => {
    if (!source) return;
    const value = resolveValue(data, source);
    if (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      (typeof value !== 'string' || !isValidDataHref(value))
    )
      add(
        nodeId,
        path,
        'Для изображения нужна строка с HTTP/HTTPS адресом или путём от /.',
        undefined,
        undefined,
        dataPath(source),
      );
  };
  const visit = (nodes: ContentNode[], path: string) =>
    nodes.forEach((original, index) => {
      const p = `${path}[${index}]`;
      const resolved = resolveComponentNode(original, context ? { ...data, $context: context } : data);
      const node = resolved.node;
      if (!visible(node)) return;
      for (const issue of resolved.issues)
        add(
          node.id,
          `${p}.props${issue.key ? `.${issue.key}` : ''}`,
          issue.message,
          undefined,
          undefined,
          dataPath(original.props?.[issue.key]),
        );
      if (node.type === 'section') visit(node.children, `${p}.children`);
      else if (node.type === 'fields') fields(node.fields, data, node.id, `${p}.fields`);
      else if (node.type === 'metrics') fields(node.items, data, node.id, `${p}.items`);
      else if (node.type === 'widget') {
        const descriptor = catalog.widgets.find((widget) => widget.id === node.widgetId);
        let input: Record<string, unknown>;
        try {
          input = resolveWidgetInput(
            node,
            data,
            context ?? { entityId: '', entityType: definition.entityType, instanceId: '', locale: 'ru-RU' },
          ).data;
        } catch {
          add(node.id, `${p}.props`, 'Параметры виджета должны содержать данные JSON.');
          return;
        }
        for (const issue of validateWidgetInputs(descriptor, input)) {
          const ancestor = Object.entries(node.props ?? {})
            .filter(([name]) => name === issue.name || issue.name.startsWith(`${name}.`))
            .sort(([a], [b]) => b.length - a.length)[0];
          const source = ancestor?.[1];
          // JSON authoring may have no live context yet. Defer only those inputs that need it.
          if (
            !context &&
            source?.kind === 'binding' &&
            (source.path === '$context' || source.path.startsWith('$context.'))
          )
            continue;
          const path = dataPath(source);
          add(
            node.id,
            `${p}.props.${ancestor?.[0] ?? issue.name}`,
            issue.message,
            undefined,
            undefined,
            path && ancestor ? `${path}${issue.name.slice(ancestor[0].length)}` : path,
          );
        }
      } else if (node.type === 'progress') {
        const value = resolveValue(data, node.value);
        const messages =
          Array.isArray(value) || isRecord(value)
            ? ['Ожидается конечное число, например 50.']
            : validateFieldValue({ format: 'number', validation: { min: 0, max: node.max } }, value);
        messages.forEach((message) =>
          add(node.id, `${p}.value`, message, undefined, undefined, dataPath(node.value)),
        );
      } else if (node.type === 'badge' || node.type === 'avatar') {
        const source = node.type === 'badge' ? node.value : node.name;
        const value = resolveValue(data, source);
        if (
          value !== undefined &&
          value !== null &&
          value !== '' &&
          !['string', 'number', 'boolean'].includes(typeof value) &&
          !(isRecord(value) && typeof (value.name ?? value.label) === 'string')
        )
          add(
            node.id,
            `${p}.${node.type === 'badge' ? 'value' : 'name'}`,
            'Ожидается текст, число или объект с name / label.',
            undefined,
            undefined,
            dataPath(source),
          );
        if (node.type === 'avatar') imageSource(node.id, node.src, `${p}.src`);
      } else if (node.type === 'image') {
        imageSource(node.id, node.src, `${p}.src`);
        const alt = resolveValue(data, node.alt);
        if (alt !== null && alt !== undefined && typeof alt !== 'string')
          add(
            node.id,
            `${p}.alt`,
            'Описание изображения должно быть текстом.',
            undefined,
            undefined,
            dataPath(node.alt),
          );
      } else if (node.type === 'erpTable') {
        const usesContext = (source: ValueSource) =>
          source.kind === 'binding' && source.path.startsWith('$context.');
        if (
          (context || !usesContext(node.tableUrl)) &&
          !safeErpTableUrl(resolveValue(context ? { ...data, $context: context } : data, node.tableUrl))
        )
          add(
            node.id,
            `${p}.tableUrl`,
            'Укажите URL таблицы: путь /api/... или HTTP/HTTPS адрес.',
            undefined,
            undefined,
            dataPath(node.tableUrl),
          );
        const props = context
          ? node.props
          : Object.fromEntries(Object.entries(node.props ?? {}).filter(([, source]) => !usesContext(source)));
        const params = resolveWidgetInput(
          { props },
          data,
          context ?? { entityId: '', entityType: definition.entityType, instanceId: '', locale: 'ru-RU' },
        ).data;
        for (const issue of validateErpTableOptions({ ...node.options, ...params }))
          add(
            node.id,
            `${p}.${node.props && Object.hasOwn(params, issue.path.split('.')[0]) ? 'props' : 'options'}${issue.path ? `.${issue.path}` : ''}`,
            issue.message,
          );
      } else if (['table', 'recordList', 'documents'].includes(node.type))
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
  for (const [location, actions] of [
    ['header', definition.header.actions],
    ['footer', definition.footer.actions],
  ] as const)
    actions?.forEach((action, index) => {
      for (const issue of validateActionPresentation(action.presentation, data, context))
        add(
          location === 'header' ? '$header' : '$footer',
          `$.${location}.actions[${index}].presentation${issue.key ? `.${issue.key}` : ''}`,
          issue.message,
          undefined,
          undefined,
          dataPath(action.presentation?.[issue.key]),
        );
    });
  definition.footer.buttons?.forEach((button, index) => {
    for (const issue of validateActionPresentation(button.presentation, data, context))
      add(
        '$footer',
        `$.footer.buttons[${index}].presentation${issue.key ? `.${issue.key}` : ''}`,
        issue.message,
        undefined,
        undefined,
        dataPath(button.presentation?.[issue.key]),
      );
  });
  definition.tabs.forEach((tab, index) => visit(tab.nodes, `$.tabs[${index}].nodes`));
  return issues;
}
