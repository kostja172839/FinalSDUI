import type {
  ButtonAction,
  HostActionDescriptor,
  HostActionRegistry,
  OpenWidgetIntent,
  WidgetContext,
} from '../../shared/model';
import { isJsonValue, isSafeBinding, readPath, resolveWidgetInput } from '../../shared/values';

export interface ButtonActionEnvironment {
  context: WidgetContext;
  data: Record<string, unknown>;
  actionHandlers?: HostActionRegistry;
  actionDescriptors?: HostActionDescriptor[];
  onOpenWidget?: (intent: OpenWidgetIntent) => void;
  onRefresh?: () => void;
  onClose?: () => void;
}

export function getButtonActionAvailability(
  action: ButtonAction,
  environment: ButtonActionEnvironment,
): { enabled: boolean; reason?: string } {
  try {
    if (action.kind === 'host') {
      const handler = Object.prototype.hasOwnProperty.call(environment.actionHandlers ?? {}, action.actionId)
        ? environment.actionHandlers?.[action.actionId]
        : undefined;
      if (typeof handler !== 'function')
        return { enabled: false, reason: 'Действие не подключено к приложению.' };
      const descriptor = environment.actionDescriptors?.find((item) => item.id === action.actionId);
      if (environment.actionDescriptors && !descriptor)
        return { enabled: false, reason: 'Действие не подключено к приложению.' };
      if (action.params !== undefined) {
        if (
          !action.params ||
          typeof action.params !== 'object' ||
          Array.isArray(action.params) ||
          !isJsonValue(action.params)
        )
          return { enabled: false, reason: 'Проверьте параметры действия.' };
        for (const [path, source] of Object.entries(action.params)) {
          if (
            !isSafeBinding(path) ||
            !source ||
            typeof source !== 'object' ||
            (source.kind !== 'literal' && source.kind !== 'binding') ||
            (source.kind === 'literal' && !isJsonValue(source.value)) ||
            (source.kind === 'binding' && (typeof source.path !== 'string' || !isSafeBinding(source.path)))
          )
            return { enabled: false, reason: 'Проверьте параметры действия.' };
        }
      }
      const params = resolveWidgetInput({ props: action.params }, environment.data, environment.context).data;
      if (!isJsonValue(params)) return { enabled: false, reason: 'Проверьте параметры действия.' };
      for (const input of descriptor?.inputs ?? []) {
        const value = readPath(params, input.name);
        const empty = value === undefined || value === null || (typeof value === 'string' && !value.trim());
        if (input.required && empty)
          return { enabled: false, reason: `Заполните параметр «${input.label}».` };
        if (value === undefined) continue;
        const valid =
          input.type === 'text'
            ? typeof value === 'string'
            : input.type === 'number'
              ? typeof value === 'number' && Number.isFinite(value)
              : input.type === 'boolean'
                ? typeof value === 'boolean'
                : input.type === 'json' && isJsonValue(value);
        if (!valid) {
          const expected = {
            text: 'текст',
            number: 'число',
            boolean: 'логическое значение',
            json: 'данные JSON',
          }[input.type];
          return {
            enabled: false,
            reason: `Для параметра «${input.label}» укажите ${expected ?? 'корректное значение'}.`,
          };
        }
      }
      return { enabled: true };
    }
    if (action.kind === 'openWidget')
      return environment.onOpenWidget
        ? { enabled: true }
        : { enabled: false, reason: 'Открытие виджетов недоступно в этом приложении.' };
    if (action.kind === 'refresh')
      return environment.onRefresh
        ? { enabled: true }
        : { enabled: false, reason: 'Обновление карточки сейчас недоступно.' };
    if (action.kind === 'close')
      return environment.onClose
        ? { enabled: true }
        : { enabled: false, reason: 'Закрытие карточки сейчас недоступно.' };
    return { enabled: false, reason: 'Действие сейчас недоступно.' };
  } catch {
    return { enabled: false, reason: 'Проверьте параметры действия.' };
  }
}

/** SDUI supplies data; execution is limited to callbacks explicitly installed by the host. */
export async function dispatchButtonAction(
  action: ButtonAction,
  environment: ButtonActionEnvironment,
): Promise<void> {
  const availability = getButtonActionAvailability(action, environment);
  if (!availability.enabled) throw new Error(availability.reason);
  const context = { ...environment.context };
  if (action.kind === 'host') {
    await environment.actionHandlers![action.actionId]({
      type: 'hostAction',
      actionId: action.actionId,
      context,
      correlationId: crypto.randomUUID(),
      params: resolveWidgetInput({ props: action.params }, environment.data, context).data,
    });
  } else if (action.kind === 'openWidget') {
    await environment.onOpenWidget?.({
      type: 'openWidget',
      widgetId: action.widgetId,
      context,
      correlationId: crypto.randomUUID(),
      input: resolveWidgetInput(action, environment.data, context),
    });
  } else if (action.kind === 'refresh') await environment.onRefresh?.();
  else if (action.kind === 'close') await environment.onClose?.();
}
