import { useEffect, useId, useMemo, useState } from 'react';
import type { CatalogField, FieldFormat, JsonValue, ValueSource } from '../../shared/model';
import { Button, Input, Select, useFieldError } from '../ui';
import { isSafeBinding, isJsonValue, readPath } from '../../shared/values';
import { dataBindingSuggestions, writeBinding } from '../../shared/write-path';
import { editJsonDraft, jsonDraftStatus, syncJsonDraft } from '../../shared/json-draft';
import { useEditorValidity } from './editorValidation';
import { usePreviewData } from './previewData';

export function BindingPathInput({
  label,
  value,
  fields = [],
  onChange,
  hint,
  error,
}: {
  label: string;
  value: string;
  fields?: CatalogField[];
  onChange: (path: string) => void;
  hint?: string;
  error?: string;
}) {
  const suggestions = useId();
  const scope = usePreviewData();
  const options = useMemo(() => {
    const merged = new Map(fields.map((field) => [field.binding, field]));
    for (const field of dataBindingSuggestions(scope.scopeData))
      if (!merged.has(field.binding)) merged.set(field.binding, field);
    return [...merged.values()];
  }, [fields, scope.scopeData]);
  return (
    <>
      <Input
        label={label}
        value={value}
        error={
          error ??
          (!isSafeBinding(value)
            ? 'Укажите путь через точку, например entity.number. Пустые сегменты, выражения и служебные свойства запрещены.'
            : undefined)
        }
        list={options.length ? suggestions : undefined}
        autoComplete="off"
        placeholder="Например, entity.amount"
        hint={hint ?? 'Любой путь в данных API через точку. Каталог содержит только подсказки.'}
        onChange={(event) => onChange(event.target.value)}
      />
      {options.length > 0 && (
        <datalist id={suggestions}>
          {options.map((field) => (
            <option key={field.binding} value={field.binding}>
              {field.group} · {field.label}
            </option>
          ))}
        </datalist>
      )}
    </>
  );
}

type LiteralType = 'text' | 'number' | 'boolean' | 'null' | 'json';
const literalType = (value: JsonValue): LiteralType =>
  value === null
    ? 'null'
    : typeof value === 'string'
      ? 'text'
      : typeof value === 'number'
        ? 'number'
        : typeof value === 'boolean'
          ? 'boolean'
          : 'json';

