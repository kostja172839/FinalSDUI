import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Columns2,
  Copy,
  FileText,
  FolderClosed,
  Info,
  LayoutPanelTop,
  ListTree,
  PanelBottom,
  Plus,
  Puzzle,
  Settings2,
  SlidersHorizontal,
  Table2,
  Trash2,
  X,
  Files,
  Building2,
  BadgeDollarSign,
  MessageSquareText,
  Tag,
  UserRound,
  Image,
  Gauge,
  Minus,
} from 'lucide-react';
import type {
  Catalog,
  CatalogField,
  ContentNode,
  FieldDefinition,
  FieldFormat,
  SplitAction,
  SplitTemplate,
  ValidationIssue,
  ValueSource,
} from '../../shared/model';
import { Button, IconButton, Input, Select, Toggle, FieldErrorScope } from '../ui';
import {
  changeDefinition,
  createId,
  createNode,
  duplicateNode,
  locateNode,
  locateField,
  insertContentNode,
  moveContentNode,
  nodeContainers,
  type NodeDropTarget,
} from './operations';
import { getHeaderActions, getFooterActions } from '../../shared/actions';
import { ActionListEditor } from './ActionListEditor';
import { FooterButtonsEditor } from './FooterButtonsEditor';
import { BindingPathInput, ValueSourceEditor } from './ValueSourceEditor';
import { WidgetInvocationEditor } from './WidgetInvocationEditor';
import { EditorValidityProvider } from './editorValidation';
import { PreviewDataProvider, PreviewRowScope } from './previewData';
import {
  EditorDragProvider,
  NodeDragHandle,
  NodeDropZone,
  PaletteDragItem,
  type EditorDragItem,
} from './dragAndDrop';
import { ErpTableEditor } from './ErpTableEditor';
import { DisplayNodeEditor } from './DisplayNodeEditor';
import './builder.css';

export interface BuilderProps {
  definition: SplitTemplate;
  catalog: Catalog;
  onChange: (definition: SplitTemplate) => void;
  selectedNodeId?: string;
  onSelectNode?: (id: string) => void;
  issues: ValidationIssue[];
  children: ReactNode;
  onValidityChange?: (invalid: boolean) => void;
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
}

const nodeLabels: Record<ContentNode['type'], string> = {
  fields: 'Группа полей',
  section: 'Раздел',
  text: 'Описание',
  table: 'Таблица',
  widget: 'Встроенный виджет',
  callout: 'Сообщение',
  metrics: 'Суммы и показатели',
  recordList: 'Карточки записей',
  documents: 'Документы и ссылки',
  erpTable: 'ERP-таблица',
  badge: 'Бейдж',
  avatar: 'Аватар',
  image: 'Изображение',
  progress: 'Прогресс',
  divider: 'Разделитель',
};
const nodeIcons = {
  fields: Columns2,
  section: FolderClosed,
  text: FileText,
  table: Table2,
  widget: Puzzle,
  callout: MessageSquareText,
  metrics: BadgeDollarSign,
  recordList: Building2,
  documents: Files,
  erpTable: Table2,
  badge: Tag,
  avatar: UserRound,
  image: Image,
  progress: Gauge,
  divider: Minus,
};
const BuilderSelectionContext = createContext<{ selectedId: string; select: (id: string) => void } | null>(
  null,
);
const formats: { value: FieldFormat; label: string }[] = [
  { value: 'text', label: 'Текст' },
  { value: 'date', label: 'Дата' },
  { value: 'money', label: 'Сумма в рублях' },
  { value: 'number', label: 'Число' },
  { value: 'status', label: 'Статус' },
  { value: 'person', label: 'Пользователь' },
  { value: 'link', label: 'Ссылка' },
];

function Hint({ children }: { children: ReactNode }) {
  return (
    <div className="builder-hint">
      <Info size={15} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function SettingGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="builder-setting-group">
      <h3>{title}</h3>
      <div className="builder-setting-stack">{children}</div>
    </section>
  );
}

function OptionalItemSource({
  label,
  value,
  path,
  defaultPath,
  onChange,
}: {
  label: string;
  value?: ValueSource;
  path: string;
  defaultPath: string;
  onChange: (value: ValueSource | undefined) => void;
}) {
  return (
    <div className="builder-optional-source">
      <Toggle
        label={`Показывать: ${label}`}
        checked={Boolean(value)}
        onChange={(checked) => onChange(checked ? { kind: 'binding', path: defaultPath } : undefined)}
      />
      {value && (
        <ValueSourceEditor
          label={label}
          source={value}
          path={path}
          hint="Путь внутри одной записи списка. Можно задать своё значение."
          onChange={onChange}
        />
      )}
    </div>
  );
}

