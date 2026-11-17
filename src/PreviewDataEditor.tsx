import { useEffect, useId, useState } from 'react';
import { Button } from './ui';
import { isJsonValue } from '../shared/values';

/** Local preview fixtures are separate from the saved/published definition. */
export function PreviewDataEditor({
  data,
  value,
  onChange,
}: {
  data?: Record<string, unknown>;
  value?: Record<string, unknown>;
  onChange: (value: Record<string, unknown> | undefined) => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!editing) setText(JSON.stringify(value ?? data ?? {}, null, 2));
  }, [data, value, editing]);
  const apply = () => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('В корне нужен JSON-объект, например {"order": {"number": "123"}}.');
      if (!isJsonValue(parsed))
        throw new Error('Проверьте данные: служебные ключи запрещены, вложенность ограничена 24 уровнями.');
      onChange(parsed as Record<string, unknown>);
      setEditing(false);
      setError('');
    } catch (cause) {
      setError(
        cause instanceof SyntaxError
          ? 'Проверьте JSON: кавычки, запятые и скобки.'
          : String((cause as Error).message),
      );
    }
  };
  return (
    <section className="preview-data-editor">
      <h3>Свои данные</h3>
      <p>
        Вставьте произвольный ответ API. В полях карточки укажите путь к нужному значению, например{' '}
        <code>order.number</code>. Каталог содержит только подсказки.
      </p>
      <label htmlFor={id}>Данные для предпросмотра (JSON)</label>
      <textarea
        id={id}
        value={text}
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        onChange={(event) => {
          setEditing(true);
          setText(event.target.value);
          setError('');
        }}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="preview-data-error">
          {error}
        </p>
      )}
      <div className="preview-data-actions">
        <Button size="sm" onClick={apply}>
          Применить данные
        </Button>
        {value && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(undefined);
              setEditing(false);
              setError('');
            }}
          >
            Вернуть данные примера
          </Button>
        )}
      </div>
      <p id={`${id}-hint`} className="ui-hint">
        {value ? 'Используются ваши данные.' : 'Используются данные примера.'} Эти данные действуют только в
        предпросмотре. Приложение получает значения от бэкенда.
      </p>
    </section>
  );
}