function LiteralEditor({
  label,
  value,
  onChange,
  multiline = false,
  onValidityChange,
}: {
  label: string;
  value: JsonValue;
  onChange: (value: JsonValue) => void;
  multiline?: boolean;
  onValidityChange?: (invalid: boolean) => void;
}) {
  const type = literalType(value);
  const serialized = type === 'json' ? JSON.stringify(value, null, 2) : String(value ?? '');
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState('');
  const jsonId = useId();
  useEditorValidity(Boolean(error));
  useEffect(() => onValidityChange?.(Boolean(error)), [error, onValidityChange]);
  useEffect(() => {
    setDraft(serialized);
    setError('');
  }, [serialized, type]);
  return (
    <>
      <Select
        label={`Тип значения: ${label}`}
        value={type}
        options={[
          { value: 'text', label: 'Текст' },
          { value: 'number', label: 'Число' },
          { value: 'boolean', label: 'Да / нет' },
          { value: 'null', label: 'Пустое значение (null)' },
          { value: 'json', label: 'Объект или список (JSON)' },
        ]}
        onChange={(event) => {
          const next = event.target.value as LiteralType;
          onChange(
            next === 'text'
              ? ''
              : next === 'number'
                ? 0
                : next === 'boolean'
                  ? false
                  : next === 'null'
                    ? null
                    : {},
          );
        }}
      />
      {type === 'text' && !multiline && (
        <Input
          label={`Значение: ${label}`}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {type === 'text' && multiline && (
        <div className="ui-field builder-json-editor">
          <label htmlFor={jsonId}>{`Значение: ${label}`}</label>
          <textarea
            id={jsonId}
            className="builder-text-value"
            value={String(value)}
            rows={5}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      )}
      {type === 'number' && (
        <Input
          label={`Значение: ${label}`}
          value={draft}
          inputMode="decimal"
          hint="Число с точкой, например 125.5."
          aria-invalid={Boolean(error)}
          error={error || undefined}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            if (text.trim() && Number.isFinite(Number(text))) {
              setError('');
              onChange(Number(text));
            } else setError('Введите конечное число.');
          }}
        />
      )}
      {type === 'boolean' && (
        <Select
          label={`Значение: ${label}`}
          value={String(value)}
          options={[
            { value: 'true', label: 'Да (true)' },
            { value: 'false', label: 'Нет (false)' },
          ]}
          onChange={(event) => onChange(event.target.value === 'true')}
        />
      )}
      {type === 'null' && (
        <p className="builder-property-copy">Будет передано null. Для пустого текста выберите тип «Текст».</p>
      )}
      {type === 'json' && (
        <div className="ui-field builder-json-editor">
          <label htmlFor={jsonId}>{`Значение: ${label}`}</label>
          <textarea
            id={jsonId}
            value={draft}
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={`${jsonId}-hint${error ? ` ${jsonId}-error` : ''}`}
            onChange={(event) => {
              setDraft(event.target.value);
              try {
                JSON.parse(event.target.value);
                setError('Нажмите «Применить JSON», чтобы использовать изменения.');
              } catch {
                setError('Проверьте JSON: кавычки, запятые и скобки.');
              }
            }}
          />
          <span id={`${jsonId}-hint`} className="ui-hint">
            Для составного параметра задайте объект или список. Изменения применяются кнопкой ниже.
          </span>
          <Button
            size="sm"
            onClick={() => {
              try {
                const parsed = JSON.parse(draft) as JsonValue;
                if (!parsed || typeof parsed !== 'object' || !isJsonValue(parsed)) throw new Error('shape');
                onChange(parsed);
                setError('');
              } catch {
                setError('Проверьте JSON: нужен объект или список без функций.');
              }
            }}
          >
            Применить JSON
          </Button>
        </div>
      )}
      {error && type !== 'number' && (
        <p className="builder-editor-error" role="alert" id={`${jsonId}-error`}>
          {error}
        </p>
      )}
    </>
  );
}

