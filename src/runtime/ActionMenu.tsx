import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, MoreVertical } from 'lucide-react';
import type { OpenWidgetIntent, SplitAction, WidgetContext } from '../../shared/model';
import { Button, IconButton } from '../ui';
import { resolveWidgetInput } from '../../shared/values';
import { invokeWithActionPresentation, resolveActionPresentation } from '../../shared/action-presentation';
import './ActionMenu.css';

export interface ActionMenuProps {
  actions: SplitAction[];
  context: WidgetContext;
  data?: Record<string, unknown>;
  onOpenWidget?: (intent: OpenWidgetIntent) => void;
  placement: 'header' | 'footer';
}

/** A controlled menu keeps host context, keyboard focus and popup lifetime in one place. */
export function ActionMenu({ actions, context, data = {}, onOpenWidget, placement }: ActionMenuProps) {
  const [opened, setOpened] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<'first' | 'last'>('first');
  const menuId = useId();
  const label = placement === 'header' ? 'Действия в шапке' : 'Действия в нижней панели';
  const items = actions
    .map((action) => ({ action, appearance: resolveActionPresentation(action, data, context, 'ghost') }))
    .filter((item) => item.appearance.visible);
  const actionSignature = JSON.stringify([
    context.entityId,
    context.instanceId,
    actions,
    items.map((item) => item.appearance),
  ]);
  const currentScope = useRef({ key: actionSignature, version: Symbol('menu') });
  if (currentScope.current.key !== actionSignature)
    currentScope.current = { key: actionSignature, version: Symbol('menu') };
  const version = currentScope.current.version;
  const lock = useRef<symbol>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const focusTrigger = () => root.current?.querySelector<HTMLButtonElement>(':scope > button')?.focus();

  useEffect(() => {
    setOpened(false);
    setPending(false);
    setFailure('');
    lock.current = undefined;
  }, [version]);
  useEffect(() => {
    if (!opened) return;
    const items = menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    const target = initialFocus.current === 'last' ? items?.[items.length - 1] : items?.[0];
    if (target) target.focus();
    else menu.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpened(false);
    };
    window.document.addEventListener('pointerdown', outside, true);
    return () => window.document.removeEventListener('pointerdown', outside, true);
  }, [opened]);

  const triggerKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
      setOpened(true);
    }
  };
  const menuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    const active = items.indexOf(window.document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpened(false);
      focusTrigger();
    } else if (event.key === 'Tab') {
      setOpened(false);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const index =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (active + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[index]?.focus();
    }
  };

  const run = async (action: SplitAction) => {
    if (lock.current || !onOpenWidget) return;
    const appearance = resolveActionPresentation(action, data, context);
    if (!appearance.visible || appearance.disabled) return;
    const token = Symbol(action.id);
    lock.current = token;
    setPending(true);
    setFailure('');
    setOpened(false);
    focusTrigger();
    try {
      await invokeWithActionPresentation(action, data, context, async () => {
        await onOpenWidget({
          type: 'openWidget',
          widgetId: action.widgetId,
          context,
          correlationId: crypto.randomUUID(),
          input: resolveWidgetInput(action, data, context),
        });
      });
    } catch {
      if (alive.current && currentScope.current.version === version)
        setFailure('Не удалось открыть виджет. Попробуйте ещё раз.');
    } finally {
      if (lock.current === token) lock.current = undefined;
      if (alive.current && currentScope.current.version === version) setPending(false);
    }
  };
  if (!items.length) return null;
  const triggerProps = {
    'aria-haspopup': 'menu' as const,
    'aria-expanded': opened,
    'aria-controls': opened ? menuId : undefined,
    disabled: !onOpenWidget || pending,
    onKeyDown: triggerKeys,
    onClick: () => {
      initialFocus.current = 'first';
      setFailure('');
      setOpened((value) => !value);
    },
  };
  return (
    <div
      className={`split-action-menu split-action-menu--${placement}`}
      ref={root}
      onClick={(event) => event.stopPropagation()}
    >
      {placement === 'header' ? (
        <IconButton label={label} {...triggerProps}>
          <MoreVertical size={17} />
        </IconButton>
      ) : (
        <Button size="sm" aria-label={label} {...triggerProps}>
          Действия
          <ChevronDown size={14} />
        </Button>
      )}
      {opened && (
        <div
          id={menuId}
          ref={menu}
          className="split-action-popup"
          role="menu"
          tabIndex={-1}
          aria-label={label}
          onKeyDown={menuKeys}
        >
          {items.map(({ action, appearance }) => {
            const reason =
              appearance.issues[0]?.message ??
              (appearance.disabled ? 'Действие сейчас недоступно.' : undefined);
            const description = `${menuId}-${action.id}-reason`;
            const props = {
              role: 'menuitem',
              tabIndex: -1,
              disabled: appearance.disabled || pending,
              title: reason,
              'aria-describedby': reason ? description : undefined,
              onClick: () => {
                void run(action);
              },
            };
            return (
              <div key={action.id}>
                {action.presentation?.size || action.presentation?.variant ? (
                  <Button {...props} size={appearance.size} variant={appearance.variant}>
                    {appearance.label}
                  </Button>
                ) : (
                  <button {...props} type="button">
                    {appearance.label}
                  </button>
                )}
                {reason && (
                  <span id={description} className="split-action-reason">
                    {reason}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {failure && (
        <span className="split-action-failure" role="alert">
          {failure}
        </span>
      )}
    </div>
  );
}
