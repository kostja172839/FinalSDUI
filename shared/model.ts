/** Stable public SDUI v1 contract. UI-kit props never cross this interface. */
export type FieldFormat = 'text' | 'date' | 'money' | 'number' | 'status' | 'person' | 'link';
export type PreviewScenario = 'normal' | 'long' | 'empty' | 'error';
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
/** A catalog is an authoring aid; paths refer to any data supplied by the backend. */
export type ValueSource = { kind: 'binding'; path: string } | { kind: 'literal'; value: JsonValue };
export type WidgetEventBinding = { type: 'close' } | { type: 'refresh' } | { type: 'host'; name: string };
export interface WidgetInvocation {
  props?: Record<string, ValueSource>;
  events?: Record<string, WidgetEventBinding>;
}
export interface WidgetInput {
  data: Record<string, unknown>;
  events?: Record<string, WidgetEventBinding>;
}
export type WidgetRuntimeEvent =
  | { type: 'dataChanged' }
  | { type: 'close' }
  | { type: 'host'; name: string; args: unknown[] }
  | { type: 'error'; message: string };
export interface FieldDefinition {
  id: string;
  label: string;
  binding: string;
  source?: ValueSource;
  format: FieldFormat;
  validation?: FieldValidation;
}
export interface FieldValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}
export interface DataValidationIssue {
  nodeId: string;
  fieldId?: string;
  path: string;
  message: string;
  itemIndex?: number;
  dataPath?: string;
}
export interface VisibilityRule {
  binding: string;
  operator: 'equals' | 'notEmpty';
  value?: string;
}
export interface NodeBase {
  id: string;
  title: string;
  visibleWhen?: VisibilityRule;
}
export interface FieldsNode extends NodeBase {
  type: 'fields';
  columns: 1 | 2 | 3;
  fields: FieldDefinition[];
}
export interface SectionNode extends NodeBase {
  type: 'section';
  collapsible: boolean;
  defaultOpen: boolean;
  children: ContentNode[];
}
export interface TextNode extends NodeBase {
  type: 'text';
  binding: string;
  source?: ValueSource;
  collapsible: boolean;
}
export interface TableNode extends NodeBase {
  type: 'table';
  binding: string;
  source?: ValueSource;
  columns: FieldDefinition[];
  searchable: boolean;
  pageSize: number;
}
export interface WidgetNode extends NodeBase, WidgetInvocation {
  type: 'widget';
  widgetId: string;
  height: number;
}
export interface CalloutNode extends NodeBase {
  type: 'callout';
  binding: string;
  source?: ValueSource;
  tone: 'info' | 'success' | 'warning' | 'error';
}
export interface MetricsNode extends NodeBase {
  type: 'metrics';
  columns: 1 | 2 | 3;
  items: (FieldDefinition & { suffix?: string })[];
}
export interface RecordListNode extends NodeBase {
  type: 'recordList';
  binding: string;
  source?: ValueSource;
  itemTitle: ValueSource;
  itemSubtitle?: ValueSource;
  itemHref?: ValueSource;
  columns: 1 | 2 | 3;
  fields: FieldDefinition[];
}
export interface DocumentsNode extends NodeBase {
  type: 'documents';
  binding: string;
  source?: ValueSource;
  itemTitle: ValueSource;
  itemDescription?: ValueSource;
  itemStatus?: ValueSource;
  itemSize?: ValueSource;
  itemHref?: ValueSource;
  action?: SplitAction;
}
export type ContentNode =
  | FieldsNode
  | SectionNode
  | TextNode
  | TableNode
  | WidgetNode
  | CalloutNode
  | MetricsNode
  | RecordListNode
  | DocumentsNode;
export interface TabDefinition {
  id: string;
  title: string;
  nodes: ContentNode[];
}
export interface SplitAction extends WidgetInvocation {
  id: string;
  label: string;
  kind: 'openWidget';
  widgetId: string;
}
/** A button binds to a known client capability; executable code stays in the host. */
export type ButtonAction =
  | ({ kind: 'openWidget'; widgetId: string } & WidgetInvocation)
  | { kind: 'host'; actionId: string; params?: Record<string, ValueSource> }
  | { kind: 'refresh' }
  | { kind: 'close' };
