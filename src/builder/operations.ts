import type { Catalog, ContentNode, FieldDefinition, SplitTemplate, TabDefinition } from '../../shared/model';

export function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11)}`;
}

export function locateNode(
  definition: SplitTemplate,
  id: string,
):
  | {
      node: ContentNode;
      siblings: ContentNode[];
      index: number;
      tab: TabDefinition;
      path: string;
      containerId: string;
    }
  | undefined {
  for (const [tabIndex, tab] of definition.tabs.entries()) {
    const walk = (nodes: ContentNode[], path: string, containerId: string): ReturnType<typeof locateNode> => {
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        if (node.id === id)
          return { node, siblings: nodes, index, tab, path: `${path}[${index}]`, containerId };
        if (node.type === 'section') {
          const result = walk(node.children, `${path}[${index}].children`, node.id);
          if (result) return result;
        }
      }
      return undefined;
    };
    const result = walk(tab.nodes, `$.tabs[${tabIndex}].nodes`, tab.id);
    if (result) return result;
  }
  return undefined;
}

export function changeDefinition(
  definition: SplitTemplate,
  change: (copy: SplitTemplate) => void,
): SplitTemplate {
  const copy = structuredClone(definition);
  change(copy);
  return copy;
}

export interface FieldLocation {
  field: FieldDefinition;
  fields: FieldDefinition[];
  index: number;
  ownerId: string;
  node?: ContentNode;
  tab?: TabDefinition;
  path: string;
  collection: 'fields' | 'items' | 'columns';
}
export function locateField(definition: SplitTemplate, id: string): FieldLocation | undefined {
  const headerIndex = definition.header.fields?.findIndex((field) => field.id === id) ?? -1;
  if (headerIndex >= 0)
    return {
      field: definition.header.fields![headerIndex],
      fields: definition.header.fields!,
      index: headerIndex,
      ownerId: '$header',
      path: `$.header.fields[${headerIndex}]`,
      collection: 'fields',
    };
  for (const tab of definition.tabs) {
    const walk = (nodes: ContentNode[]): FieldLocation | undefined => {
      for (const node of nodes) {
        const collection =
          node.type === 'fields' || node.type === 'recordList'
            ? 'fields'
            : node.type === 'metrics'
              ? 'items'
              : node.type === 'table'
                ? 'columns'
                : undefined;
        if (collection) {
          const fields = (node as unknown as Record<string, FieldDefinition[]>)[collection];
          const index = fields.findIndex((field) => field.id === id);
          if (index >= 0)
            return {
              field: fields[index],
              fields,
              index,
              ownerId: node.id,
              node,
              tab,
              path: `${locateNode(definition, node.id)!.path}.${collection}[${index}]`,
              collection,
            };
        }
        if (node.type === 'section') {
          const found = walk(node.children);
          if (found) return found;
        }
      }
    };
    const found = walk(tab.nodes);
    if (found) return found;
  }
}
export interface NodeDropTarget {
  containerId: string;
  index: number;
}
export interface FieldDropTarget {
  kind: 'field';
  ownerId: string;
  index: number;
}
export type EditorDropTarget = NodeDropTarget | FieldDropTarget;
export const isFieldDropTarget = (target: EditorDropTarget): target is FieldDropTarget =>
  'kind' in target && target.kind === 'field';
export interface NodeOperationResult {
  definition: SplitTemplate;
  selectedId?: string;
  error?: string;
}
function fieldOwner(definition: SplitTemplate, ownerId: string) {
  if (ownerId === '$header')
    return {
      fields: definition.header.fields ?? [],
      minimum: 0,
      maximum: 12,
      family: 'root-field',
      label: 'Шапка карточки',
    };
  const node = locateNode(definition, ownerId)?.node;
  if (node?.type === 'fields' || node?.type === 'recordList')
    return {
      fields: node.fields,
      minimum: node.type === 'fields' ? 1 : 0,
      maximum: 50,
      // A row-relative binding is meaningful only inside this particular collection.
      family: node.type === 'recordList' ? `record:${node.id}` : 'root-field',
      label: node.title,
    };
  if (node?.type === 'metrics')
    return { fields: node.items, minimum: 1, maximum: 12, family: 'metric', label: node.title };
}
/** Fields keep ID/source/validation and binding scope. Each record list owns a separate row scope. */
export function fieldDropContainers(
  definition: SplitTemplate,
  fieldId: string,
): { ownerId: string; label: string; count: number }[] {
  const source = locateField(definition, fieldId);
  const family = source && fieldOwner(definition, source.ownerId)?.family;
  if (!family) return [];
  const result: { ownerId: string; label: string; count: number }[] = [];
  const add = (ownerId: string) => {
    const owner = fieldOwner(definition, ownerId);
    if (owner?.family === family) result.push({ ownerId, label: owner.label, count: owner.fields.length });
  };
  add('$header');
  const walk = (nodes: ContentNode[]) =>
    nodes.forEach((node) => {
      add(node.id);
      if (node.type === 'section') walk(node.children);
    });
  definition.tabs.forEach((tab) => walk(tab.nodes));
  return result;
}
export function moveFieldDefinition(
  definition: SplitTemplate,
  fieldId: string,
  target: FieldDropTarget,
): NodeOperationResult {
  const source = locateField(definition, fieldId);
  const from = source && fieldOwner(definition, source.ownerId);
  const to = fieldOwner(definition, target.ownerId);
  if (
    !source ||
    !from ||
    !to ||
    !Number.isInteger(target.index) ||
    target.index < 0 ||
    target.index > to.fields.length
  )
    return {
      definition,
      error:
        'Выберите совместимую группу полей. Колонки таблиц переносятся только настройками таблицы, показатели — между группами показателей.',
    };
  if (from.family !== to.family)
    return {
      definition,
      error:
        from.family.startsWith('record:') || to.family.startsWith('record:')
          ? 'У полей списка свой источник данных. Переставляйте поле внутри этого списка; для карточки или другого списка добавьте новое поле и явно настройте его источник.'
          : 'Показатели можно переносить только между группами показателей. Для обычной группы добавьте новое поле и настройте его источник отдельно.',
    };
  const same = source.ownerId === target.ownerId;
  const index = same && source.index < target.index ? target.index - 1 : target.index;
  if (same && index === source.index) return { definition, selectedId: fieldId };
  if (!same && from.fields.length <= from.minimum)
    return {
      definition,
      error: `В блоке «${from.label}» должно остаться хотя бы одно поле. Сначала добавьте другое поле или перенесите весь блок.`,
    };
  if (!same && to.fields.length >= to.maximum)
    return { definition, error: `В области «${to.label}» можно разместить не больше ${to.maximum} полей.` };
  const copy = structuredClone(definition);
  if (target.ownerId === '$header' && !copy.header.fields) copy.header.fields = [];
  const copiedSource = locateField(copy, fieldId)!;
  const copiedTarget = fieldOwner(copy, target.ownerId)!;
  const [moved] = copiedSource.fields.splice(copiedSource.index, 1);
  copiedTarget.fields.splice(index, 0, moved);
  return { definition: copy, selectedId: fieldId };
}
function containerOf(definition: SplitTemplate, id: string): ContentNode[] | undefined {
  const tab = definition.tabs.find((tab) => tab.id === id);
  if (tab) return tab.nodes;
  const located = locateNode(definition, id);
  return located?.node.type === 'section' ? located.node.children : undefined;
}
function subtreeIds(node: ContentNode): string[] {
  return [node.id, ...(node.type === 'section' ? node.children.flatMap(subtreeIds) : [])];
}
function validateArrangement(definition: SplitTemplate): string | undefined {
  let total = 0;
  const walk = (nodes: ContentNode[], depth: number): boolean => {
    if (!nodes.length) return true;
    if (depth > 8 || nodes.length > 100) return false;
    for (const node of nodes) {
      if (++total > 200) return false;
      if (node.type === 'section' && !walk(node.children, depth + 1)) return false;
    }
    return true;
  };
  return definition.tabs.every((tab) => walk(tab.nodes, 1))
    ? undefined
    : 'Нельзя разместить блок: максимум 8 уровней, 100 блоков в контейнере и 200 блоков в карточке.';
}
/** Move by stable ID; destination index is measured before removal. Failed operations are immutable no-ops. */
export function moveContentNode(
  definition: SplitTemplate,
  nodeId: string,
  target: NodeDropTarget,
): NodeOperationResult {
  const source = locateNode(definition, nodeId);
  const destination = containerOf(definition, target.containerId);
  if (
    !source ||
    !destination ||
    !Number.isInteger(target.index) ||
    target.index < 0 ||
    target.index > destination.length
  )
    return { definition, error: 'Выберите существующее место для вставки.' };
  if (subtreeIds(source.node).includes(target.containerId))
    return { definition, error: 'Раздел нельзя переместить внутрь самого себя или вложенного раздела.' };
  const copy = structuredClone(definition);
  const from = locateNode(copy, nodeId)!;
  const to = containerOf(copy, target.containerId)!;
  const index = from.siblings === to && from.index < target.index ? target.index - 1 : target.index;
  if (from.siblings === to && from.index === index) return { definition, selectedId: nodeId };
  from.siblings.splice(from.index, 1);
  to.splice(index, 0, from.node);
  const error = validateArrangement(copy);
  return error ? { definition, error } : { definition: copy, selectedId: nodeId };
}
export function insertContentNode(
  definition: SplitTemplate,
  node: ContentNode,
  target: NodeDropTarget,
): NodeOperationResult {
  const destination = containerOf(definition, target.containerId);
  if (
    !destination ||
    !Number.isInteger(target.index) ||
    target.index < 0 ||
    target.index > destination.length
  )
    return { definition, error: 'Выберите существующее место для вставки.' };
  const globalIds = (node: ContentNode): string[] => [
    node.id,
    ...(node.type === 'fields' || node.type === 'recordList'
      ? node.fields.map((field) => field.id)
      : node.type === 'metrics'
        ? node.items.map((field) => field.id)
        : node.type === 'table'
          ? node.columns.map((field) => field.id)
          : []),
    ...(node.type === 'documents' && node.action ? [node.action.id] : []),
    ...(node.type === 'section' ? node.children.flatMap(globalIds) : []),
  ];
  const existing = new Set([
    definition.id,
    ...definition.tabs.flatMap((tab) => [tab.id, ...tab.nodes.flatMap(globalIds)]),
    ...(definition.header.fields ?? []).map((field) => field.id),
    ...(definition.header.actions ?? []).map((action) => action.id),
    ...(definition.footer.actions ?? []).map((action) => action.id),
    ...(definition.footer.buttons ?? []).map((button) => button.id),
  ]);
  const inserted = globalIds(node);
  if (new Set(inserted).size !== inserted.length || inserted.some((id) => existing.has(id)))
    return { definition, error: 'ID добавляемого блока уже используется.' };
  const copy = structuredClone(definition);
  containerOf(copy, target.containerId)!.splice(target.index, 0, structuredClone(node));
  const error = validateArrangement(copy);
  return error ? { definition, error } : { definition: copy, selectedId: node.id };
}
export function nodeContainers(
  definition: SplitTemplate,
  excludeNodeId?: string,
): { value: string; label: string; count: number }[] {
  const excluded = new Set(
    excludeNodeId
      ? subtreeIds(locateNode(definition, excludeNodeId)?.node ?? ({ id: excludeNodeId } as ContentNode))
      : [],
  );
  const result: { value: string; label: string; count: number }[] = [];
  for (const tab of definition.tabs) {
    result.push({ value: tab.id, label: `Вкладка: ${tab.title}`, count: tab.nodes.length });
    const walk = (nodes: ContentNode[], prefix: string) =>
      nodes.forEach((node) => {
        if (node.type === 'section' && !excluded.has(node.id)) {
          result.push({ value: node.id, label: `${prefix} / ${node.title}`, count: node.children.length });
          walk(node.children, `${prefix} / ${node.title}`);
        }
      });
    walk(tab.nodes, tab.title);
  }
  return result;
}

export function createField(_catalog: Catalog, _index = 0): FieldDefinition {
  return {
    id: createId('field'),
    label: 'Новое поле',
    binding: '',
    source: { kind: 'literal', value: '' },
    format: 'text',
  };
}

export function createNode(type: ContentNode['type'], catalog: Catalog): ContentNode {
  const id = createId(type);
  switch (type) {
    case 'fields':
      return {
        id,
        type,
        title: 'Реквизиты',
        columns: 2,
        fields: [createField(catalog)],
      };
    case 'section':
      return { id, type, title: 'Новый раздел', collapsible: true, defaultOpen: true, children: [] };
    case 'text':
      return {
        id,
        type,
        title: 'Описание',
        binding: '',
        source: { kind: 'literal', value: '' },
        collapsible: true,
      };
    case 'table': {
      return {
        id,
        type,
        title: 'Связанные записи',
        binding: '',
        source: { kind: 'literal', value: [] },
        columns: [{ ...createField(catalog), id: createId('column'), label: 'Новая колонка' }],
        searchable: true,
        pageSize: 10,
      };
    }
    case 'widget':
      return {
        id,
        type,
        title: 'Виджет',
        widgetId: catalog.widgets.find((widget) => widget.mode === 'embedded')?.id ?? '',
        height: 240,
      };
    case 'erpTable':
      return {
        id,
        type,
        title: 'ERP-таблица',
        tableUrl: { kind: 'literal', value: '' },
        height: 420,
        options: {},
      };
    case 'badge':
      return { id, type, title: 'Бейдж', value: { kind: 'literal', value: 'Статус' }, tone: 'neutral' };
    case 'avatar':
      return { id, type, title: 'Аватар', name: { kind: 'literal', value: 'Имя пользователя' }, size: 'm' };
    case 'image':
      return {
        id,
        type,
        title: 'Изображение',
        src: { kind: 'literal', value: '' },
        alt: { kind: 'literal', value: '' },
        height: 240,
        fit: 'contain',
      };
    case 'progress':
      return { id, type, title: 'Прогресс', value: { kind: 'literal', value: 0 }, max: 100, showValue: true };
    case 'divider':
      return { id, type, title: 'Разделитель' };
    case 'callout':
      return {
        id,
        type,
        title: 'Сообщение',
        binding: '',
        source: { kind: 'literal', value: 'Текст сообщения' },
        tone: 'info',
      };
    case 'metrics':
      return {
        id,
        type,
        title: 'Суммы и показатели',
        columns: 2,
        items: [
          {
            ...createField(catalog),
            label: 'Сумма',
            source: { kind: 'literal', value: 0 },
            format: 'money',
            suffix: '',
          },
        ],
      };
    case 'recordList':
      return {
        id,
        type,
        title: 'Карточки записей',
        binding: '',
        source: { kind: 'literal', value: [] },
        itemTitle: { kind: 'binding', path: 'name' },
        columns: 2,
        fields: [
          {
            ...createField(catalog),
            label: 'Реквизит',
            source: { kind: 'binding', path: 'value' },
            binding: 'value',
          },
        ],
      };
    case 'documents':
      return {
        id,
        type,
        title: 'Документы и ссылки',
        binding: '',
        source: { kind: 'literal', value: [] },
        itemTitle: { kind: 'binding', path: 'name' },
        itemHref: { kind: 'binding', path: 'href' },
      };
  }
}

export function duplicateNode(node: ContentNode): ContentNode {
  const copy = structuredClone(node);
  const renew = (current: ContentNode) => {
    current.id = createId(current.type);
    if (current.type === 'fields' || current.type === 'recordList')
      current.fields.forEach((field) => {
        field.id = createId('field');
      });
    if (current.type === 'table')
      current.columns.forEach((field) => {
        field.id = createId('column');
      });
    if (current.type === 'metrics')
      current.items.forEach((item) => {
        item.id = createId('metric');
      });
    if (current.type === 'documents' && current.action) current.action.id = createId('action');
    if (current.type === 'section') current.children.forEach(renew);
  };
  renew(copy);
  copy.title = `${copy.title} · копия`;
  return copy;
}