function FieldListEditor({
  fields,
  available,
  onChange,
  table = false,
  path = 'fields',
  metrics = false,
  limit,
}: {
  fields: FieldDefinition[];
  available: CatalogField[];
  onChange: (fields: FieldDefinition[]) => void;
  table?: boolean;
  path?: string;
  metrics?: boolean;
  limit?: number;
}) {
  const selection = useContext(BuilderSelectionContext);
  const [selected, setSelected] = useState(fields[0]?.id ?? '');
  const selectedField =
    fields.find((field) => field.id === selection?.selectedId) ??
    fields.find((field) => field.id === selected) ??
    fields[0];
  const change = (id: string, update: Partial<FieldDefinition>) =>
    onChange(fields.map((field) => (field.id === id ? { ...field, ...update } : field)));
  const move = (id: string, direction: number) => {
    const copy = [...fields];
    const index = copy.findIndex((field) => field.id === id);
    const next = index + direction;
    if (next < 0 || next >= copy.length) return;
    [copy[index], copy[next]] = [copy[next], copy[index]];
    onChange(copy);
  };
  const add = () => {
    const field: FieldDefinition = {
      id: createId(table ? 'column' : 'field'),
      label: table ? 'Новая колонка' : 'Новое поле',
      binding: '',
      source: { kind: 'literal', value: '' },
      format: 'text',
    };
    onChange([...fields, field]);
    setSelected(field.id);
    selection?.select(field.id);
  };
  return (
    <div className="builder-field-editor">
      <div className="builder-field-list" aria-label={table ? 'Колонки таблицы' : 'Поля группы'}>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className={`builder-field-item ${selectedField?.id === field.id ? 'is-selected' : ''}`}
          >
            <button
              type="button"
              className="builder-field-select"
              onClick={() => {
                setSelected(field.id);
                selection?.select(field.id);
              }}
              aria-pressed={selectedField?.id === field.id}
            >
              <span className="builder-field-number">{index + 1}</span>
              <span>{field.label || 'Без подписи'}</span>
            </button>
            <div className="builder-field-actions">
              <IconButton
                label={`Поднять поле «${field.label}»`}
                disabled={index === 0}
                onClick={() => move(field.id, -1)}
              >
                <ArrowUp size={13} />
              </IconButton>
              <IconButton
                label={`Опустить поле «${field.label}»`}
                disabled={index === fields.length - 1}
                onClick={() => move(field.id, 1)}
              >
                <ArrowDown size={13} />
              </IconButton>
              <IconButton
                label={`Удалить поле «${field.label}»`}
                onClick={() => onChange(fields.filter((item) => item.id !== field.id))}
              >
                <X size={13} />
              </IconButton>
            </div>
          </div>
        ))}
        {fields.length === 0 && (
          <p className="builder-empty-inline">
            Выберите поля, которые нужно показать в {table ? 'таблице' : 'группе'}.
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={add}
        disabled={fields.length >= (limit ?? (table ? 20 : metrics ? 12 : 50))}
      >
        <Plus size={14} />
        {table ? 'Добавить колонку' : 'Добавить поле'}
      </Button>
      {selectedField && (
        <FieldErrorScope path={`${path}[${fields.indexOf(selectedField)}]`}>
          <div className="builder-field-settings">
            <h4 className="builder-field-caption">{table ? 'Настройки колонки' : 'Настройки поля'}</h4>
            <Input
              label="Подпись"
              path="label"
              required
              maxLength={2000}
              value={selectedField.label}
              onChange={(event) => change(selectedField.id, { label: event.target.value })}
            />
            <ValueSourceEditor
              label="Данные"
              source={selectedField.source}
              binding={selectedField.binding}
              format={selectedField.format}
              fields={available}
              hint={
                table
                  ? 'Путь внутри одной строки таблицы, например document.number. Можно указать любой ключ.'
                  : undefined
              }
              onChange={(source) =>
                change(selectedField.id, {
                  source,
                  ...(source.kind === 'binding' ? { binding: source.path } : {}),
                })
              }
            />
            <Select
              label="Отображение"
              path="format"
              value={selectedField.format}
              options={formats}
              onChange={(event) => change(selectedField.id, { format: event.target.value as FieldFormat })}
            />
            {metrics && (
              <Input
                label="Пояснение после суммы"
                path="suffix"
                value={(selectedField as FieldDefinition & { suffix?: string }).suffix ?? ''}
                onChange={(event) =>
                  change(selectedField.id, { suffix: event.target.value } as Partial<FieldDefinition>)
                }
                hint="Например, с НДС или без НДС."
              />
            )}
            <h4 className="builder-field-caption">Проверка значения</h4>
            <Toggle
              label="Обязательное значение"
              checked={Boolean(selectedField.validation?.required)}
              onChange={(required) =>
                change(selectedField.id, { validation: { ...selectedField.validation, required } })
              }
            />
            <p className="builder-property-copy">
              Проверяется полученное значение из API или заданное значение. Ошибка будет показана рядом с
              полем.
            </p>
            {(['number', 'money'].includes(selectedField.format)
              ? (['min', 'max'] as const)
              : (['minLength', 'maxLength'] as const)
            ).map((key) => (
              <Input
                key={key}
                label={
                  (
                    {
                      min: 'Минимальное значение',
                      max: 'Максимальное значение',
                      minLength: 'Минимум символов',
                      maxLength: 'Максимум символов',
                    } as const
                  )[key]
                }
                path={`validation.${key}`}
                type="number"
                step={key.includes('Length') ? 1 : 'any'}
                min={key.includes('Length') ? 0 : undefined}
                value={selectedField.validation?.[key] ?? ''}
                onChange={(event) => {
                  const validation = { ...selectedField.validation };
                  if (!event.target.value.trim()) delete validation[key];
                  else validation[key] = Number(event.target.value);
                  change(selectedField.id, { validation });
                }}
              />
            ))}
          </div>
        </FieldErrorScope>
      )}
    </div>
  );
}

