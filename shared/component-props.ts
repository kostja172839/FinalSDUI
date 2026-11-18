import type { ContentNode, JsonValue } from './model';
import { isJsonValue, isSafeBinding, readPath } from './values';

export interface ComponentPropDescriptor {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'json';
  values?: readonly (string | number)[];
  min?: number;
  max?: number;
  description?: string;
  defaultValue?: JsonValue;
}
export interface ComponentPropIssue {
  key: string;
  message: string;
}
/** Effective presentation values. Source declarations stay in node.props for editing. */
export interface ResolvedComponentOptions {
  showTitle?: boolean;
  emptyText?: string;
  view?: string;
  size?: string;
  transparent?: boolean;
  pilled?: boolean;
  clear?: boolean;
  customText?: string;
  status?: 'active' | 'inactive';
  isScalable?: boolean;
  focused?: boolean;
  statusLabels?: { active: string; inactive: string };
  fitSize?: number;
  customBorderRadius?: number;
  hasExtra?: boolean;
  extraType?: 'badge' | 'counter';
  extraPlacement?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  badgeView?: string;
  counterView?: string;
  count?: number;
  extraText?: string;
  ratio?: string;
  customRatio?: number;
  srcSet?: string;
  sizes?: string;
  progressSize?: string;
  label?: string;
  caption?: string;
  hasValue?: boolean;
  labelPlacement?: 'top' | 'left' | 'none';
  labelTextPlacement?: 'left' | 'right' | 'none';
  valuePlacement?: 'top' | 'right' | 'none';
  valueAlign?: 'start' | 'center' | 'end';
  orientation?: 'horizontal' | 'vertical';
  length?: string | number;
  height?: number;
  maxItems?: number;
  statusView?: string;
  statusSize?: string;
  statusTransparent?: boolean;
  statusPilled?: boolean;
  statusClear?: boolean;
  linkTarget?: 'self' | 'blank';
  showIcon?: boolean;
  maxLines?: number;
  defaultExpanded?: boolean;
  disabled?: boolean;
  defaultIconContent?: 'clear' | 'arrow' | 'sign' | 'chevron';
  defaultIconPlacement?: 'left' | 'right';
  alignWithTitle?: boolean;
}
const badgeViews = ['default', 'accent', 'positive', 'warning', 'negative', 'dark', 'light'];
const progressViews = [
  'default',
  'secondary',
  'primary',
  'accent',
  'info',
  'success',
  'positive',
  'warning',
  'error',
  'negative',
];
const text = (name: string, label: string, defaultValue = ''): ComponentPropDescriptor => ({
  name,
  label,
  type: 'text',
  defaultValue,
});
const bool = (name: string, label: string, defaultValue = true): ComponentPropDescriptor => ({
  name,
  label,
  type: 'boolean',
  defaultValue,
});
const number = (
  name: string,
  label: string,
  min: number,
  max: number,
  defaultValue: number,
): ComponentPropDescriptor => ({ name, label, type: 'number', min, max, defaultValue });
const choice = (
  name: string,
  label: string,
  values: readonly string[],
  defaultValue: string,
): ComponentPropDescriptor => ({ name, label, type: 'text', values, defaultValue });
const columns: ComponentPropDescriptor = {
  name: 'columns',
  label: 'Количество колонок',
  type: 'number',
  values: [1, 2, 3],
  defaultValue: 2,
};
const common = [
  text('title', 'Заголовок блока', 'Заголовок'),
  bool('showTitle', 'Показывать заголовок'),
  text('emptyText', 'Текст при отсутствии данных', 'Нет данных'),
];
const list = [
  number('maxItems', 'Максимум записей', 1, 500, 50),
  choice('linkTarget', 'Открывать ссылки', ['self', 'blank'], 'blank'),
];
const specific: Partial<Record<ContentNode['type'], ComponentPropDescriptor[]>> = {
  fields: [columns],
  section: [
    choice('appearance', 'Оформление раздела', ['plain', 'divider', 'outlined'], 'divider'),
    bool('collapsible', 'Можно свернуть'),
    bool('defaultOpen', 'Развёрнут при открытии'),
    choice('size', 'Размер раздела', ['xs', 's', 'm', 'l', 'h2', 'h3', 'h4', 'h5'], 's'),
    bool('disabled', 'Отключить сворачивание', false),
    choice('defaultIconContent', 'Иконка раскрытия', ['clear', 'arrow', 'sign', 'chevron'], 'chevron'),
    choice('defaultIconPlacement', 'Положение иконки', ['left', 'right'], 'left'),
    bool('alignWithTitle', 'Выравнивать содержимое по заголовку', false),
  ],
  text: [
    bool('collapsible', 'Можно свернуть описание'),
    number('maxLines', 'Строк в свёрнутом описании', 1, 100, 6),
    bool('defaultExpanded', 'Описание развёрнуто при открытии', false),
  ],
  callout: [
    choice('tone', 'Тип сообщения', ['info', 'success', 'warning', 'error'], 'info'),
    bool('showIcon', 'Показывать иконку'),
  ],
  metrics: [columns],
  recordList: [columns, ...list],
  documents: [
    ...list,
    choice('statusView', 'Вид статуса документа', badgeViews, 'accent'),
    choice('statusSize', 'Размер статуса документа', ['xs', 's', 'm', 'l'], 'xs'),
    bool('statusTransparent', 'Прозрачный статус документа'),
    bool('statusPilled', 'Скруглённый статус документа', false),
    bool('statusClear', 'Статус без подложки', false),
  ],
  badge: [
    choice('view', 'Вид метки', badgeViews, 'default'),
    choice('size', 'Размер метки', ['xs', 's', 'm', 'l'], 's'),
    bool('transparent', 'Прозрачная метка'),
    bool('pilled', 'Скруглённая метка', false),
    bool('clear', 'Метка без подложки', false),
  ],
  avatar: [
    choice('size', 'Размер аватара', ['s', 'm', 'l', 'xxl', 'fit'], 'm'),
    number('fitSize', 'Размер области для fit, px', 24, 256, 64),
    text('customText', 'Текст вместо инициалов'),
    choice('status', 'Статус пользователя', ['active', 'inactive'], 'active'),
    bool('isScalable', 'Увеличивать при наведении', false),
    bool('focused', 'Выделить аватар', false),
    {
      name: 'statusLabels',
      label: 'Подписи статусов для экранного диктора',
      type: 'json',
      defaultValue: { active: 'Активен', inactive: 'Неактивен' },
    },
    number('customBorderRadius', 'Скругление для fit, px', 0, 128, 16),
    bool('hasExtra', 'Дополнительная метка', false),
    choice('extraType', 'Тип дополнительной метки', ['badge', 'counter'], 'badge'),
    choice(
      'extraPlacement',
      'Расположение дополнительной метки',
      ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      'bottom-right',
    ),
    choice('badgeView', 'Вид дополнительной метки', badgeViews, 'default'),
    choice('counterView', 'Вид счётчика', badgeViews, 'default'),
    number('count', 'Значение счётчика', 1, 999999, 1),
    text('extraText', 'Текст дополнительной метки'),
  ],
  image: [
    choice('fit', 'Масштаб изображения', ['contain', 'cover'], 'contain'),
    number('height', 'Высота изображения, px', 80, 1200, 240),
    choice('ratio', 'Соотношение сторон', ['1/1', '3/4', '4/3', '9/16', '16/9', '1/2', '2/1'], '16/9'),
    number('customRatio', 'Высота относительно ширины, %', 1, 400, 56.25),
    text('srcSet', 'Варианты изображения', '/images/example.png 1x'),
    text('sizes', 'Размеры для адаптивной загрузки', '100vw'),
  ],
  progress: [
    number('max', 'Максимальное значение', 0.000001, 1e15, 100),
    bool('showValue', 'Показывать значение'),
    bool('hasValue', 'Показывать значение (FinAI)'),
    choice('view', 'Вид прогресса', progressViews, 'accent'),
    choice('size', 'Размер прогресса', ['s', 'm', 'l'], 's'),
    choice('progressSize', 'Толщина линии', ['2', '4', '6', '8'], '4'),
    text('label', 'Метка прогресса'),
    text('caption', 'Подпись прогресса'),
    choice('labelPlacement', 'Положение метки', ['top', 'left', 'none'], 'top'),
    choice('labelTextPlacement', 'Положение текста метки', ['left', 'right', 'none'], 'right'),
    choice('valuePlacement', 'Положение значения', ['top', 'right', 'none'], 'right'),
    choice('valueAlign', 'Выравнивание значения', ['start', 'center', 'end'], 'start'),
  ],
  divider: [
    text('label', 'Подпись разделителя'),
    choice('orientation', 'Направление разделителя', ['horizontal', 'vertical'], 'horizontal'),
    choice('view', 'Вид разделителя', ['default', 'dark', 'light', 'inverse'], 'default'),
    { name: 'length', label: 'Длина разделителя', type: 'json', defaultValue: '100%' },
    number('height', 'Высота вертикального разделителя, px', 24, 1200, 120),
  ],
  table: [],
};

