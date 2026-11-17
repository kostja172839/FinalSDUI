import { catalog as demoCatalog } from './catalog';
import type { Catalog, CatalogField, FieldDefinition, ValidationIssue } from './model';
import { isJsonValue, isSafeBinding, readPath, resolveValue } from './values';
import { validateFieldValue } from './data-validation';

export interface ValidationCapabilities {
  nodeTypes?: string[];
  widgetIds?: string[];
  actionIds?: string[];
  catalog?: Catalog;
}
const formats = ['text', 'date', 'money', 'number', 'status', 'person', 'link'];
const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function safePath(value: unknown, path: string): unknown {
  return readPath(value, path);
}

/** Structural and semantic validation is shared by authoring and runtime compilation. */
export function validateTemplate(
  value: unknown,
  capabilities: ValidationCapabilities = {},
): ValidationIssue[] {
  const catalog = capabilities.catalog ?? demoCatalog;
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const seen = new WeakSet<object>();
  let nodeCount = 0;
  const add = (path: string, message: string, nodeId?: string, severity: 'error' | 'warning' = 'error') =>
    issues.push({ severity, path, message, ...(nodeId ? { nodeId } : {}) });
  const string = (v: unknown, path: string, label: string, nodeId?: string) => {
    if (typeof v !== 'string' || !v.trim()) {
      add(path, `${label}: укажите непустой текст.`, nodeId);
      return false;
    }
    if (v.length > 2000) {
      add(path, `${label}: длина ограничена 2000 символами.`, nodeId);
      return false;
    }
    return true;
  };
  const id = (v: unknown, path: string, nodeId?: string) => {
    if (!string(v, path, 'ID', nodeId)) return;
    if (typeof v !== 'string') return;
    if (unsafe.has(v) || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(v))
      add(path, 'ID должен состоять из латиницы, цифр, дефиса, точки или подчёркивания.', nodeId);
    if (ids.has(v)) add(path, `ID «${v}» уже используется. Задайте уникальный ID.`, nodeId);
    ids.add(v);
  };
  const binding = (
    v: unknown,
    path: string,
    fields: CatalogField[],
    nodeId?: string,
  ): CatalogField | undefined => {
    if (!string(v, path, 'Источник данных', nodeId)) return;
    if (typeof v !== 'string') return;
    if (!isSafeBinding(v)) {
      add(
        path,
        'Недопустимый путь к данным. Укажите путь через точку, например response.customer.name. Выражения и служебные свойства запрещены.',
        nodeId,
      );
      return;
    }
    const source = fields.find((f) => f.binding === v);
    return source;
  };
  const valueSource = (
    v: unknown,
    legacy: unknown,
    path: string,
    fields: CatalogField[],
    nodeId?: string,
  ) => {
    if (v === undefined) {
      binding(
        legacy,
        path.replace(/Source$|\.source$/, (suffix) => (suffix === '.source' ? '.binding' : 'Binding')),
        fields,
        nodeId,
      );
      return;
    }
    if (!record(v)) {
      add(path, 'Выберите источник: данные API или заданное значение.', nodeId);
      return;
    }
    if (v.kind === 'binding') {
      binding(v.path, `${path}.path`, fields, nodeId);
      if (Object.keys(v).some((key) => !['kind', 'path'].includes(key)))
        add(path, 'Источник данных содержит неизвестные настройки.', nodeId);
    } else if (v.kind === 'literal') {
      if (!Object.prototype.hasOwnProperty.call(v, 'value') || !isJsonValue(v.value))
        add(
          `${path}.value`,
          'Укажите JSON-значение без функций, служебных свойств и циклических ссылок (до 24 уровней).',
          nodeId,
        );
      if (Object.keys(v).some((key) => !['kind', 'value'].includes(key)))
        add(path, 'Заданное значение содержит неизвестные настройки.', nodeId);
    } else add(`${path}.kind`, 'Поддерживаются данные API (binding) и заданное значение (literal).', nodeId);
  };
  const parameters = (value: unknown, path: string, nodeId?: string) => {
    if (value !== undefined) {
      if (!record(value)) add(path, 'Параметры должны быть объектом.', nodeId);
      else {
        const names = Object.keys(value);
        if (names.length > 100) add(path, 'Поддерживается до 100 настроенных параметров.', nodeId);
        for (const [name, source] of Object.entries(value).slice(0, 100)) {
          if (!isSafeBinding(name)) add(`${path}.${name}`, 'Недопустимое имя параметра.', nodeId);
          valueSource(source, undefined, `${path}.${name}`, [], nodeId);
          if (names.some((other) => other !== name && name.startsWith(`${other}.`)))
            add(
              `${path}.${name}`,
              'Укажите либо весь объект параметра, либо его вложенные свойства.',
              nodeId,
            );
        }
      }
    }
  };
  const invocation = (v: Record<string, unknown>, path: string, nodeId?: string) => {
    parameters(v.props, `${path}.props`, nodeId);
    if (v.events !== undefined) {
      if (!record(v.events)) add(`${path}.events`, 'Обработчики виджета должны быть объектом.', nodeId);
      else {
        if (Object.keys(v.events).length > 100)
          add(`${path}.events`, 'Виджет поддерживает до 100 обработчиков.', nodeId);
        for (const [name, event] of Object.entries(v.events).slice(0, 100)) {
          const p = `${path}.events.${name}`;
          if (!isSafeBinding(name)) add(p, 'Недопустимый путь обработчика.', nodeId);
          if (!record(event) || !['close', 'refresh', 'host'].includes(String(event.type))) {
            add(p, 'Выберите действие обработчика: закрытие, обновление или действие хоста.', nodeId);
            continue;
          }
          if (event.type === 'host') {
            string(event.name, `${p}.name`, 'Имя действия хоста', nodeId);
            if (typeof event.name === 'string' && !isSafeBinding(event.name))
              add(`${p}.name`, 'Недопустимое имя действия хоста.', nodeId);
          }
          if (
            Object.keys(event).some(
              (key) => !['type', ...(event.type === 'host' ? ['name'] : [])].includes(key),
            )
          )
            add(
              p,
              'Обработчик содержит неизвестные настройки. Код обработчика регистрируется в хосте.',
              nodeId,
            );
          if (Object.keys(v.events).some((other) => other !== name && name.startsWith(`${other}.`)))
            add(p, 'Пути обработчиков не должны перекрывать друг друга.', nodeId);
          if (
            record(v.props) &&
            Object.keys(v.props).some((prop) => prop === name || prop.startsWith(`${name}.`))
          )
            add(p, 'Параметр и обработчик не должны использовать один путь.', nodeId);
        }
      }
    }
  };
  const field = (v: unknown, path: string, fields: CatalogField[], nodeId?: string) => {
    if (!record(v)) {
      add(path, 'Ожидается описание поля.', nodeId);
      return;
    }
    id(v.id, `${path}.id`, nodeId);
    string(v.label, `${path}.label`, 'Подпись', nodeId);
    valueSource(v.source, v.binding, `${path}.source`, fields, nodeId);
    if (!formats.includes(String(v.format)))
      add(`${path}.format`, 'Выберите поддерживаемый формат значения.', nodeId);
    if (v.validation !== undefined) {
      const rules = v.validation;
      if (!record(rules)) add(`${path}.validation`, 'Правила проверки должны быть объектом.', nodeId);
      else {
        for (const key of Object.keys(rules))
          if (!['required', 'minLength', 'maxLength', 'min', 'max'].includes(key))
            add(`${path}.validation.${key}`, 'Неизвестное правило проверки.', nodeId);
        if (rules.required !== undefined && typeof rules.required !== 'boolean')
          add(`${path}.validation.required`, 'Обязательность должна быть логическим значением.', nodeId);
        for (const key of ['minLength', 'maxLength']) {
          if (
            rules[key] !== undefined &&
            (typeof rules[key] !== 'number' ||
              !Number.isInteger(rules[key]) ||
              Number(rules[key]) < 0 ||
              Number(rules[key]) > 1_000_000)
          )
            add(`${path}.validation.${key}`, 'Длина должна быть целым числом от 0 до 1 000 000.', nodeId);
        }
        for (const key of ['min', 'max']) {
          if (rules[key] !== undefined && (typeof rules[key] !== 'number' || !Number.isFinite(rules[key])))
            add(`${path}.validation.${key}`, 'Граница должна быть конечным числом.', nodeId);
          else if (rules[key] !== undefined && !['number', 'money'].includes(String(v.format)))
            add(
              `${path}.validation.${key}`,
              'Числовые границы применяются к формату «Число» или «Сумма».',
              nodeId,
            );
        }
        if (
          typeof rules.minLength === 'number' &&
          typeof rules.maxLength === 'number' &&
          rules.minLength > rules.maxLength
        )
          add(
            `${path}.validation.maxLength`,
            'Максимальная длина должна быть не меньше минимальной.',
            nodeId,
          );
        if (typeof rules.min === 'number' && typeof rules.max === 'number' && rules.min > rules.max)
          add(`${path}.validation.max`, 'Максимум должен быть не меньше минимума.', nodeId);
      }
    }
    if (record(v.source) && v.source.kind === 'literal' && formats.includes(String(v.format)))
      validateFieldValue(v as unknown as FieldDefinition, v.source.value).forEach((message) =>
        add(`${path}.source.value`, message, nodeId),
      );
  };
  const boolean = (v: unknown, path: string, nodeId?: string) => {
    if (typeof v !== 'boolean') add(path, 'Ожидается логическое значение.', nodeId);
  };
  const list = (v: unknown, path: string, min: number, max: number, nodeId?: string): unknown[] => {
    if (!Array.isArray(v)) {
      add(path, 'Ожидается список.', nodeId);
      return [];
    }
    if (v.length < min || v.length > max)
      add(path, `Количество элементов должно быть от ${min} до ${max}.`, nodeId);
    return v.slice(0, max);
  };
  const nodes = (v: unknown, path: string, depth: number) => {
    for (const [index, n] of list(v, path, 0, 100).entries()) {
      const p = `${path}[${index}]`;
      if (!record(n)) {
        add(p, 'Ожидается описание блока.');
        continue;
      }
      const nodeId = typeof n.id === 'string' ? n.id : undefined;
      if (seen.has(n)) {
        add(p, 'Обнаружена циклическая структура.', nodeId);
        continue;
      }
      seen.add(n);
      if (depth > 8 || ++nodeCount > 200) {
        add(p, 'Превышен предел: 8 уровней вложенности или 200 блоков.', nodeId);
        continue;
      }
      id(n.id, `${p}.id`, nodeId);
      string(n.title, `${p}.title`, 'Название блока', nodeId);
      if (!catalog.nodeTypes.includes(String(n.type))) {
        add(`${p}.type`, `Тип блока «${String(n.type)}» не поддерживается.`, nodeId);
        continue;
      }
      if (capabilities.nodeTypes && !capabilities.nodeTypes.includes(String(n.type)))
        add(`${p}.type`, `Клиент не поддерживает блок «${String(n.type)}».`, nodeId);
      if (n.visibleWhen !== undefined) {
        if (!record(n.visibleWhen)) add(`${p}.visibleWhen`, 'Ожидается условие видимости.', nodeId);
        else {
          binding(n.visibleWhen.binding, `${p}.visibleWhen.binding`, catalog.fields, nodeId);
          if (!['equals', 'notEmpty'].includes(String(n.visibleWhen.operator)))
            add(`${p}.visibleWhen.operator`, 'Поддерживаются условия «равно» и «заполнено».', nodeId);
          if (n.visibleWhen.operator === 'equals' && typeof n.visibleWhen.value !== 'string')
            add(`${p}.visibleWhen.value`, 'Укажите значение для сравнения.', nodeId);
        }
      }
      if (n.type === 'fields') {
        if (![1, 2, 3].includes(Number(n.columns)) || typeof n.columns !== 'number')
          add(`${p}.columns`, 'Выберите от одной до трёх колонок.', nodeId);
        list(n.fields, `${p}.fields`, 1, 50, nodeId).forEach((f, j) =>
          field(f, `${p}.fields[${j}]`, catalog.fields, nodeId),
        );
        if (n.columns === 3)
          add(
            `${p}.columns`,
            'Три колонки требуют широкого сплита. Проверьте узкий режим в предпросмотре.',
            nodeId,
            'warning',
          );
      } else if (n.type === 'section') {
        boolean(n.collapsible, `${p}.collapsible`, nodeId);
        boolean(n.defaultOpen, `${p}.defaultOpen`, nodeId);
        nodes(n.children, `${p}.children`, depth + 1);
        if (Array.isArray(n.children) && n.children.length === 0)
          add(`${p}.children`, 'Раздел пока пуст. Добавьте блоки.', nodeId, 'warning');
      } else if (n.type === 'text') {
        valueSource(n.source, n.binding, `${p}.source`, catalog.fields, nodeId);
        boolean(n.collapsible, `${p}.collapsible`, nodeId);
      } else if (n.type === 'table') {
        const dataset = catalog.datasets.find((d) => d.binding === n.binding);
        valueSource(n.source, n.binding, `${p}.source`, [], nodeId);
        list(n.columns, `${p}.columns`, 1, 20, nodeId).forEach((f, j) =>
          field(f, `${p}.columns[${j}]`, dataset?.columns ?? [], nodeId),
        );
        boolean(n.searchable, `${p}.searchable`, nodeId);
        if (
          typeof n.pageSize !== 'number' ||
          !Number.isInteger(n.pageSize) ||
          n.pageSize < 1 ||
          n.pageSize > 100
        )
          add(`${p}.pageSize`, 'Размер страницы должен быть целым числом от 1 до 100.', nodeId);
      } else if (n.type === 'callout') {
        valueSource(n.source, n.binding, `${p}.source`, catalog.fields, nodeId);
        if (!['info', 'success', 'warning', 'error'].includes(String(n.tone)))
          add(`${p}.tone`, 'Выберите тип сообщения: информация, успех, предупреждение или ошибка.', nodeId);
      } else if (n.type === 'metrics') {
        if (![1, 2, 3].includes(n.columns as number))
          add(`${p}.columns`, 'Выберите от одной до трёх колонок.', nodeId);
        list(n.items, `${p}.items`, 1, 12, nodeId).forEach((item, j) => {
          field(item, `${p}.items[${j}]`, catalog.fields, nodeId);
          if (
            record(item) &&
            item.suffix !== undefined &&
            (typeof item.suffix !== 'string' || item.suffix.length > 200)
          )
            add(`${p}.items[${j}].suffix`, 'Пояснение должно быть текстом до 200 символов.', nodeId);
        });
      } else if (n.type === 'recordList' || n.type === 'documents') {
        valueSource(n.source, n.binding, `${p}.source`, [], nodeId);
        valueSource(n.itemTitle, undefined, `${p}.itemTitle`, [], nodeId);
        const optional =
          n.type === 'recordList'
            ? ['itemSubtitle', 'itemHref']
            : ['itemDescription', 'itemStatus', 'itemSize', 'itemHref'];
        for (const key of optional)
          if (n[key] !== undefined) valueSource(n[key], undefined, `${p}.${key}`, [], nodeId);
        if (n.type === 'recordList') {
          if (![1, 2, 3].includes(n.columns as number))
            add(`${p}.columns`, 'Выберите от одной до трёх колонок.', nodeId);
          list(n.fields, `${p}.fields`, 0, 50, nodeId).forEach((item, j) =>
            field(item, `${p}.fields[${j}]`, [], nodeId),
          );
        } else if (n.action !== undefined) action(n.action, `${p}.action`, nodeId);
        if (record(n.source) && n.source.kind === 'literal' && !Array.isArray(n.source.value))
          add(`${p}.source.value`, 'Источник списка должен содержать массив объектов.', nodeId);
        if (
          record(n.itemTitle) &&
          n.itemTitle.kind === 'literal' &&
          (typeof n.itemTitle.value !== 'string' || !n.itemTitle.value.trim())
        )
          add(`${p}.itemTitle.value`, 'Название элемента должно быть непустым текстом.', nodeId);
        if (record(n.itemHref) && n.itemHref.kind === 'literal')
          validateFieldValue({ format: 'link' }, n.itemHref.value).forEach((message) =>
            add(`${p}.itemHref.value`, message, nodeId),
          );
      } else if (n.type === 'widget') {
        invocation(n, p, nodeId);
        const widget = catalog.widgets.find((w) => w.id === n.widgetId);
        if (!widget || widget.mode !== 'embedded')
          add(`${p}.widgetId`, 'Выберите зарегистрированный встроенный виджет.', nodeId);
        if (capabilities.widgetIds && !capabilities.widgetIds.includes(String(n.widgetId)))
          add(`${p}.widgetId`, 'Этот виджет не поддерживается клиентом.', nodeId);
        if (typeof n.height !== 'number' || !Number.isFinite(n.height) || n.height < 120 || n.height > 1200)
          add(`${p}.height`, 'Высота виджета должна быть от 120 до 1200 px.', nodeId);
      }
      if (
        ['table', 'recordList', 'documents'].includes(String(n.type)) &&
        record(n.source) &&
        n.source.kind === 'literal'
      ) {
        if (!Array.isArray(n.source.value))
          add(`${p}.source.value`, 'Источник списка должен содержать массив объектов.', nodeId);
        else
          n.source.value.forEach((row, rowIndex) => {
            const rowPath = `${p}.source.value[${rowIndex}]`;
            if (!record(row)) {
              add(rowPath, 'Каждая строка списка должна быть объектом.', nodeId);
              return;
            }
            const columns = n.type === 'table' ? n.columns : n.type === 'recordList' ? n.fields : [];
            if (Array.isArray(columns))
              columns.forEach((entry) => {
                if (!record(entry) || !formats.includes(String(entry.format))) return;
                const fieldValue = entry as unknown as FieldDefinition;
                validateFieldValue(
                  fieldValue,
                  resolveValue(row, fieldValue.source, fieldValue.binding),
                ).forEach((message) =>
                  add(
                    `${rowPath}.${fieldValue.source?.kind === 'binding' ? fieldValue.source.path : fieldValue.binding}`,
                    `${String(entry.label)}: ${message}`,
                    nodeId,
                  ),
                );
              });
          });
      }
    }
  };
  const action = (entry: unknown, p: string, nodeId?: string) => {
    if (!record(entry)) {
      add(p, 'Ожидается описание действия.', nodeId);
      return;
    }
    id(entry.id, `${p}.id`, nodeId);
    invocation(entry, p, nodeId);
    string(entry.label, `${p}.label`, 'Подпись действия', nodeId);
    if (entry.kind !== 'openWidget')
      add(`${p}.kind`, 'Поддерживается открытие зарегистрированного виджета.', nodeId);
    const widget = catalog.widgets.find((item) => item.id === entry.widgetId);
    if (!widget || widget.mode !== 'external')
      add(`${p}.widgetId`, 'Выберите зарегистрированный внешний виджет.', nodeId);
    if (capabilities.widgetIds && !capabilities.widgetIds.includes(String(entry.widgetId)))
      add(`${p}.widgetId`, 'Виджет действия не поддерживается клиентом.', nodeId);
  };
  const actions = (value: unknown, path: string, nodeId: '$header' | '$footer') => {
    if (value === undefined) return;
    list(value, path, 0, 12, nodeId).forEach((entry, index) => action(entry, `${path}[${index}]`, nodeId));
  };
  const footerButtons = (value: unknown) => {
    if (value === undefined) return;
    const buttons = list(value, '$.footer.buttons', 0, 6, '$footer');
    buttons.forEach((button, index) => {
      const p = `$.footer.buttons[${index}]`;
      if (!record(button)) return add(p, 'Ожидается описание кнопки.', '$footer');
      id(button.id, `${p}.id`, '$footer');
      string(button.label, `${p}.label`, 'Подпись кнопки', '$footer');
      if (typeof button.label === 'string' && button.label.length > 120)
        add(`${p}.label`, 'Сократите подпись кнопки до 120 символов.', '$footer');
      if (
        button.variant !== undefined &&
        !['primary', 'secondary', 'ghost', 'danger'].includes(String(button.variant))
      )
        add(`${p}.variant`, 'Выберите поддерживаемый стиль кнопки.', '$footer');
      for (const key of Object.keys(button))
        if (!['id', 'label', 'variant', 'action'].includes(key))
          add(`${p}.${key}`, 'Неизвестная настройка кнопки.', '$footer');
      const target = button.action;
      const ap = `${p}.action`;
      if (!record(target)) return add(ap, 'Привяжите действие к кнопке.', '$footer');
      let allowed = ['kind'];
      if (target.kind === 'openWidget') {
        allowed = ['kind', 'widgetId', 'props', 'events'];
        invocation(target, ap, '$footer');
        const widget = catalog.widgets.find(
          (item) => item.id === target.widgetId && item.mode === 'external',
        );
        if (!widget) add(`${ap}.widgetId`, 'Выберите зарегистрированный внешний виджет.', '$footer');
        if (capabilities.widgetIds && !capabilities.widgetIds.includes(String(target.widgetId)))
          add(`${ap}.widgetId`, 'Виджет действия не поддерживается клиентом.', '$footer');
      } else if (target.kind === 'host') {
        allowed = ['kind', 'actionId', 'params'];
        string(target.actionId, `${ap}.actionId`, 'Действие приложения', '$footer');
        const descriptor = catalog.actions?.find((item) => item.id === target.actionId);
        if (!descriptor) add(`${ap}.actionId`, 'Выберите зарегистрированное действие приложения.', '$footer');
        if (capabilities.actionIds && !capabilities.actionIds.includes(String(target.actionId)))
          add(`${ap}.actionId`, 'Действие не поддерживается клиентом.', '$footer');
        parameters(target.params, `${ap}.params`, '$footer');
        for (const input of descriptor?.inputs ?? []) {
          const source = record(target.params) ? target.params[input.name] : undefined;
          if (input.required && source === undefined)
            add(`${ap}.params.${input.name}`, `Укажите параметр «${input.label}».`, '$footer');
          if (record(source) && source.kind === 'literal') {
            const v = source.value;
            if (input.required && (v === null || v === undefined || (typeof v === 'string' && !v.trim())))
              add(`${ap}.params.${input.name}.value`, `Заполните параметр «${input.label}».`, '$footer');
            else if (
              v !== null &&
              input.type !== 'json' &&
              typeof v !== ({ text: 'string', number: 'number', boolean: 'boolean' } as const)[input.type]
            )
              add(
                `${ap}.params.${input.name}.value`,
                `Параметр «${input.label}» имеет неверный тип.`,
                '$footer',
              );
          }
        }
      } else if (target.kind !== 'refresh' && target.kind !== 'close')
        add(
          `${ap}.kind`,
          'Выберите действие: виджет, действие приложения, обновление или закрытие.',
          '$footer',
        );
      for (const key of Object.keys(target))
        if (!allowed.includes(key))
          add(
            `${ap}.${key}`,
            'Неизвестная настройка действия. Обработчик регистрируется в приложении.',
            '$footer',
          );
    });
    if (buttons.filter((button) => record(button) && button.variant === 'primary').length > 1)
      add('$.footer.buttons', 'Рекомендуется одна акцентная кнопка в нижней панели.', '$footer', 'warning');
  };
  if (!record(value)) return [{ severity: 'error', path: '$', message: 'Ожидается объект шаблона.' }];
  if (value.schemaVersion !== 1) add('$.schemaVersion', 'Поддерживается версия контракта 1.');
  id(value.id, '$.id');
  string(value.name, '$.name', 'Название шаблона');
  string(value.entityType, '$.entityType', 'Тип объекта');
  if (!record(value.header)) add('$.header', 'Настройте заголовок сплита.');
  else {
    for (const key of ['title', 'subtitle', 'status'])
      valueSource(
        value.header[`${key}Source`],
        value.header[`${key}Binding`],
        `$.header.${key}Source`,
        catalog.fields,
      );
    boolean(value.header.showStatus, '$.header.showStatus');
    for (const key of ['title', 'status'] as const) {
      const source = value.header[`${key}Source`];
      if (
        record(source) &&
        source.kind === 'literal' &&
        (key === 'title' || value.header.showStatus === true)
      )
        validateFieldValue(
          {
            format: key === 'status' ? 'status' : 'text',
            validation: key === 'title' ? { required: true } : undefined,
          },
          source.value,
        ).forEach((message) => add(`$.header.${key}Source.value`, message, '$header'));
    }
    if (value.header.fields !== undefined)
      list(value.header.fields, '$.header.fields', 0, 12, '$header').forEach((entry, index) =>
        field(entry, `$.header.fields[${index}]`, catalog.fields, '$header'),
      );
    actions(value.header.actions, '$.header.actions', '$header');
  }
  if (!record(value.shell)) add('$.shell', 'Настройте размеры сплита.');
  else {
    const s = value.shell;
    if (
      typeof s.minWidth !== 'number' ||
      !Number.isFinite(s.minWidth) ||
      s.minWidth < 320 ||
      s.minWidth > 1600
    )
      add('$.shell.minWidth', 'Минимальная ширина должна быть от 320 до 1600 px.');
    else if (s.minWidth < 600)
      add(
        '$.shell.minWidth',
        'В документации Split-view рекомендована минимальная ширина 600 px.',
        undefined,
        'warning',
      );
    if (
      typeof s.defaultWidth !== 'number' ||
      !Number.isFinite(s.defaultWidth) ||
      s.defaultWidth < Number(s.minWidth) ||
      s.defaultWidth > 2400
    )
      add('$.shell.defaultWidth', 'Начальная ширина должна быть не меньше минимальной и не больше 2400 px.');
    if (
      typeof s.maxWidthPercent !== 'number' ||
      !Number.isFinite(s.maxWidthPercent) ||
      s.maxWidthPercent < 30 ||
      s.maxWidthPercent > 100
    )
      add('$.shell.maxWidthPercent', 'Максимальная ширина должна составлять от 30 до 100% контейнера.');
  }
  list(value.tabs, '$.tabs', 1, 12).forEach((tab, index) => {
    const p = `$.tabs[${index}]`;
    if (!record(tab)) {
      add(p, 'Ожидается описание вкладки.');
      return;
    }
    id(tab.id, `${p}.id`);
    string(tab.title, `${p}.title`, 'Название вкладки');
    nodes(tab.nodes, `${p}.nodes`, 1);
    if (Array.isArray(tab.nodes) && tab.nodes.length === 0)
      add(
        `${p}.nodes`,
        'Вкладка пока пуста. Добавьте первый блок.',
        typeof tab.id === 'string' ? tab.id : undefined,
        'warning',
      );
  });
  if (!record(value.footer)) add('$.footer', 'Настройте нижнюю область сплита.');
  else {
    const footer = value.footer;
    boolean(footer.show, '$.footer.show');
    if (typeof footer.text !== 'string') add('$.footer.text', 'Подпись нижней области должна быть текстом.');
    actions(footer.actions, '$.footer.actions', '$footer');
    footerButtons(footer.buttons);
    if (footer.widgetId !== undefined) {
      const widget = catalog.widgets.find((w) => w.id === footer.widgetId);
      if (!widget || widget.mode !== 'external')
        add('$.footer.widgetId', 'Выберите зарегистрированный внешний виджет.');
      if (capabilities.widgetIds && !capabilities.widgetIds.includes(String(footer.widgetId)))
        add('$.footer.widgetId', 'Внешний виджет не поддерживается клиентом.');
      string(footer.actionLabel, '$.footer.actionLabel', 'Подпись открытия виджета');
    }
  }
  return issues;
}
