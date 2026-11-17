import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, MoreVertical } from 'lucide-react';
import type { OpenWidgetIntent, SplitAction, WidgetContext } from '../../shared/model';
import { Button, IconButton } from '../ui';
import { resolveWidgetInput } from '../../shared/values';
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
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<'first' | 'last'>('first');
  const menuId = useId();
  const label = placement === 'header' ? 'Действия в шапке' : 'Действия в нижней панели';
  const actionSignature = actions
    .map((action) => `${action.id}:${action.label}:${action.widgetId}`)
    .join('|');
  const focusTrigger = () => root.current?.querySelector<HTMLButtonElement>(':scope > button')?.focus();

  useEffect(() => {
    setOpened(false);
  }, [context.entityId, context.instanceId, actionSignature]);
  useEffect(() => {
    if (!opened) return;
    const items = menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    const target = initialFocus.current === 'last' ? items?.[items.length - 1] : items?.[0];
    target?.focus();
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
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
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

  if (!actions.length) return null;
  const triggerProps = {
    'aria-haspopup': 'menu' as const,
    'aria-expanded': opened,
    'aria-controls': opened ? menuId : undefined,
    disabled: !onOpenWidget,
    onKeyDown: triggerKeys,
    onClick: () => {
      initialFocus.current = 'first';
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
          aria-label={label}
          onKeyDown={menuKeys}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpened(false);
                focusTrigger();
                onOpenWidget?.({
                  type: 'openWidget',
                  widgetId: action.widgetId,
                  context,
                  correlationId: crypto.randomUUID(),
                  input: resolveWidgetInput(action, data, context),
                });
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