export function getComponentPropDescriptors(type: ContentNode['type']): ComponentPropDescriptor[] {
  return type === 'widget' || type === 'erpTable' || type === 'table'
    ? []
    : [...common, ...(specific[type] ?? [])];
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function safeImageUrl(value: string): boolean {
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value)) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
function valueProblem(descriptor: ComponentPropDescriptor, value: unknown): string | undefined {
  if (!isJsonValue(value)) return 'Укажите безопасное значение JSON.';
  if (descriptor.type === 'text' && (typeof value !== 'string' || value.length > 2000))
    return 'Ожидается текст до 2000 символов.';
  if (descriptor.type === 'boolean' && typeof value !== 'boolean') return 'Ожидается логическое значение.';
  if (
    descriptor.type === 'number' &&
    (typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (descriptor.min !== undefined && value < descriptor.min) ||
      (descriptor.max !== undefined && value > descriptor.max))
  )
    return `Ожидается число от ${descriptor.min} до ${descriptor.max}.`;
  if (descriptor.values && !descriptor.values.includes(value as string | number))
    return `Выберите одно из значений: ${descriptor.values.join(', ')}.`;
  if (
    ['maxItems', 'maxLines', 'count', 'fitSize'].includes(descriptor.name) &&
    typeof value === 'number' &&
    !Number.isInteger(value)
  )
    return 'Ожидается целое число.';
  if (
    descriptor.name === 'statusLabels' &&
    (!record(value) ||
      Object.keys(value).some((key) => !['active', 'inactive'].includes(key)) ||
      typeof value.active !== 'string' ||
      typeof value.inactive !== 'string' ||
      value.active.length > 200 ||
      value.inactive.length > 200)
  )
    return 'Укажите объект с текстовыми active и inactive (до 200 символов).';
  if (
    descriptor.name === 'length' &&
    !(
      (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100) ||
      (typeof value === 'string' &&
        /^(?:\d+(?:\.\d+)?)(?:px|rem|%)$/.test(value) &&
        parseFloat(value) > 0 &&
        parseFloat(value) <= (value.endsWith('%') ? 100 : 2000))
    )
  )
    return 'Укажите длину от 1 до 100 процентов или положительное значение px/rem до 2000.';
  if (
    descriptor.name === 'srcSet' &&
    typeof value === 'string' &&
    value.trim() &&
    !value.split(',').every((item) => {
      const parts = item.trim().split(/\s+/);
      return (
        parts.length <= 2 &&
        safeImageUrl(parts[0]) &&
        (parts.length === 1 || (/^(?:\d+(?:\.\d+)?)(?:w|x)$/.test(parts[1]) && parseFloat(parts[1]) > 0))
      );
    })
  )
    return 'Укажите HTTP/HTTPS адреса или пути от / с необязательной плотностью 1x или шириной 640w.';
  if (
    descriptor.name === 'sizes' &&
    typeof value === 'string' &&
    (value.length > 500 || !/^[\w\s.,()%:+*/-]*$/.test(value))
  )
    return 'Укажите безопасное выражение sizes, например (max-width: 680px) 100vw, 50vw.';
}