function BoundPreviewEditor({
  binding,
  label,
  format,
  multiline,
}: {
  binding: string;
  label: string;
  format?: FieldFormat;
  multiline: boolean;
}) {
  const scope = usePreviewData();
  const absolutePath = scope.prefix ? `${scope.prefix}.${binding}` : binding;
  const current = scope.data ? readPath(scope.data, absolutePath) : undefined;
  const initial: JsonValue = isJsonValue(current)
    ? (current as JsonValue)
    : format === 'number' || format === 'money'
      ? 0
      : '';
  const serialized = JSON.stringify(initial);
  const [state, setState] = useState({ base: serialized, text: serialized });
  const [literalInvalid, setLiteralInvalid] = useState(false);
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const value = JSON.parse(state.text) as JsonValue;
  const status = jsonDraftStatus(state, serialized);
  const dirty = status.dirty;
  const conflict = status.conflict || (literalInvalid && state.base !== serialized);
  useEditorValidity(dirty || literalInvalid || conflict || Boolean(error));
  useEffect(
    () =>
      setState((previous) =>
        literalInvalid
          ? previous
          : previous.text === serialized
            ? { base: serialized, text: serialized }
            : syncJsonDraft(previous, serialized),
      ),
    [serialized, literalInvalid],
  );
  const resetToCurrent = () => {
    setState({ base: serialized, text: serialized });
    setLiteralInvalid(false);
    setEditorResetKey((key) => key + 1);
    setError('');
    setNotice('Загружено актуальное тестовое значение.');
  };
  const reserved = /^\$(?:context|item|root)(?:\.|$)/.test(binding);
  if (!scope.onDataChange) return null;
  if (scope.disabledReason || reserved)
    return (
      <p className="builder-property-copy">
        {reserved
          ? 'Это значение приходит из контекста хоста. Для тестовых значений используйте путь в данных карточки.'
          : scope.disabledReason}
      </p>
    );
  if (!isSafeBinding(binding)) return null;
  return (
    <section className="builder-preview-value">
      <h4>Значение в предпросмотре</h4>
      <p className="builder-property-copy">
        {current === undefined
          ? 'По этому пути пока нет значения. Задайте его здесь — поле появится в тестовых данных.'
          : 'Измените тестовое значение, сохранив привязку к данным API.'}
        {scope.prefix ? ' Редактируется первая строка списка.' : ''}
      </p>
      <LiteralEditor
        key={editorResetKey}
        label={`${label} (предпросмотр)`}
        value={value}
        multiline={multiline}
        onValidityChange={setLiteralInvalid}
        onChange={(value) => {
          setState((previous) => editJsonDraft(previous, serialized, JSON.stringify(value)));
          setError('');
          setNotice('');
        }}
      />
      {conflict && (
        <div className="builder-preview-conflict" role="alert">
          <p className="builder-editor-error">
            Значение по этому пути изменилось в другом редакторе. Ваш ввод сохранён; применение заблокировано,
            чтобы не перезаписать актуальные данные.
          </p>
          <Button size="sm" variant="ghost" onClick={resetToCurrent}>
            Загрузить актуальное значение
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="builder-editor-error">
          {error}
        </p>
      )}
      <div className="builder-preview-value-actions">
        <Button
          size="sm"
          disabled={literalInvalid || conflict || (current !== undefined && !dirty)}
          onClick={() => {
            try {
              if (conflict || literalInvalid) return;
              scope.onDataChange?.(writeBinding(scope.data ?? {}, absolutePath, value));
              setState({ base: state.text, text: state.text });
              setError('');
              setNotice(
                current === undefined
                  ? 'Значение добавлено в тестовые данные.'
                  : 'Тестовое значение обновлено.',
              );
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Не удалось изменить значение.');
            }
          }}
        >
          {current === undefined ? 'Добавить значение в данные' : 'Применить значение'}
        </Button>
        {(dirty || literalInvalid) && (
          <Button size="sm" variant="ghost" onClick={resetToCurrent}>
            Отменить ввод
          </Button>
        )}
      </div>
      {notice && (
        <p className="builder-property-copy" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

export function ValueSourceEditor({
  label,
  source,
  binding = '',
  fields = [],
  onChange,
  hint,
  multiline = false,
  path = 'source',
  legacyPath = 'binding',
  format,
}: {
  label: string;
  source?: ValueSource;
  binding?: string;
  fields?: CatalogField[];
  onChange: (source: ValueSource) => void;
  hint?: string;
  multiline?: boolean;
  path?: string;
  legacyPath?: string;
  format?: FieldFormat;
}) {
  const current = source ?? { kind: 'binding' as const, path: binding };
  const info =
    current.kind === 'binding' ? fields.find((field) => field.binding === current.path) : undefined;
  const sourceError = useFieldError(source ? path : legacyPath);
  return (
    <div className="builder-source-editor">
      <Select
        label={`Источник: ${label}`}
        value={current.kind}
        options={[
          { value: 'binding', label: 'Из данных API' },
          { value: 'literal', label: 'Своё значение' },
        ]}
        onChange={(event) =>
          onChange(
            event.target.value === 'binding'
              ? { kind: 'binding', path: binding }
              : { kind: 'literal', value: '' },
          )
        }
      />
      {current.kind === 'binding' ? (
        <BindingPathInput
          label={`Путь к данным: ${label}`}
          value={current.path}
          fields={fields}
          hint={hint}
          error={sourceError}
          onChange={(path) => onChange({ kind: 'binding', path })}
        />
      ) : (
        <LiteralEditor
          label={label}
          value={current.value}
          multiline={multiline}
          onChange={(value) => onChange({ kind: 'literal', value })}
        />
      )}
      {sourceError && current.kind !== 'binding' && (
        <p className="builder-editor-error" role="alert">
          {sourceError}
        </p>
      )}
      {info && (
        <p className="builder-field-description">
          {info.description}
          <span>Пример из каталога: {info.example || '—'}</span>
        </p>
      )}
      {current.kind === 'binding' && (
        <BoundPreviewEditor
          key={current.path}
          binding={current.path}
          label={label}
          format={format ?? info?.type}
          multiline={multiline}
        />
      )}
    </div>
  );
}