export function Builder({
  definition,
  catalog,
  onChange,
  selectedNodeId,
  onSelectNode,
  issues,
  children,
  onValidityChange,
  data,
  onDataChange,
}: BuilderProps) {
  const [localSelection, setLocalSelection] = useState('$header');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mobilePanel, setMobilePanel] = useState<'tree' | 'properties' | null>(null);
  const [dragMessage, setDragMessage] = useState('');
  useEffect(() => {
    if (!dragMessage) return;
    const timer = setTimeout(() => setDragMessage(''), 4500);
    return () => clearTimeout(timer);
  }, [dragMessage]);
  const selectedId = selectedNodeId ?? localSelection;
  const selectedFieldLocation = locateField(definition, selectedId);
  const located = locateNode(definition, selectedFieldLocation?.ownerId ?? selectedId);
  const selectedNode = located?.node;
  const selectedTab = definition.tabs.find((tab) => tab.id === selectedId);
  const activeTab = selectedTab ?? located?.tab ?? definition.tabs[0];
  const embeddedWidgets = catalog.widgets.filter((widget) => widget.mode === 'embedded');
  const externalWidgets = catalog.widgets.filter((widget) => widget.mode === 'external');
  const issueTarget = (issue: ValidationIssue) => {
    if (issue.nodeId) return issue.nodeId;
    if (issue.path.startsWith('$.header')) return '$header';
    if (issue.path.startsWith('$.footer')) return '$footer';
    const tabIndex = issue.path.match(/tabs\[(\d+)\]/)?.[1];
    if (tabIndex !== undefined && definition.tabs[Number(tabIndex)])
      return definition.tabs[Number(tabIndex)].id;
    return '$shell';
  };
  const selectedIssues = issues.filter((issue) => issueTarget(issue) === selectedId);
  const select = (id: string) => {
    setLocalSelection(id);
    onSelectNode?.(id);
  };
  const mutate = (recipe: (copy: SplitTemplate) => void) => onChange(changeDefinition(definition, recipe));
  const updateActions = (placement: 'header' | 'footer', actions: SplitAction[]) =>
    mutate((copy) => {
      copy.header.actions = getHeaderActions(copy);
      copy.footer.actions = getFooterActions(copy);
      copy[placement].actions = actions;
      delete copy.footer.widgetId;
      delete copy.footer.actionLabel;
    });
  const updateNode = (update: Partial<ContentNode>) =>
    mutate((copy) => {
      const match = locateNode(copy, selectedNode?.id ?? selectedId);
      if (match) Object.assign(match.node, update);
    });
  const toggleExpanded = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const addNode = (type: ContentNode['type']) => {
    const node = createNode(type, catalog);
    const containerId = selectedNode?.type === 'section' ? selectedNode.id : activeTab.id;
    const result = insertContentNode(definition, node, {
      containerId,
      index: selectedNode?.type === 'section' ? selectedNode.children.length : activeTab.nodes.length,
    });
    if (result.error) {
      setDragMessage(result.error);
      return;
    }
    onChange(result.definition);
    if (selectedNode?.type === 'section')
      setExpanded((previous) => {
        const next = new Set(previous);
        next.delete(selectedNode.id);
        return next;
      });
    select(node.id);
    setPaletteOpen(false);
  };
  const drop = (item: EditorDragItem, target: NodeDropTarget) => {
    const result =
      item.kind === 'node'
        ? moveContentNode(definition, item.nodeId, target)
        : insertContentNode(definition, createNode(item.nodeType, catalog), target);
    setDragMessage(
      result.error ?? `Блок «${item.label}» ${item.kind === 'palette' ? 'добавлен' : 'перемещён'}.`,
    );
    if (!result.error) {
      if (result.definition !== definition) onChange(result.definition);
      if (result.selectedId) select(result.selectedId);
      setExpanded((old) => {
        const next = new Set(old);
        next.delete(target.containerId);
        return next;
      });
      setPaletteOpen(false);
    }
  };
  const moveNode = (direction: number) =>
    mutate((copy) => {
      const match = locateNode(copy, selectedId);
      if (!match) return;
      const next = match.index + direction;
      if (next < 0 || next >= match.siblings.length) return;
      [match.siblings[match.index], match.siblings[next]] = [
        match.siblings[next],
        match.siblings[match.index],
      ];
    });
  const deleteNode = () => {
    if (!located) return;
    const nextSelection = located.tab.id;
    mutate((copy) => {
      const match = locateNode(copy, selectedId);
      if (match) match.siblings.splice(match.index, 1);
    });
    select(nextSelection);
  };
  const duplicate = () => {
    if (!selectedNode) return;
    const next = duplicateNode(selectedNode);
    if (!located) return;
    const result = insertContentNode(definition, next, {
      containerId: located.containerId,
      index: located.index + 1,
    });
    if (result.error) {
      setDragMessage(result.error);
      return;
    }
    onChange(result.definition);
    select(next.id);
  };
  const renderNode = (node: ContentNode, depth: number, containerId: string, index: number) => {
    const Icon = nodeIcons[node.type];
    const collapsed = expanded.has(node.id);
    const hasError = issues.some((issue) => issue.nodeId === node.id && issue.severity === 'error');
    return (
      <div key={node.id} className="builder-tree-node">
        <NodeDropZone target={{ containerId, index }} label={`Перед блоком «${node.title}»`}>
          <div
            className={`builder-tree-row ${selectedId === node.id ? 'is-selected' : ''}`}
            style={{ paddingLeft: 12 + depth * 15 }}
          >
            <NodeDragHandle nodeId={node.id} label={node.title || nodeLabels[node.type]} />
            {node.type === 'section' ? (
              <button
                type="button"
                className="builder-tree-expander"
                aria-label={`${collapsed ? 'Развернуть' : 'Свернуть'} раздел «${node.title}»`}
                onClick={() => toggleExpanded(node.id)}
              >
                {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            ) : (
              <span className="builder-tree-spacer" />
            )}
            <button
              type="button"
              className="builder-tree-select"
              onClick={() => select(node.id)}
              aria-current={selectedId === node.id ? 'true' : undefined}
            >
              <Icon size={15} />
              <span>{node.title || nodeLabels[node.type]}</span>
              {hasError && <CircleAlert size={13} className="builder-error-icon" />}
            </button>
          </div>
        </NodeDropZone>
        {(node.type === 'fields' ||
          node.type === 'recordList' ||
          node.type === 'metrics' ||
          node.type === 'table') && (
          <div className="builder-tree-fields" style={{ paddingLeft: 38 + depth * 15 }}>
            {(node.type === 'metrics' ? node.items : node.type === 'table' ? node.columns : node.fields).map(
              (field) => (
                <button
                  key={field.id}
                  type="button"
                  className={`builder-tree-field ${selectedId === field.id ? 'is-selected' : ''}`}
                  onClick={() => select(field.id)}
                  aria-current={selectedId === field.id ? 'true' : undefined}
                >
                  <span>{field.label || 'Без подписи'}</span>
                </button>
              ),
            )}
          </div>
        )}
        {node.type === 'section' && !collapsed && (
          <div>
            {node.children.length ? (
              node.children.map((child, index) => renderNode(child, depth + 1, node.id, index))
            ) : (
              <button
                type="button"
                className="builder-tree-empty"
                style={{ paddingLeft: 46 + depth * 15 }}
                onClick={() => {
                  select(node.id);
                  setPaletteOpen(true);
                }}
              >
                Добавить в раздел <Plus size={12} />
              </button>
            )}
            <NodeDropZone
              target={{ containerId: node.id, index: node.children.length }}
              label={`В раздел «${node.title}»`}
            />
          </div>
        )}
      </div>
    );
  };

  const renderProperties = () => {
    if (selectedFieldLocation) {
      const owner = selectedFieldLocation.node;
      const editor = (
        <SettingGroup
          title={selectedFieldLocation.collection === 'columns' ? 'Настройки колонки' : 'Настройки поля'}
        >
          <Button variant="ghost" size="sm" onClick={() => select(selectedFieldLocation.ownerId)}>
            <ChevronRight size={14} />К настройкам {owner ? `блока «${owner.title}»` : 'шапки'}
          </Button>
          <FieldListEditor
            key={selectedFieldLocation.ownerId}
            fields={selectedFieldLocation.fields}
            available={owner?.type === 'recordList' || owner?.type === 'table' ? [] : catalog.fields}
            path={
              selectedFieldLocation.ownerId === '$header' ? 'header.fields' : selectedFieldLocation.collection
            }
            table={selectedFieldLocation.collection === 'columns'}
            metrics={owner?.type === 'metrics'}
            limit={selectedFieldLocation.ownerId === '$header' ? 12 : undefined}
            onChange={(fields) => {
              mutate((copy) => {
                const match = locateField(copy, selectedId);
                if (match) match.fields.splice(0, match.fields.length, ...fields);
              });
              if (!fields.some((field) => field.id === selectedId))
                select(fields[0]?.id ?? selectedFieldLocation.ownerId);
            }}
          />
        </SettingGroup>
      );
      return owner?.type === 'recordList' || owner?.type === 'table' ? (
        <PreviewRowScope source={owner.source} binding={owner.binding}>
          {editor}
        </PreviewRowScope>
      ) : (
        editor
      );
    }
    if (selectedId === '$header')
      return (
        <>
          <SettingGroup title="Содержимое шапки">
            <ValueSourceEditor
              label="Заголовок"
              path="header.titleSource"
              legacyPath="header.titleBinding"
              source={definition.header.titleSource}
              binding={definition.header.titleBinding}
              fields={catalog.fields}
              onChange={(source) =>
                mutate((copy) => {
                  copy.header.titleSource = source;
                  if (source.kind === 'binding') copy.header.titleBinding = source.path;
                })
              }
            />
            <ValueSourceEditor
              label="Описание"
              path="header.subtitleSource"
              legacyPath="header.subtitleBinding"
              source={definition.header.subtitleSource}
              binding={definition.header.subtitleBinding}
              fields={catalog.fields}
              onChange={(source) =>
                mutate((copy) => {
                  copy.header.subtitleSource = source;
                  if (source.kind === 'binding') copy.header.subtitleBinding = source.path;
                })
              }
            />
            <Toggle
              label="Показывать статус"
              checked={definition.header.showStatus}
              onChange={(checked) =>
                mutate((copy) => {
                  copy.header.showStatus = checked;
                })
              }
            />
            {definition.header.showStatus && (
              <ValueSourceEditor
                label="Поле статуса"
                path="header.statusSource"
                legacyPath="header.statusBinding"
                source={definition.header.statusSource}
                binding={definition.header.statusBinding}
                fields={catalog.fields}
                onChange={(source) =>
                  mutate((copy) => {
                    copy.header.statusSource = source;
                    if (source.kind === 'binding') copy.header.statusBinding = source.path;
                  })
                }
              />
            )}
            <Hint>
              Укажите путь в ответе API или своё значение. Поля каталога служат подсказками и не ограничивают
              содержимое карточки.
            </Hint>
          </SettingGroup>
          <SettingGroup title="Реквизиты в шапке">
            <FieldListEditor
              fields={definition.header.fields ?? []}
              limit={12}
              path="header.fields"
              available={catalog.fields}
              onChange={(fields) =>
                mutate((copy) => {
                  copy.header.fields = fields;
                })
              }
            />
            <Hint>Эти реквизиты закреплены вместе с заголовком и остаются видимыми при прокрутке.</Hint>
          </SettingGroup>
          <SettingGroup title="Действия в шапке">
            <FieldErrorScope path="header">
              <ActionListEditor
                actions={getHeaderActions(definition)}
                widgets={externalWidgets}
                fields={catalog.fields}
                placement="header"
                onChange={(actions) => updateActions('header', actions)}
              />
            </FieldErrorScope>
          </SettingGroup>
          <SettingGroup title="Поведение сплита">
            <p className="builder-property-copy">
              Закрытие, разворачивание и изменение ширины работают одинаково во всех карточках.
            </p>
            <Button variant="ghost" size="sm" onClick={() => select('$shell')}>
              <Settings2 size={14} />
              Настройки оболочки
            </Button>
          </SettingGroup>
        </>
      );
    if (selectedId === '$footer')
      return (
        <>
          <SettingGroup title="Нижняя панель">
            <Toggle
              label="Показывать панель"
              checked={definition.footer.show}
              onChange={(checked) =>
                mutate((copy) => {
                  copy.footer.show = checked;
                })
              }
            />
            <Input
              label="Подпись слева"
              path="footer.text"
              value={definition.footer.text}
              placeholder="Например, данные актуальны"
              onChange={(event) =>
                mutate((copy) => {
                  copy.footer.text = event.target.value;
                })
              }
            />
            <Hint>Панель закреплена снизу. Она остаётся видимой при прокрутке содержимого.</Hint>
          </SettingGroup>
          <SettingGroup title="Кнопки в нижней панели">
            <FieldErrorScope path="footer">
              <FooterButtonsEditor
                buttons={definition.footer.buttons ?? []}
                widgets={externalWidgets}
                actions={catalog.actions}
                fields={catalog.fields}
                onChange={(buttons) =>
                  mutate((copy) => {
                    copy.footer.buttons = buttons;
                  })
                }
              />
            </FieldErrorScope>
          </SettingGroup>
          <SettingGroup title="Действия в нижней панели">
            <FieldErrorScope path="footer">
              <ActionListEditor
                actions={getFooterActions(definition)}
                widgets={externalWidgets}
                fields={catalog.fields}
                placement="footer"
                onChange={(actions) => updateActions('footer', actions)}
              />
            </FieldErrorScope>
          </SettingGroup>
        </>
      );
    if (selectedId === '$shell')
      return (
        <>
          <SettingGroup title="Общие настройки">
            <Input
              label="Название шаблона"
              path="name"
              required
              maxLength={2000}
              value={definition.name}
              onChange={(event) =>
                mutate((copy) => {
                  copy.name = event.target.value;
                })
              }
            />
            <Input
              label="Тип объекта"
              path="entityType"
              required
              value={definition.entityType}
              hint="Ключ типа объекта, который принимает ваш backend, например contract или request. Данные текущего объекта называются entity."
              onChange={(event) =>
                mutate((copy) => {
                  copy.entityType = event.target.value;
                })
              }
            />
            <Input
              label="Ширина при открытии, px"
              path="shell.defaultWidth"
              type="number"
              min={definition.shell.minWidth}
              max={2400}
              value={definition.shell.defaultWidth}
              onChange={(event) =>
                mutate((copy) => {
                  copy.shell.defaultWidth = Number(event.target.value);
                })
              }
            />
            <Input
              label="Минимальная ширина, px"
              path="shell.minWidth"
              type="number"
              min={320}
              max={1600}
              value={definition.shell.minWidth}
              onChange={(event) =>
                mutate((copy) => {
                  copy.shell.minWidth = Number(event.target.value);
                })
              }
            />
            <Input
              label="Максимум от ширины страницы, %"
              path="shell.maxWidthPercent"
              type="number"
              min={30}
              max={100}
              value={definition.shell.maxWidthPercent}
              onChange={(event) =>
                mutate((copy) => {
                  copy.shell.maxWidthPercent = Number(event.target.value);
                })
              }
            />
            <Hint>
              На небольшом экране карточка займёт доступную ширину. Полноэкранный режим не ограничивается
              этими значениями.
            </Hint>
          </SettingGroup>
        </>
      );
    if (selectedTab) {
      const index = definition.tabs.indexOf(selectedTab);
      return (
        <>
          <SettingGroup title="Настройки вкладки">
            <Input
              label="Название"
              path={`tabs[${definition.tabs.indexOf(selectedTab)}].title`}
              required
              maxLength={2000}
              value={selectedTab.title}
              onChange={(event) =>
                mutate((copy) => {
                  const tab = copy.tabs.find((item) => item.id === selectedTab.id);
                  if (tab) tab.title = event.target.value;
                })
              }
            />
            <p className="builder-property-copy">
              {selectedTab.nodes.length}{' '}
              {selectedTab.nodes.length === 1 ? 'блок' : selectedTab.nodes.length < 5 ? 'блока' : 'блоков'} в
              содержимом вкладки
            </p>
            <Button variant="secondary" size="sm" onClick={() => setPaletteOpen(true)}>
              <Plus size={14} />
              Добавить блок
            </Button>
            <Hint>
              Делите информацию по задачам пользователя: основные сведения, стоимость, связанные события.
            </Hint>
          </SettingGroup>
          <SettingGroup title="Порядок и удаление">
            <div className="builder-inline-actions">
              <Button
                variant="secondary"
                size="sm"
                disabled={index === 0}
                onClick={() =>
                  mutate((copy) => {
                    [copy.tabs[index - 1], copy.tabs[index]] = [copy.tabs[index], copy.tabs[index - 1]];
                  })
                }
              >
                <ArrowUp size={14} />
                Выше
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={index === definition.tabs.length - 1}
                onClick={() =>
                  mutate((copy) => {
                    [copy.tabs[index + 1], copy.tabs[index]] = [copy.tabs[index], copy.tabs[index + 1]];
                  })
                }
              >
                <ArrowDown size={14} />
                Ниже
              </Button>
            </div>
            <Button
              variant="danger"
              size="sm"
              disabled={definition.tabs.length === 1}
              onClick={() => {
                mutate((copy) => {
                  copy.tabs = copy.tabs.filter((tab) => tab.id !== selectedTab.id);
                });
                select('$header');
              }}
            >
              <Trash2 size={14} />
              Удалить вкладку
            </Button>
            {definition.tabs.length === 1 && (
              <p className="builder-property-copy">В карточке должна остаться хотя бы одна вкладка.</p>
            )}
          </SettingGroup>
        </>
      );
    }
    if (!selectedNode)
      return (
        <div className="builder-no-selection">
          <Settings2 size={25} />
          <p>Выберите блок в структуре, чтобы настроить его.</p>
        </div>
      );
    return (
      <>
        <SettingGroup title="Основное">
          <Input
            label="Название блока"
            path="title"
            required
            maxLength={2000}
            value={selectedNode.title}
            onChange={(event) => updateNode({ title: event.target.value })}
          />
        </SettingGroup>
        {selectedNode.type === 'fields' && (
          <>
            <SettingGroup title="Расположение">
              <Select
                label="Количество колонок"
                path="columns"
                value={String(selectedNode.columns)}
                options={[
                  { value: '1', label: 'Одна колонка' },
                  { value: '2', label: 'Две колонки' },
                  { value: '3', label: 'Три колонки' },
                ]}
                onChange={(event) => updateNode({ columns: Number(event.target.value) as 1 | 2 | 3 })}
              />
              <Hint>
                {selectedNode.columns === 3
                  ? 'Три колонки подходят для коротких значений. Проверьте, как они выглядят в узком сплите.'
                  : 'Объединяйте связанные сведения: даты, участников, идентификационные признаки.'}
              </Hint>
            </SettingGroup>
            <SettingGroup title="Поля">
              <FieldListEditor
                key={selectedNode.id}
                fields={selectedNode.fields}
                available={catalog.fields}
                onChange={(fields) => updateNode({ fields })}
              />
            </SettingGroup>
          </>
        )}
        {selectedNode.type === 'section' && (
          <SettingGroup title="Раздел">
            <Toggle
              label="Можно свернуть"
              checked={selectedNode.collapsible}
              onChange={(collapsible) => updateNode({ collapsible })}
            />
            {selectedNode.collapsible && (
              <Toggle
                label="Развёрнут при открытии"
                checked={selectedNode.defaultOpen}
                onChange={(defaultOpen) => updateNode({ defaultOpen })}
              />
            )}
            <Button variant="secondary" size="sm" onClick={() => setPaletteOpen(true)}>
              <Plus size={14} />
              Добавить блок в раздел
            </Button>
            <Hint>
              Сворачивание помогает читать длинные карточки. Вложенные блоки сохранят собственные настройки.
            </Hint>
          </SettingGroup>
        )}
        {selectedNode.type === 'text' && (
          <SettingGroup title="Содержимое">
            <ValueSourceEditor
              label="Текст описания"
              multiline
              source={selectedNode.source}
              binding={selectedNode.binding}
              fields={catalog.fields}
              onChange={(source) =>
                updateNode({ source, ...(source.kind === 'binding' ? { binding: source.path } : {}) })
              }
            />
            <Toggle
              label="Можно свернуть описание"
              checked={selectedNode.collapsible}
              onChange={(collapsible) => updateNode({ collapsible })}
            />
            <Hint>Длинное описание лучше отделить от реквизитов и разрешить сворачивать.</Hint>
          </SettingGroup>
        )}
        {selectedNode.type === 'table' && (
          <>
            <SettingGroup title="Источник записей">
              <ValueSourceEditor
                label="Записи таблицы"
                source={selectedNode.source}
                binding={selectedNode.binding}
                fields={catalog.datasets.map((dataset) => ({
                  binding: dataset.binding,
                  label: dataset.label,
                  group: 'Списки записей',
                  type: 'text',
                  description: 'Список объектов. Колонки настраиваются отдельно.',
                  example: '[…]',
                }))}
                hint="Любой путь к массиву объектов в данных API, например request.documents. Колонки читают значения внутри строки."
                onChange={(source) =>
                  updateNode({ source, ...(source.kind === 'binding' ? { binding: source.path } : {}) })
                }
              />
              <Toggle
                label="Поиск по записям"
                checked={selectedNode.searchable}
                onChange={(searchable) => updateNode({ searchable })}
              />
              <Input
                label="Записей на странице"
                path="pageSize"
                type="number"
                min={1}
                max={100}
                step={1}
                value={String(selectedNode.pageSize)}
                onChange={(event) => updateNode({ pageSize: Number(event.target.value) })}
              />
              <Hint>Для связанных событий используйте таблицу с поиском и постраничным просмотром.</Hint>
            </SettingGroup>
            <SettingGroup title="Колонки">
              <PreviewRowScope source={selectedNode.source} binding={selectedNode.binding}>
                <FieldListEditor
                  key={selectedNode.id}
                  table
                  path="columns"
                  fields={selectedNode.columns}
                  available={
                    catalog.datasets.find((dataset) => dataset.binding === selectedNode.binding)?.columns ??
                    []
                  }
                  onChange={(columns) => updateNode({ columns })}
                />
              </PreviewRowScope>
            </SettingGroup>
          </>
        )}
        {selectedNode.type === 'widget' && (
          <SettingGroup title="Встроенный виджет">
            <Select
              label="Виджет из реестра"
              path="widgetId"
              value={selectedNode.widgetId}
              options={[
                { value: '', label: 'Выберите виджет' },
                ...embeddedWidgets.map((widget) => ({ value: widget.id, label: widget.name })),
              ]}
              onChange={(event) => updateNode({ widgetId: event.target.value, props: {}, events: {} })}
            />
            <p className="builder-field-description">
              {embeddedWidgets.find((widget) => widget.id === selectedNode.widgetId)?.description}
            </p>
            <WidgetInvocationEditor
              key={`${selectedNode.id}-${selectedNode.widgetId}`}
              value={selectedNode}
              widget={embeddedWidgets.find((widget) => widget.id === selectedNode.widgetId)}
              fields={catalog.fields}
              onChange={({ props, events }) => updateNode({ props, events })}
            />
            <Input
              label="Высота области, px"
              path="height"
              type="number"
              min={120}
              max={1200}
              step={20}
              value={selectedNode.height}
              onChange={(event) => updateNode({ height: Number(event.target.value) })}
            />
            <Hint>
              Встраивать можно зарегистрированные виджеты. Контекст объекта передаётся автоматически.
            </Hint>
          </SettingGroup>
        )}
        {selectedNode.type === 'erpTable' && (
          <ErpTableEditor node={selectedNode} catalog={catalog} onChange={(node) => updateNode(node)} />
        )}
        {(['badge', 'avatar', 'image', 'progress', 'divider'] as const).some(
          (type) => type === selectedNode.type,
        ) && (
          <DisplayNodeEditor
            node={
              selectedNode as Extract<
                ContentNode,
                { type: 'badge' | 'avatar' | 'image' | 'progress' | 'divider' }
              >
            }
            fields={catalog.fields}
            onChange={(node) => updateNode(node)}
          />
        )}
        {selectedNode.type === 'callout' && (
          <SettingGroup title="Информационное сообщение">
            <Select
              label="Вид сообщения"
              path="tone"
              value={selectedNode.tone}
              options={[
                { value: 'info', label: 'Информация' },
                { value: 'success', label: 'Успех' },
                { value: 'warning', label: 'Предупреждение' },
                { value: 'error', label: 'Ошибка' },
              ]}
              onChange={(event) =>
                updateNode({ tone: event.target.value as 'info' | 'success' | 'warning' | 'error' })
              }
            />
            <ValueSourceEditor
              label="Текст сообщения"
              multiline
              source={selectedNode.source}
              binding={selectedNode.binding}
              fields={catalog.fields}
              onChange={(source) =>
                updateNode({ source, ...(source.kind === 'binding' ? { binding: source.path } : {}) })
              }
            />
          </SettingGroup>
        )}
        {selectedNode.type === 'metrics' && (
          <>
            <SettingGroup title="Расположение показателей">
              <Select
                label="Количество колонок"
                path="columns"
                value={String(selectedNode.columns)}
                options={[1, 2, 3].map((value) => ({ value: String(value), label: String(value) }))}
                onChange={(event) => updateNode({ columns: Number(event.target.value) as 1 | 2 | 3 })}
              />
            </SettingGroup>
            <SettingGroup title="Значения и пояснения">
              <FieldListEditor
                key={selectedNode.id}
                fields={selectedNode.items}
                metrics
                path="items"
                available={catalog.fields}
                onChange={(items) => updateNode({ items })}
              />
              <Hint>Подходит для сумм с НДС и без НДС, лимитов, ставок и итоговых значений.</Hint>
            </SettingGroup>
          </>
        )}
        {(selectedNode.type === 'recordList' || selectedNode.type === 'documents') && (
          <>
            <SettingGroup title="Источник списка">
              <ValueSourceEditor
                label="Записи списка"
                source={selectedNode.source}
                binding={selectedNode.binding}
                fields={catalog.datasets.map((dataset) => ({
                  binding: dataset.binding,
                  label: dataset.label,
                  group: 'Коллекции',
                  type: 'text',
                  description: 'Массив объектов из ответа API',
                  example: '[…]',
                }))}
                hint="Путь к массиву, например collections.documents или collections.counterparties."
                onChange={(source) =>
                  updateNode({ source, ...(source.kind === 'binding' ? { binding: source.path } : {}) })
                }
              />
            </SettingGroup>
            <PreviewRowScope source={selectedNode.source} binding={selectedNode.binding}>
              <SettingGroup title="Заголовок записи">
                <ValueSourceEditor
                  label="Название записи"
                  source={selectedNode.itemTitle}
                  path="itemTitle"
                  hint="Путь внутри одной записи, например name. Каталог объекта здесь не ограничивает поля."
                  onChange={(itemTitle) => updateNode({ itemTitle })}
                />
                <OptionalItemSource
                  label="Ссылка записи"
                  path="itemHref"
                  defaultPath="href"
                  value={selectedNode.itemHref}
                  onChange={(itemHref) => updateNode({ itemHref })}
                />
              </SettingGroup>
            </PreviewRowScope>
            {selectedNode.type === 'recordList' && (
              <>
                <PreviewRowScope source={selectedNode.source} binding={selectedNode.binding}>
                  <SettingGroup title="Карточка записи">
                    <OptionalItemSource
                      label="Описание записи"
                      path="itemSubtitle"
                      defaultPath="description"
                      value={selectedNode.itemSubtitle}
                      onChange={(itemSubtitle) => updateNode({ itemSubtitle })}
                    />
                    <Select
                      label="Колонок реквизитов в карточке"
                      path="columns"
                      value={String(selectedNode.columns)}
                      options={[1, 2, 3].map((value) => ({ value: String(value), label: String(value) }))}
                      onChange={(event) => updateNode({ columns: Number(event.target.value) as 1 | 2 | 3 })}
                    />
                    <FieldListEditor
                      key={selectedNode.id}
                      fields={selectedNode.fields}
                      path="fields"
                      available={[]}
                      onChange={(fields) => updateNode({ fields })}
                    />
                    <Hint>
                      Значения реквизитов читаются внутри каждой записи. Используйте для контрагентов,
                      участников и связанных сущностей.
                    </Hint>
                  </SettingGroup>
                </PreviewRowScope>
              </>
            )}
            {selectedNode.type === 'documents' && (
              <>
                <PreviewRowScope source={selectedNode.source} binding={selectedNode.binding}>
                  <SettingGroup title="Метаданные документа">
                    <OptionalItemSource
                      label="Описание документа"
                      path="itemDescription"
                      defaultPath="description"
                      value={selectedNode.itemDescription}
                      onChange={(itemDescription) => updateNode({ itemDescription })}
                    />
                    <OptionalItemSource
                      label="Статус документа"
                      path="itemStatus"
                      defaultPath="status"
                      value={selectedNode.itemStatus}
                      onChange={(itemStatus) => updateNode({ itemStatus })}
                    />
                    <OptionalItemSource
                      label="Размер файла"
                      path="itemSize"
                      defaultPath="size"
                      value={selectedNode.itemSize}
                      onChange={(itemSize) => updateNode({ itemSize })}
                    />
                  </SettingGroup>
                </PreviewRowScope>
                <SettingGroup title="Открытие документа">
                  <Toggle
                    label="Открывать микрофронт при нажатии"
                    disabled={!externalWidgets.length}
                    checked={Boolean(selectedNode.action)}
                    onChange={(checked) =>
                      updateNode({
                        action: checked
                          ? {
                              id: createId('action'),
                              label: 'Открыть документ',
                              kind: 'openWidget',
                              widgetId: externalWidgets[0]?.id ?? '',
                              props: {
                                file: { kind: 'binding', path: '$item' },
                                fileName: { kind: 'binding', path: '$item.name' },
                              },
                              events: { onClose: { type: 'close' } },
                            }
                          : undefined,
                      })
                    }
                  />
                  {selectedNode.action && (
                    <FieldErrorScope path="action">
                      <Input
                        label="Подпись действия документа"
                        path="label"
                        required
                        value={selectedNode.action.label}
                        onChange={(event) =>
                          updateNode({ action: { ...selectedNode.action!, label: event.target.value } })
                        }
                      />
                      <Select
                        label="Микрофронт документа"
                        path="widgetId"
                        value={selectedNode.action.widgetId}
                        options={externalWidgets.map((widget) => ({ value: widget.id, label: widget.name }))}
                        onChange={(event) =>
                          updateNode({ action: { ...selectedNode.action!, widgetId: event.target.value } })
                        }
                      />
                      <WidgetInvocationEditor
                        value={selectedNode.action}
                        widget={externalWidgets.find((widget) => widget.id === selectedNode.action?.widgetId)}
                        fields={catalog.fields}
                        onChange={({ props, events }) =>
                          updateNode({ action: { ...selectedNode.action!, props, events } })
                        }
                      />
                      <Hint>
                        Текущий документ доступен в параметрах как $item. Например, $item.id или $item.name.
                      </Hint>
                    </FieldErrorScope>
                  )}
                  {!selectedNode.action && (
                    <Hint>
                      При наличии ссылки запись откроется по ней. Для отдельного просмотра можно выбрать
                      зарегистрированный микрофронт.
                    </Hint>
                  )}
                </SettingGroup>
              </>
            )}
          </>
        )}
        <SettingGroup title="Условие отображения">
          <Toggle
            label="Показывать при условии"
            checked={Boolean(selectedNode.visibleWhen)}
            onChange={(checked) =>
              updateNode({
                visibleWhen: checked
                  ? { binding: catalog.fields[0]?.binding ?? '', operator: 'notEmpty' }
                  : undefined,
              })
            }
          />
          {selectedNode.visibleWhen && (
            <>
              <BindingPathInput
                label="Поле"
                value={selectedNode.visibleWhen.binding}
                fields={catalog.fields}
                onChange={(binding) => updateNode({ visibleWhen: { ...selectedNode.visibleWhen!, binding } })}
              />
              <Select
                label="Условие"
                value={selectedNode.visibleWhen.operator}
                options={[
                  { value: 'notEmpty', label: 'Значение заполнено' },
                  { value: 'equals', label: 'Значение равно' },
                ]}
                onChange={(event) =>
                  updateNode({
                    visibleWhen: {
                      ...selectedNode.visibleWhen!,
                      operator: event.target.value as 'notEmpty' | 'equals',
                    },
                  })
                }
              />
              {selectedNode.visibleWhen.operator === 'equals' && (
                <Input
                  label="Значение для сравнения"
                  value={selectedNode.visibleWhen.value ?? ''}
                  onChange={(event) =>
                    updateNode({ visibleWhen: { ...selectedNode.visibleWhen!, value: event.target.value } })
                  }
                />
              )}
              <p className="builder-property-copy">
                Это условие отображения. Права доступа к данным проверяет сервер.
              </p>
            </>
          )}
        </SettingGroup>
        <SettingGroup title="Управление блоком">
          <Select
            label="Переместить в контейнер"
            value=""
            options={[
              { value: '', label: 'Выберите вкладку или раздел' },
              ...nodeContainers(definition, selectedNode.id),
            ]}
            onChange={(event) => {
              const target = nodeContainers(definition, selectedNode.id).find(
                (item) => item.value === event.target.value,
              );
              if (target)
                drop(
                  { kind: 'node', nodeId: selectedNode.id, label: selectedNode.title },
                  { containerId: target.value, index: target.count },
                );
            }}
          />
          <div className="builder-inline-actions">
            <Button
              variant="secondary"
              size="sm"
              disabled={!located || located.index === 0}
              onClick={() => moveNode(-1)}
            >
              <ArrowUp size={14} />
              Выше
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!located || located.index === located.siblings.length - 1}
              onClick={() => moveNode(1)}
            >
              <ArrowDown size={14} />
              Ниже
            </Button>
          </div>
          <Button variant="secondary" size="sm" onClick={duplicate}>
            <Copy size={14} />
            Дублировать
          </Button>
          <Button variant="danger" size="sm" onClick={deleteNode}>
            <Trash2 size={14} />
            Удалить блок
          </Button>
        </SettingGroup>
      </>
    );
  };

  const propertyTitle = selectedFieldLocation
    ? selectedFieldLocation.field.label || 'Поле'
    : selectedId === '$header'
      ? 'Шапка карточки'
      : selectedId === '$footer'
        ? 'Нижняя панель'
        : selectedId === '$shell'
          ? 'Настройки сплита'
          : selectedTab
            ? 'Вкладка'
            : selectedNode
              ? nodeLabels[selectedNode.type]
              : 'Свойства';
  return (
    <EditorValidityProvider onValidityChange={onValidityChange}>
      <BuilderSelectionContext.Provider value={{ selectedId, select }}>
        <EditorDragProvider definition={definition} onDrop={drop}>
          <PreviewDataProvider data={data} onDataChange={onDataChange}>
            <div className={`builder ${mobilePanel ? `builder--show-${mobilePanel}` : ''}`}>
              <div className="builder-mobile-controls">
                <Button
                  variant={mobilePanel === 'tree' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setMobilePanel(mobilePanel === 'tree' ? null : 'tree')}
                >
                  <ListTree size={15} />
                  Структура
                </Button>
                <span>Предпросмотр</span>
                <Button
                  variant={mobilePanel === 'properties' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setMobilePanel(mobilePanel === 'properties' ? null : 'properties')}
                >
                  <SlidersHorizontal size={15} />
                  Свойства
                </Button>
              </div>
              <aside className="builder-structure" aria-label="Структура карточки">
                <div className="builder-panel-heading">
                  <div>
                    <h2>Структура</h2>
                    <p>Соберите карточку из блоков</p>
                  </div>
                  <IconButton label="Настройки сплита" onClick={() => select('$shell')}>
                    <Settings2 size={17} />
                  </IconButton>
                </div>
                <div className="builder-structure-content">
                  <div className="builder-tree-shell">
                    <button
                      type="button"
                      className={`builder-static-node ${selectedId === '$header' ? 'is-selected' : ''}`}
                      onClick={() => select('$header')}
                    >
                      <LayoutPanelTop size={16} />
                      <span>Шапка карточки</span>
                      <span className="builder-system-badge">Системная</span>
                    </button>
                    <div className="builder-tree-fields">
                      {definition.header.fields?.map((field) => (
                        <button
                          key={field.id}
                          type="button"
                          className={`builder-tree-field ${selectedId === field.id ? 'is-selected' : ''}`}
                          onClick={() => select(field.id)}
                        >
                          {field.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="builder-tree-group-label">
                    Содержимое <span>{definition.tabs.length} вкладки</span>
                  </div>
                  <div className="builder-tabs-tree">
                    {definition.tabs.map((tab) => (
                      <div key={tab.id} className="builder-tab-tree">
                        <NodeDropZone
                          target={{ containerId: tab.id, index: tab.nodes.length }}
                          label={`Во вкладку «${tab.title}»`}
                        >
                          <button
                            type="button"
                            className={`builder-tab-row ${selectedId === tab.id ? 'is-selected' : ''}`}
                            onClick={() => select(tab.id)}
                          >
                            <ChevronDown size={14} />
                            <span className="builder-tab-mark" />
                            <span>{tab.title || 'Без названия'}</span>
                            <span className="builder-tree-count">{tab.nodes.length}</span>
                          </button>
                        </NodeDropZone>
                        {tab.nodes.map((node, index) => renderNode(node, 0, tab.id, index))}
                        <NodeDropZone
                          target={{ containerId: tab.id, index: tab.nodes.length }}
                          label={`В конец вкладки «${tab.title}»`}
                        />
                        {tab.nodes.length === 0 && (
                          <button
                            type="button"
                            className="builder-tab-empty"
                            onClick={() => {
                              select(tab.id);
                              setPaletteOpen(true);
                            }}
                          >
                            <Plus size={14} />
                            Добавить первый блок
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="builder-add-tab">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const tab = { id: createId('tab'), title: 'Новая вкладка', nodes: [] };
                        mutate((copy) => {
                          copy.tabs.push(tab);
                        });
                        select(tab.id);
                      }}
                    >
                      <Plus size={14} />
                      Новая вкладка
                    </Button>
                  </div>
                  <div className="builder-tree-shell builder-footer-tree">
                    <button
                      type="button"
                      className={`builder-static-node ${selectedId === '$footer' ? 'is-selected' : ''}`}
                      onClick={() => select('$footer')}
                    >
                      <PanelBottom size={16} />
                      <span>Нижняя панель</span>
                      {!definition.footer.show && <span className="builder-system-badge">Скрыта</span>}
                    </button>
                  </div>
                </div>
                <div className="builder-add-area">
                  <Button
                    variant="primary"
                    onClick={() => setPaletteOpen(!paletteOpen)}
                    disabled={definition.tabs.length === 0}
                  >
                    <Plus size={16} />
                    Добавить блок
                  </Button>
                  <p>
                    {selectedNode?.type === 'section'
                      ? `В раздел «${selectedNode.title}»`
                      : `Во вкладку «${activeTab?.title ?? '—'}»`}
                  </p>
                </div>
                {paletteOpen && (
                  <div className="builder-palette">
                    <div className="builder-palette-heading">
                      <strong>Добавить блок</strong>
                      <IconButton label="Закрыть список блоков" onClick={() => setPaletteOpen(false)}>
                        <X size={15} />
                      </IconButton>
                    </div>
                    {(
                      [
                        'fields',
                        'section',
                        'text',
                        'table',
                        'callout',
                        'metrics',
                        'recordList',
                        'documents',
                        'widget',
                        'erpTable',
                        'badge',
                        'avatar',
                        'image',
                        'progress',
                        'divider',
                      ] as const
                    )
                      .filter(
                        (type) =>
                          catalog.nodeTypes.includes(type) &&
                          (catalog.authoringNodeTypes ?? catalog.nodeTypes).includes(type),
                      )
                      .map((type) => {
                        const Icon = nodeIcons[type];
                        const descriptions = {
                          fields: 'Реквизиты с подписями',
                          section: 'Группировка и сворачивание',
                          text: 'Длинный текст из данных',
                          table: 'Связанные записи',
                          widget: 'Микрофронт в карточке',
                          callout: 'Информация и предупреждения',
                          metrics: 'Суммы, ставки и пояснения',
                          recordList: 'Контрагенты и связанные сущности',
                          documents: 'Файлы, статусы и связанные ссылки',
                          erpTable: 'Метаданные и строки из ERP',
                          badge: 'Статус или короткая метка',
                          avatar: 'Имя и фотография',
                          image: 'Изображение по ссылке',
                          progress: 'Числовой прогресс',
                          divider: 'Визуальное разделение',
                        };
                        return (
                          <PaletteDragItem
                            type={type}
                            label={nodeLabels[type]}
                            key={type}
                            disabled={type === 'widget' && embeddedWidgets.length === 0}
                            onClick={() => addNode(type)}
                          >
                            <span className="builder-palette-icon">
                              <Icon size={18} />
                            </span>
                            <span>
                              <strong>{nodeLabels[type]}</strong>
                              <small>{descriptions[type]}</small>
                            </span>
                            <Plus size={14} />
                          </PaletteDragItem>
                        );
                      })}
                  </div>
                )}
                <details className="builder-issues" open={issues.some((issue) => issue.severity === 'error')}>
                  <summary>
                    <CircleAlert size={15} />
                    <span>{issues.length === 0 ? 'Проверка пройдена' : `Замечания · ${issues.length}`}</span>
                    <ChevronDown size={14} />
                  </summary>
                  {issues.length === 0 ? (
                    <p>Структура и привязки корректны.</p>
                  ) : (
                    <div className="builder-issues-list">
                      {issues.map((issue, index) => (
                        <button
                          key={`${issue.path}-${index}`}
                          type="button"
                          className={`builder-issue builder-issue--${issue.severity}`}
                          onClick={() => {
                            select(issueTarget(issue));
                            setMobilePanel('properties');
                          }}
                        >
                          <span className="builder-issue-dot" />
                          <span>{issue.message}</span>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                    </div>
                  )}
                </details>
              </aside>
              <main className="builder-preview" aria-label="Предпросмотр карточки">
                {children}
                <div className="builder-drag-status" role="status">
                  {dragMessage}
                </div>
              </main>
              <aside className="builder-properties" aria-label="Свойства выбранного элемента">
                <div className="builder-panel-heading">
                  <div>
                    <h2>{propertyTitle}</h2>
                  </div>
                  <span className="builder-properties-icon">
                    <SlidersHorizontal size={17} />
                  </span>
                </div>
                <div className="builder-properties-content">
                  {selectedIssues.length > 0 && (
                    <div className="builder-selected-issues">
                      {selectedIssues.map((issue, index) => (
                        <p key={index}>
                          <CircleAlert size={14} />
                          {issue.message}
                        </p>
                      ))}
                    </div>
                  )}
                  <FieldErrorScope issues={issues} path={located?.path ?? '$'}>
                    {renderProperties()}
                  </FieldErrorScope>
                </div>
              </aside>
            </div>
          </PreviewDataProvider>
        </EditorDragProvider>
      </BuilderSelectionContext.Provider>
    </EditorValidityProvider>
  );
}
