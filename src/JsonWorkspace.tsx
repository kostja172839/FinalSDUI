import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';
import { AlertCircle, Braces, Check, Copy, RotateCcw, WrapText } from 'lucide-react';
import type { Catalog, SplitTemplate } from '../shared/model';
import { validateTemplate } from '../shared/validation';
import { validateResolvedData } from '../shared/data-validation';
import { jsonLineColumn, jsonPathRange, parseJsonDocument, type JsonProblem } from '../shared/json-editor';
import { editJsonDraft, jsonDraftStatus, syncJsonDraft } from '../shared/json-draft';
import { Button } from './ui';
import './json-workspace.css';

function useDraft(value: unknown) {
  const serialized = JSON.stringify(value ?? {}, null, 2);
  const [state, setState] = useState({ base: serialized, text: serialized });
  useEffect(() => {
    setState((previous) => syncJsonDraft(previous, serialized));
  }, [serialized]);
  return {
    text: state.text,
    ...jsonDraftStatus(state, serialized),
    setText: (text: string) => setState((previous) => editJsonDraft(previous, serialized, text)),
    accept: (text: string) => setState({ base: text, text }),
    reset: () => setState({ base: serialized, text: serialized }),
  };
}
type Draft = ReturnType<typeof useDraft>;
const jsonTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--surface)', color: 'var(--text)', fontSize: '12px' },
  '.cm-scroller': { fontFamily: 'Consolas, monospace', overflow: 'auto' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--accent)' },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-soft)',
    color: 'var(--muted)',
    borderRight: '1px solid var(--line)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--accent-soft)' },
});

function JsonPane({
  mode,
  draft,
  definition,
  catalog,
  onApply,
  onResetData,
  compact = false,
  children,
}: {
  mode: 'data' | 'schema';
  draft: Draft;
  definition: SplitTemplate;
  catalog: Catalog;
  onApply: (value: Record<string, unknown>) => void;
  onResetData?: () => void;
  compact?: boolean;
  children?: ReactNode;
}) {
  const [wrapped, setWrapped] = useState(false);
  const [notice, setNotice] = useState('');
  const editor = useRef<ReactCodeMirrorRef>(null);
  const parsed = useMemo(() => parseJsonDocument(draft.text), [draft.text]);
  const problems = useMemo(() => {
    if (!parsed.value) return parsed.problems;
    const list: JsonProblem[] = [...parsed.problems];
    if (mode === 'schema') {
      const issues = validateTemplate(parsed.value, { catalog });
      if (parsed.value.id !== definition.id)
        issues.push({
          severity: 'error',
          path: '$.id',
          message: 'ID открытого шаблона нельзя менять. Создайте отдельный шаблон.',
        });
      issues.forEach((issue) => list.push({ ...issue, ...jsonPathRange(parsed.tree, issue.path) }));
    } else
      validateResolvedData(definition, parsed.value, undefined, catalog).forEach((issue) =>
        list.push({
          ...issue,
          path: issue.dataPath ?? issue.path,
          severity: 'warning',
          ...jsonPathRange(parsed.tree, issue.dataPath ?? '$'),
        }),
      );
    return list;
  }, [parsed, mode, definition, catalog]);
  const blocking = problems.some((problem) => problem.severity === 'error');
  const extensions = useMemo(
    () => [
      json(),
      jsonTheme,
      lintGutter(),
      linter((view) =>
        problems.map((problem) => ({
          from: Math.min(problem.offset, view.state.doc.length),
          to: Math.min(problem.offset + problem.length, view.state.doc.length),
          message: problem.message,
          severity: problem.severity,
        })),
      ),
      ...(wrapped ? [EditorView.lineWrapping] : []),
      EditorView.contentAttributes.of({
        'aria-label': mode === 'data' ? 'JSON: Данные' : 'JSON: Схема',
        spellcheck: 'false',
      }),
    ],
    [problems, wrapped, mode],
  );
  const apply = () => {
    if (!parsed.value || blocking || draft.conflict) return;
    draft.accept(JSON.stringify(parsed.value, null, 2));
    onApply(parsed.value);
    setNotice(mode === 'data' ? 'Тестовые данные применены.' : 'Шаблон обновлён в конструкторе.');
  };
  return (
    <section
      className={'json-editor-pane ' + (compact ? 'json-editor-pane--compact' : '')}
      aria-label={mode === 'data' ? 'Редактор тестовых данных' : 'Редактор шаблона карточки'}
    >
      {children}
      {compact ? (
        <div className="json-inline-pane-heading">
          <Braces size={15} />
          <h3>{mode === 'data' ? 'Тестовые данные' : 'Шаблон карточки'}</h3>
          {draft.dirty && <span>Есть изменения</span>}
        </div>
      ) : (
        <p className="json-mode-hint">
          {mode === 'data' ? (
            <>
              Данные текущего объекта — <code>entity</code>, связанные списки — <code>collections</code>.
              Значения можно дополнять прямо в свойствах поля.
            </>
          ) : (
            'Компоненты и их настройки автоматически обновляют шаблон. Здесь можно внести изменения в JSON.'
          )}
        </p>
      )}
      {draft.conflict && (
        <div className="json-conflict" role="alert">
          <strong>{mode === 'data' ? 'Данные изменились' : 'Шаблон изменился'} в конструкторе.</strong>
          <span>Ваш текст сохранён. Загрузите актуальную версию перед применением.</span>
          <div>
            <Button
              size="sm"
              onClick={() => {
                draft.reset();
                setNotice('Загружена актуальная версия.');
              }}
            >
              Загрузить актуальную версию
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(draft.text);
                  setNotice('Ваш текст скопирован.');
                } catch {
                  setNotice('Выделите и скопируйте текст в редакторе.');
                }
              }}
            >
              <Copy size={13} />
              Скопировать мой текст
            </Button>
          </div>
        </div>
      )}
      <div className="json-editor-tools">
        <Button
          size="sm"
          variant="ghost"
          disabled={!parsed.value}
          onClick={() => draft.setText(JSON.stringify(parsed.value, null, 2))}
        >
          <Braces size={14} />
          {compact ? 'Формат' : 'Форматировать'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={wrapped}
          onClick={() => setWrapped((value) => !value)}
        >
          <WrapText size={14} />
          Перенос
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!draft.dirty}
          onClick={() => {
            draft.reset();
            setNotice('Изменения JSON отменены.');
          }}
        >
          <RotateCcw size={14} />
          Сбросить
        </Button>
      </div>
      <div className="json-code">
        <CodeMirror
          ref={editor}
          value={draft.text}
          height="100%"
          theme="light"
          indentWithTab={false}
          extensions={extensions}
          basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
          onChange={(text) => {
            draft.setText(text);
            setNotice('');
          }}
        />
      </div>
      <div
        className="json-diagnostics"
        aria-label={mode === 'data' ? 'Ошибки данных JSON' : 'Ошибки шаблона JSON'}
        aria-live="polite"
      >
        <div className="json-diagnostics-title">
          {problems.length ? (
            <>
              <AlertCircle size={15} />
              {blocking ? 'Исправьте ошибки' : 'Проверьте значения'} · {problems.length}
            </>
          ) : (
            <>
              <Check size={15} />
              Проверка пройдена
            </>
          )}
        </div>
        {problems.map((problem, index) => {
          const location = jsonLineColumn(draft.text, problem.offset);
          return (
            <button
              type="button"
              key={problem.path + '-' + index}
              onClick={() => {
                const view = editor.current?.view;
                if (view) {
                  view.dispatch({
                    selection: { anchor: Math.min(problem.offset, view.state.doc.length) },
                    scrollIntoView: true,
                  });
                  view.focus();
                }
              }}
            >
              <span>
                Стр. {location.line}:{location.column} · {problem.path}
              </span>
              {problem.message}
            </button>
          );
        })}
      </div>
      <div className="json-apply">
        <Button
          size="sm"
          variant="primary"
          disabled={blocking || !draft.dirty || draft.conflict}
          onClick={apply}
        >
          {mode === 'data' ? 'Применить данные' : 'Применить шаблон'}
        </Button>
        {mode === 'data' && onResetData && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onResetData();
              draft.reset();
              setNotice('Возвращены данные примера.');
            }}
          >
            Данные примера
          </Button>
        )}
        <span role="status">
          {notice || (draft.dirty ? 'Есть неприменённые изменения' : 'Изменения применены')}
        </span>
      </div>
    </section>
  );
}

