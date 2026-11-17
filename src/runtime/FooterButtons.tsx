import { useEffect, useId, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { FooterButton } from '../../shared/model';
import { Button } from '../ui';
import {
  dispatchButtonAction,
  getButtonActionAvailability,
  type ButtonActionEnvironment,
} from './button-actions';

export interface FooterButtonsProps extends ButtonActionEnvironment {
  buttons: FooterButton[];
}

/** Direct footer actions have an independent lifetime from popup menus. */
export function FooterButtons({ buttons, ...environment }: FooterButtonsProps) {
  const prefix = useId();
  const { context } = environment;
  const scope = JSON.stringify([
    context.entityId,
    context.entityType,
    context.instanceId,
    buttons,
    environment.actionDescriptors,
  ]);
  const currentScope = useRef({ key: scope, version: Symbol('footer') });
  if (currentScope.current.key !== scope) currentScope.current = { key: scope, version: Symbol('footer') };
  const version = currentScope.current.version;
  const alive = useRef(true);
  const lock = useRef<{ version: symbol; token: symbol }>();
  const [pending, setPending] = useState<{ version: symbol; id: string }>();
  const [failure, setFailure] = useState<{ version: symbol; id: string; message: string }>();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    // Switching away and back must not resurrect an earlier error or pending state.
    setFailure(undefined);
    setPending(undefined);
    lock.current = undefined;
  }, [version]);
  const run = async (button: FooterButton) => {
    if (lock.current?.version === version) return;
    if (!getButtonActionAvailability(button.action, environment).enabled) return;
    const token = Symbol(button.id);
    lock.current = { version, token };
    setPending({ version, id: button.id });
    setFailure(undefined);
    try {
      await dispatchButtonAction(button.action, environment);
    } catch {
      if (alive.current && currentScope.current.version === version)
        setFailure({ version, id: button.id, message: 'Не удалось выполнить действие. Попробуйте ещё раз.' });
    } finally {
      if (lock.current?.token === token) lock.current = undefined;
      if (alive.current && currentScope.current.version === version) setPending(undefined);
    }
  };
  if (!buttons.length) return null;
  const busy = pending?.version === version;
  return (
    <div
      className="split-footer-buttons"
      role="group"
      aria-label="Кнопки карточки"
      onClick={(event) => event.stopPropagation()}
    >
      {buttons.map((button, index) => {
        const availability = getButtonActionAvailability(button.action, environment);
        const error = failure?.version === version && failure.id === button.id ? failure.message : undefined;
        const hint = error ?? availability.reason;
        const descriptionId = `${prefix}-${index}-description`;
        return (
          <div className="split-footer-button" key={button.id}>
            <Button
              size="sm"
              variant={button.variant ?? 'secondary'}
              disabled={busy || !availability.enabled}
              aria-busy={(busy && pending.id === button.id) || undefined}
              aria-describedby={hint ? descriptionId : undefined}
              title={!availability.enabled ? availability.reason : undefined}
              onClick={() => {
                void run(button);
              }}
            >
              {busy && pending.id === button.id && <Loader2 size={14} className="spin" aria-hidden="true" />}
              {button.label}
            </Button>
            {hint && (
              <span
                id={descriptionId}
                className={`split-footer-button-hint${error ? ' is-error' : ''}`}
                role={error ? 'alert' : undefined}
              >
                {hint}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