export interface FooterButton {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  action: ButtonAction;
}
export interface SplitTemplate {
  schemaVersion: 1;
  id: string;
  name: string;
  entityType: string;
  header: {
    titleBinding: string;
    subtitleBinding: string;
    statusBinding: string;
    titleSource?: ValueSource;
    subtitleSource?: ValueSource;
    statusSource?: ValueSource;
    showStatus: boolean;
    fields?: FieldDefinition[];
    actions?: SplitAction[];
  };
  shell: { defaultWidth: number; minWidth: number; maxWidthPercent: number };
  tabs: TabDefinition[];
  footer: {
    show: boolean;
    text: string;
    widgetId?: string;
    actionLabel?: string;
    actions?: SplitAction[];
    buttons?: FooterButton[];
  };
}
export interface ValidationIssue {
  severity: 'error' | 'warning';
  nodeId?: string;
  path: string;
  message: string;
}
export interface PublishedVersion {
  revision: number;
  createdAt: string;
  definition: SplitTemplate;
}
export interface TemplateRecord {
  id: string;
  draft: SplitTemplate;
  draftVersion: number;
  updatedAt: string;
  versions: PublishedVersion[];
  activeRevision: number | null;
}
export interface CatalogField {
  binding: string;
  label: string;
  group: string;
  type: FieldFormat;
  description: string;
  example: string;
}
export interface DatasetDescriptor {
  binding: string;
  label: string;
  columns: CatalogField[];
}
export interface WidgetDescriptor {
  id: string;
  name: string;
  description: string;
  mode: 'embedded' | 'external';
  version: string;
  connectorName?: string;
  inputs?: {
    name: string;
    label: string;
    type: 'text' | 'number' | 'boolean' | 'json';
    description?: string;
    required?: boolean;
    defaultValue?: JsonValue;
  }[];
  events?: { name: string; label: string; description?: string }[];
}
export interface Catalog {
  fields: CatalogField[];
  datasets: DatasetDescriptor[];
  widgets: WidgetDescriptor[];
  nodeTypes: string[];
  actions?: HostActionDescriptor[];
}
export interface HostActionDescriptor {
  id: string;
  name: string;
  description: string;
  inputs?: WidgetDescriptor['inputs'];
}
export interface EntitySummary {
  id: string;
  title: string;
  type: string;
  status: string;
  inventoryNumber: string;
}
export interface BlockError {
  nodeId: string;
  message: string;
}
export interface ResolvedSplit {
  schemaVersion: 1;
  instanceId: string;
  templateId: string;
  templateRevision: number | 'draft';
  entityId: string;
  entityVersion: string;
  definition: SplitTemplate;
  data: Record<string, unknown>;
  errors: BlockError[];
}
export interface WidgetContext {
  entityId: string;
  entityType: string;
  instanceId: string;
  locale: string;
}
export interface OpenWidgetIntent {
  type: 'openWidget';
  widgetId: string;
  context: WidgetContext;
  correlationId: string;
  input?: WidgetInput;
}
export interface HostActionIntent {
  type: 'hostAction';
  actionId: string;
  context: WidgetContext;
  correlationId: string;
  params: Record<string, unknown>;
}
export type HostActionHandler = (intent: HostActionIntent) => void | Promise<void>;
export type HostActionRegistry = Record<string, HostActionHandler>;
export interface WidgetResult {
  correlationId: string;
  status: 'completed' | 'cancelled';
  dataChanged?: boolean;
}
export interface WidgetMount {
  update?: (context: WidgetContext, input?: WidgetInput) => void;
  unmount: () => void;
}
export interface WidgetAdapter {
  mount: (
    container: HTMLElement,
    context: WidgetContext,
    emit: (event: WidgetRuntimeEvent) => void,
    input?: WidgetInput,
  ) => WidgetMount | Promise<WidgetMount>;
}
