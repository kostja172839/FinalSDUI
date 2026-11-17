import {
  useId,
  createContext,
  useContext,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode,
} from 'react';
import { Button as FinButton, TextField, Switch } from '@salutejs/sdds-finai';
import { ChevronDown } from 'lucide-react';
import type { ValidationIssue } from '../shared/model';

const FieldErrorContext = createContext<{ issues: ValidationIssue[]; path: string }>({
  issues: [],
  path: '$',
});
export function FieldErrorScope({
  issues,
  path,
  children,
}: {
  issues?: ValidationIssue[];
  path: string;
  children: ReactNode;
}) {
  const parent = useContext(FieldErrorContext);
  const fullPath = path.startsWith('$') ? path : `${parent.path}${path.startsWith('[') ? '' : '.'}${path}`;
  return (
    <FieldErrorContext.Provider value={{ issues: issues ?? parent.issues, path: fullPath }}>
      {children}
    </FieldErrorContext.Provider>
  );
}
export function useFieldError(path?: string): string | undefined {
  const context = useContext(FieldErrorContext);
  if (!path) return undefined;
  const fullPath = path.startsWith('$') ? path : `${context.path}${path.startsWith('[') ? '' : '.'}${path}`;
  return context.issues.find(
    (issue) =>
      issue.severity === 'error' && (issue.path === fullPath || issue.path.startsWith(`${fullPath}.`)),
  )?.message;
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}
export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <FinButton
      type="button"
      {...props}
      size={size === 'sm' ? 'xs' : 's'}
      view={
        ({ primary: 'accent', secondary: 'secondary', ghost: 'clear', danger: 'negative' } as const)[variant]
      }
      className={`ui-button ${className}`}
    >
      {children}
    </FinButton>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> & { label: string; children: ReactNode }) {
  return (
    <FinButton
      type="button"
      {...props}
      size="xs"
      view="clear"
      square
      aria-label={label}
      title={label}
      className={`ui-icon ${props.className || ''}`}
    >
      {children}
    </FinButton>
  );
}
export function Input({
  label,
  hint,
  id,
  className,
  required,
  error: suppliedError,
  path,
  'aria-describedby': describedBy,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: string;
  hint?: string;
  error?: string;
  path?: string;
}) {
  const generated = useId();
  const inputId = id || generated;
  const scopedError = useFieldError(path);
  const error =
    suppliedError ??
    scopedError ??
    (required && !String(props.value ?? '').trim() ? 'Заполните поле.' : undefined);
  const description =
    [describedBy, hint ? `${inputId}-hint` : undefined, error ? `${inputId}-error` : undefined]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className={`ui-field ${className || ''}`}>
      <label htmlFor={inputId}>{label}</label>
      <TextField
        {...props}
        id={inputId}
        size="xs"
        required={Boolean(required)}
        aria-invalid={Boolean(error) || props['aria-invalid']}
        aria-describedby={description}
      />
      {hint && (
        <span className="ui-hint" id={`${inputId}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="ui-field-error" role="alert" id={`${inputId}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
export function Select({
  label,
  hint,
  options,
  id,
  className,
  error: suppliedError,
  path,
  'aria-describedby': describedBy,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  options: { value: string; label: string }[];
  error?: string;
  path?: string;
}) {
  const generated = useId();
  const inputId = id || generated;
  const scopedError = useFieldError(path);
  const error = suppliedError ?? scopedError;
  const description =
    [describedBy, hint ? `${inputId}-hint` : undefined, error ? `${inputId}-error` : undefined]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className={`ui-field ${className || ''}`}>
      <label htmlFor={inputId}>{label}</label>
      <div className="ui-select">
        <select
          {...props}
          id={inputId}
          aria-invalid={Boolean(error) || props['aria-invalid']}
          aria-describedby={description}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </div>
      {hint && (
        <span className="ui-hint" id={`${inputId}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="ui-field-error" role="alert" id={`${inputId}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Switch
      className="ui-toggle"
      label={label}
      size="s"
      toggleSize="s"
      checked={checked}
      disabled={disabled}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
    />
  );
}