export default function JsonWorkspace({
  definition,
  data,
  previewData,
  catalog,
  onDefinitionChange,
  onDataChange,
  onPendingChange,
  onLoadExample,
  editorTarget,
  children,
}: {
  definition: SplitTemplate;
  data?: Record<string, unknown>;
  previewData?: Record<string, unknown>;
  catalog: Catalog;
  onDefinitionChange: (definition: SplitTemplate) => void;
  onDataChange: (data: Record<string, unknown> | undefined) => void;
  onPendingChange: (pending: boolean) => void;
  onLoadExample: () => void;
  editorTarget?: HTMLElement | null;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<'data' | 'schema'>('data');
  const dataDraft = useDraft(previewData ?? data);
  const schemaDraft = useDraft(definition);
  const pending = dataDraft.dirty || schemaDraft.dirty;
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const pane = (kind: 'data' | 'schema', compact = false, header?: ReactNode) => (
    <JsonPane
      key={kind}
      mode={kind}
      draft={kind === 'data' ? dataDraft : schemaDraft}
      definition={definition}
      catalog={catalog}
      compact={compact}
      onApply={
        kind === 'data' ? onDataChange : (value) => onDefinitionChange(value as unknown as SplitTemplate)
      }
      onResetData={kind === 'data' && previewData ? () => onDataChange(undefined) : undefined}
    >
      {header}
    </JsonPane>
  );
  if (editorTarget)
    return createPortal(
      <div className="json-inline-stack">
        {pane('data', true)}
        {pane('schema', true)}
      </div>,
      editorTarget,
    );
  const header = (
    <>
      <div className="json-editor-heading">
        <div>
          <Braces size={18} />
          <h2>JSON-редактор</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={onLoadExample}>
          Пример договора
        </Button>
      </div>
      <div className="json-mode-tabs" role="tablist" aria-label="Что редактировать">
        <button role="tab" type="button" aria-selected={mode === 'data'} onClick={() => setMode('data')}>
          Тестовые данные {dataDraft.dirty && <span aria-label="Есть изменения">•</span>}
        </button>
        <button role="tab" type="button" aria-selected={mode === 'schema'} onClick={() => setMode('schema')}>
          Шаблон карточки {schemaDraft.dirty && <span aria-label="Есть изменения">•</span>}
        </button>
      </div>
    </>
  );
  return (
    <div className="json-workspace">
      {pane(mode, false, header)}
      <section className="json-live-preview" aria-label="Предпросмотр JSON">
        {children}
      </section>
    </div>
  );
}
