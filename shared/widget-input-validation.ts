import type { WidgetDescriptor } from './model';
import { isJsonValue, isSafeBinding, readPath } from './values';

export interface WidgetInputIssue {
  /** Descriptor input name, including a dotted path for nested native props. */
  name: string;
  message: string;
  /** An ancestor prop may supply a nested input; point authoring errors to that actual editor. */
  sourceName?: string;
}
type InputDescriptor = NonNullable<WidgetDescriptor['inputs']>[number];
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const missing = (value: unknown) =>
  value === undefined || value === null || (typeof value === 'string' && !value.trim());

function inputIssue(input: InputDescriptor, value: unknown): WidgetInputIssue | undefined {
  if (input.required && missing(value))
    return { name: input.name, message: `Заполните обязательный параметр «${input.label}».` };
  if (value === undefined) return;
  const valid =
    input.type === 'text'
      ? typeof value === 'string'
      : input.type === 'number'
        ? typeof value === 'number' && Number.isFinite(value)
        : input.type === 'boolean'
          ? typeof value === 'boolean'
          : isJsonValue(value);
  if (!valid)
    return {
      name: input.name,
      message: `Параметр «${input.label}»: ожидается ${
        { text: 'текст', number: 'конечное число', boolean: 'логическое значение', json: 'значение JSON' }[
          input.type
        ]
      }.`,
    };
}

/** Check resolved native data. Authoring defaults are never silently injected into the widget. */
export function validateWidgetInputs(
  descriptor: WidgetDescriptor | undefined,
  values: unknown,
): WidgetInputIssue[] {
  return (descriptor?.inputs ?? []).flatMap((input) => {
    const issue = inputIssue(input, readPath(values, input.name));
    return issue ? [issue] : [];
  });
}

/** Check literals/absence now; bindings are checked once their real data/context is available. */
export function validateWidgetInputSources(
  descriptor: WidgetDescriptor | undefined,
  props: unknown,
): WidgetInputIssue[] {
  const entries = record(props) ? Object.entries(props).filter(([name]) => isSafeBinding(name)) : [];
  return (descriptor?.inputs ?? []).flatMap((input) => {
    const ancestor = entries
      .filter(([name]) => name === input.name || input.name.startsWith(`${name}.`))
      .sort(([a], [b]) => b.length - a.length)[0];
    let value: unknown;
    if (ancestor) {
      const [name, source] = ancestor;
      // The structural validator reports malformed sources. Avoid inventing a value for them.
      if (!record(source) || source.kind !== 'literal') return [];
      const relative = input.name.slice(name.length + 1);
      value = name === input.name ? source.value : readPath(source.value, relative);
    } else if (
      entries.some(
        ([name, source]) =>
          name.startsWith(`${input.name}.`) &&
          record(source) &&
          ['binding', 'literal'].includes(String(source.kind)),
      )
    ) {
      // Descendant declarations guarantee an object at this path, even when a leaf is bound.
      value = {};
    }
    const issue = inputIssue(input, value);
    return issue
      ? [{ ...issue, ...(ancestor && ancestor[0] !== input.name ? { sourceName: ancestor[0] } : {}) }]
      : [];
  });
}
