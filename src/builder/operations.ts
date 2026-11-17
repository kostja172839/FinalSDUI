import type { Catalog, ContentNode, FieldDefinition, SplitTemplate, TabDefinition } from '../../shared/model';

export function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11)}`;
}

export function locateNode(
  definition: SplitTemplate,
  id: string,
):
  | { node: ContentNode; siblings: ContentNode[]; index: number; tab: TabDefinition; path: string }
  | undefined {
  for (const [tabIndex, tab] of definition.tabs.entries()) {
    const walk = (nodes: ContentNode[], path: string): ReturnType<typeof locateNode> => {
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        if (node.id === id) return { node, siblings: nodes, index, tab, path: `${path}[${index}]` };
        if (node.type === 'section') {
          const result = walk(node.children, `${path}[${index}].children`);
          if (result) return result;
        }
      }
      return undefined;
    };
    const result = walk(tab.nodes, `$.tabs[${tabIndex}].nodes`);
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