function evaluate(type: ContentNode['type'], props: unknown, data?: Record<string, unknown>) {
  const issues: ComponentPropIssue[] = [];
  const values: Record<string, JsonValue> = {};
  if (type === 'widget' || type === 'erpTable' || props === undefined) return { values, issues };
  if (!record(props))
    return {
      values,
      issues: [{ key: '', message: 'Параметры компонента должны быть объектом источников значений.' }],
    };
  if (Object.keys(props).length > 100)
    issues.push({ key: '', message: 'Поддерживается до 100 параметров компонента.' });
  const descriptors = getComponentPropDescriptors(type);
  for (const [key, source] of Object.entries(props).slice(0, 100)) {
    const descriptor = descriptors.find((item) => item.name === key);
    if (!descriptor) {
      issues.push({
        key,
        message: 'Параметр не поддерживается этим компонентом. Выберите параметр из его контракта.',
      });
      continue;
    }
    if (
      !record(source) ||
      (source.kind !== 'literal' && source.kind !== 'binding') ||
      Object.keys(source).some(
        (name) => !['kind', source.kind === 'literal' ? 'value' : 'path'].includes(name),
      )
    ) {
      issues.push({ key, message: 'Укажите источник literal/value или binding/path.' });
      continue;
    }
    let value: unknown;
    if (source.kind === 'binding') {
      if (typeof source.path !== 'string' || !isSafeBinding(source.path)) {
        issues.push({ key, message: 'Укажите безопасный путь к данным через точку.' });
        continue;
      }
      if (data === undefined) continue;
      value = readPath(data, source.path);
      if (value === undefined) {
        issues.push({ key, message: `Для параметра «${descriptor.label}» нет значения по указанному пути.` });
        continue;
      }
    } else value = source.value;
    const problem = valueProblem(descriptor, value);
    if (problem) issues.push({ key, message: `${descriptor.label}: ${problem}` });
    else values[key] = structuredClone(value as JsonValue);
  }
  return { values, issues };
}
export function validateComponentProps(
  type: ContentNode['type'],
  props: unknown,
  data?: Record<string, unknown>,
): ComponentPropIssue[] {
  return evaluate(type, props, data).issues;
}
export function resolveComponentNode<T extends ContentNode>(
  node: T,
  data: Record<string, unknown>,
): { node: T & ResolvedComponentOptions; props: Record<string, JsonValue>; issues: ComponentPropIssue[] } {
  const result = evaluate(node.type, node.props, data);
  return {
    node: { ...node, ...result.values } as T & ResolvedComponentOptions,
    props: result.values,
    issues: result.issues,
  };
}
