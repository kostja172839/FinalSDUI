import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Table } from '@salutejs/sdds-finai';
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  ContactRound,
  Image as ImageIcon,
  Gauge,
  SeparatorHorizontal,
  Tag,
  Blocks,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Code2,
  Columns2,
  Download,
  ExternalLink,
  FileText,
  History,
  Layers3,
  LayoutPanelLeft,
  Loader2,
  Monitor,
  PanelRightOpen,
  Plus,
  Puzzle,
  Redo2,
  Save,
  Settings2,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react';
import type {
  Catalog,
  ContentNode,
  EntitySummary,
  HostActionRegistry,
  OpenWidgetIntent,
  PreviewScenario,
  ResolvedSplit,
  SplitTemplate,
  TemplateRecord,
  WidgetResult,
  WidgetRuntimeEvent,
} from '../shared/model';
import { validateTemplate } from '../shared/validation';
import { api, ApiError } from './api';
import { Builder } from './builder';
import { createNode } from './builder/operations';
import { FormattedValue, SplitView } from './runtime/SplitView';
import { Button, IconButton, Input, Select } from './ui';
import { PreviewDataEditor } from './PreviewDataEditor';
import { ExternalWidgetHost } from './runtime/connector';
import { demoWidgetRegistry } from './runtime/widgets';
import { canonicalizeDefinition } from '../shared/values';
import { contractExampleDefinition, contractExampleData } from '../shared/seeds';
import { demoErpTableAdapter } from './demo/ErpTableDemo';

const JsonWorkspace = lazy(() => import('./JsonWorkspace'));

type Page = 'builder' | 'application' | 'components' | 'json';
type Utility = 'help' | 'versions' | 'contract' | 'preview' | null;
const nodeMeta = {
  fields: {
    title: 'Группа реквизитов',
    description: 'Поля с подписями, форматами и адаптивным расположением.',
    icon: Columns2,
  },
  section: {
    title: 'Сворачиваемый раздел',
    description: 'Группировка связанных сведений и управление раскрытием.',
    icon: Layers3,
  },
  text: {
    title: 'Описание',
    description: 'Длинный текст с сохранением переносов и возможностью свернуть.',
    icon: FileText,
  },
  table: {
    title: 'Таблица из данных',
    description: 'Снимок связанных данных с колонками, поиском и страницами.',
    icon: LayoutPanelLeft,
  },
  erpTable: {
    title: 'ERP-таблица',
    description: 'Ваш ErpTableWidget сам загружает данные и настройки по tableUrl.',
    icon: LayoutPanelLeft,
  },
  badge: { title: 'Статус', description: 'Отдельный статус или метка на Badge из FinAI.', icon: Tag },
  avatar: {
    title: 'Аватар',
    description: 'Пользователь или организация: имя и изображение.',
    icon: ContactRound,
  },
  image: {
    title: 'Изображение',
    description: 'Изображение из API или по заданному адресу.',
    icon: ImageIcon,
  },
  progress: { title: 'Прогресс', description: 'Прогресс по значению и настроенному максимуму.', icon: Gauge },
  divider: {
    title: 'Разделитель',
    description: 'Визуальное разделение содержимого с необязательной подписью.',
    icon: SeparatorHorizontal,
  },
  widget: {
    title: 'Встроенный виджет',
    description: 'Зарегистрированный микрофронтенд с контекстом объекта.',
    icon: Puzzle,
  },
  callout: {
    title: 'Информационное сообщение',
    description: 'Уведомление, подсказка или предупреждение внутри карточки.',
    icon: CircleHelp,
  },
  metrics: {
    title: 'Суммы и показатели',
    description: 'Значения с подписями и пояснениями, например суммы с НДС и без НДС.',
    icon: Columns2,
  },
  recordList: {
    title: 'Карточки сущностей',
    description: 'Список контрагентов или других связанных объектов с реквизитами.',
    icon: Layers3,
  },
  documents: {
    title: 'Документы и связи',
    description: 'Файлы и связанные записи со статусом, размером и открытием виджета.',
    icon: FileText,
  },
};
function findNode(nodes: ContentNode[], type: ContentNode['type']): ContentNode | undefined {
  for (const node of nodes) {
    if (node.type === type) return node;
    if (node.type === 'section') {
      const found = findNode(node.children, type);
      if (found) return found;
    }
  }
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog>();
  const [records, setRecords] = useState<TemplateRecord[]>([]);
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [record, setRecord] = useState<TemplateRecord>();
  const [definition, setDefinition] = useState<SplitTemplate>();
  const [entityId, setEntityId] = useState('asset-001');
  const [page, setPage] = useState<Page>('builder');
  const [jsonVisited, setJsonVisited] = useState(false);
  const [inlineEditors, setInlineEditors] = useState(false);
  const [inlineEditorTarget, setInlineEditorTarget] = useState<HTMLDivElement | null>(null);
  const [jsonPending, setJsonPending] = useState(false);
  const [jsonResetKey, setJsonResetKey] = useState(0);
  const [editorInvalid, setEditorInvalid] = useState(false);
  const [selection, setSelection] = useState('$header');
  const [scenario, setScenario] = useState<PreviewScenario>('normal');
  const [previewData, setPreviewData] = useState<Record<string, unknown>>();
  const [document, setDocument] = useState<ResolvedSplit>();
  const currentDocument = useRef(document);
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [initialError, setInitialError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [utility, setUtility] = useState<Utility>(null);
  const [opened, setOpened] = useState(true);
  const [width, setWidth] = useState(0);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [componentType, setComponentType] = useState<ContentNode['type']>('fields');
  const [past, setPast] = useState<SplitTemplate[]>([]);
  const [future, setFuture] = useState<SplitTemplate[]>([]);
  const [widgetRequest, setWidgetRequest] = useState<OpenWidgetIntent>();
  const pendingWidgets = useRef(new Map<string, OpenWidgetIntent>());
  const readyDocument =
    document?.entityId === entityId &&
    document?.templateId === record?.id &&
    (page === 'application'
      ? document?.templateRevision === record?.activeRevision
      : document?.templateRevision === 'draft')
      ? document
      : undefined;
  currentDocument.current = opened ? readyDocument : undefined;
  const dirty = Boolean(
    definition &&
      record &&
      JSON.stringify(definition) !== JSON.stringify(canonicalizeDefinition(record.draft)),
  );
  const issues = useMemo(
    () => (definition ? validateTemplate(definition, { catalog }) : []),
    [definition, catalog],
  );
  const errors = issues.filter((issue) => issue.severity === 'error');
  const refresh = useCallback(() => setRefreshEpoch((epoch) => epoch + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<Catalog>('/catalog', undefined, 'GET', controller.signal),
      api<TemplateRecord[]>('/templates', undefined, 'GET', controller.signal),
      api<EntitySummary[]>('/entities', undefined, 'GET', controller.signal),
    ])
      .then(([nextCatalog, nextRecords, nextEntities]) => {
        setCatalog(nextCatalog);
        setRecords(nextRecords);
        setEntities(nextEntities);
        setRecord(nextRecords[0]);
        setDefinition(canonicalizeDefinition(nextRecords[0].draft));
        setEntityId(nextEntities[0].id);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setInitialError(error.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty || jsonPending) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty, jsonPending]);
  const effectiveDefinition = useMemo(() => {
    if (!definition || !catalog || page !== 'components') return definition;
    const richExample = ['callout', 'metrics', 'recordList', 'documents'].includes(componentType);
    let selected =
      (richExample
        ? findNode(
            contractExampleDefinition.tabs.flatMap((tab) => tab.nodes),
            componentType,
          )
        : undefined) ??
      findNode(
        definition.tabs.flatMap((tab) => tab.nodes),
        componentType,
      ) ??
      createNode(componentType, catalog);
    if (selected.type === 'erpTable' && selected.tableUrl.kind === 'literal' && !selected.tableUrl.value)
      selected = { ...selected, tableUrl: { kind: 'literal', value: '/demo/erp-table' } };
    return {
      ...definition,
      header: {
        ...(richExample ? contractExampleDefinition.header : definition.header),
        titleBinding: 'entity.title',
      },
      tabs: [{ id: 'component-preview', title: nodeMeta[componentType].title, nodes: [selected] }],
    };
  }, [definition, catalog, page, componentType]);
  useEffect(() => {
    if (!record || !effectiveDefinition) return;
    const controller = new AbortController();
    let disposed = false;
    setLoadingPreview(true);
    setPreviewError('');
    const timer = setTimeout(
      () => {
        api<ResolvedSplit>(
          '/resolve',
          {
            templateId: record.id,
            entityId,
            mode: page === 'application' ? 'published' : 'draft',
            ...(page === 'application'
              ? {}
              : {
                  definition: effectiveDefinition,
                  ...(page === 'components' &&
                  ['callout', 'metrics', 'recordList', 'documents'].includes(componentType)
                    ? { previewData: contractExampleData }
                    : previewData
                      ? { previewData }
                      : {}),
                }),
            scenario: page === 'application' ? 'normal' : scenario,
          },
          'POST',
          controller.signal,
        )
          .then((next) => {
            if (disposed) return;
            setDocument((previous) => ({
              ...next,
              instanceId:
                previous?.entityId === next.entityId &&
                previous.templateId === next.templateId &&
                previous.templateRevision === next.templateRevision
                  ? previous.instanceId
                  : next.instanceId,
            }));
            setPreviewError('');
          })
          .catch((error) => {
            if (!disposed && error.name !== 'AbortError') setPreviewError(error.message);
          })
          .finally(() => {
            if (!disposed) setLoadingPreview(false);
          });
      },
      page === 'application' ? 0 : 250,
    );
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    record?.id,
    record?.activeRevision,
    effectiveDefinition,
    entityId,
    scenario,
    page,
    refreshEpoch,
    previewData,
    componentType,
  ]);
  useEffect(() => {
    const onResult = (event: Event) => {
      const result = (event as CustomEvent<WidgetResult>).detail;
      if (
        !result ||
        typeof result.correlationId !== 'string' ||
        !['completed', 'cancelled'].includes(result.status)
      )
        return;
      const request = pendingWidgets.current.get(result.correlationId);
      if (!request) return;
      pendingWidgets.current.delete(result.correlationId);
      setWidgetRequest((current) => (current?.correlationId === result.correlationId ? undefined : current));
      const active = currentDocument.current;
      if (request.context.entityId !== active?.entityId || request.context.instanceId !== active?.instanceId)
        return;
      if (result.status === 'completed' && result.dataChanged) {
        refresh();
        setNotice('Виджет сообщил об изменении. Данные карточки обновлены.');
      } else
        setNotice(
          result.status === 'cancelled' ? 'Виджет закрыт без изменений' : 'Просмотр виджета завершён',
        );
    };
    window.addEventListener('sdui:widget-result', onResult);
    return () => window.removeEventListener('sdui:widget-result', onResult);
  }, [refresh]);
  const actionHandlers = useMemo<HostActionRegistry>(
    () => ({
      'demo.inspectParams': ({ context, params }) => {
        const active = currentDocument.current;
        if (context.entityId !== active?.entityId || context.instanceId !== active?.instanceId)
          throw new Error('Карточка изменилась. Повторите действие в текущем сплите.');
        if (typeof params.message !== 'string' || !params.message.trim())
          throw new Error('Передайте непустой текст в параметре «Сообщение».');
        setNotice(`Демонстрация: ${params.message}. Параметры получены, бизнес-данные не изменены.`);
      },
    }),
    [],
  );
  const openWidget = (intent: OpenWidgetIntent) => {
    if (!catalog?.widgets.some((widget) => widget.id === intent.widgetId && widget.mode === 'external')) {
      setNotice('Виджет не зарегистрирован для отдельного открытия');
      return;
    }
    pendingWidgets.current.clear();
    pendingWidgets.current.set(intent.correlationId, intent);
    setWidgetRequest(intent);
    window.dispatchEvent(new CustomEvent('sdui:open-widget', { detail: intent }));
  };
  const reportWidgetResult = (result: WidgetResult) =>
    window.dispatchEvent(new CustomEvent('sdui:widget-result', { detail: result }));
  const handleWidgetEvent = (event: WidgetRuntimeEvent) => {
    if (event.type === 'host') setNotice(`Хост получил событие «${event.name}»`);
    else if (event.type === 'dataChanged') refresh();
    else if (event.type === 'error') setNotice(event.message);
  };
  const widgetResult = (status: WidgetResult['status'], dataChanged = false) => {
    if (widgetRequest)
      window.dispatchEvent(
        new CustomEvent('sdui:widget-result', {
          detail: { correlationId: widgetRequest.correlationId, status, dataChanged },
        }),
      );
  };
  const change = (next: SplitTemplate) => {
    if (busy || !definition) return;
    setPast((items) => [...items, definition].slice(-60));
    setFuture([]);
    setDefinition(next);
  };
  const undo = () => {
    if (!definition || !past.length || busy) return;
    setFuture((items) => [definition, ...items]);
    setDefinition(past[past.length - 1]);
    setPast((items) => items.slice(0, -1));
  };
  const redo = () => {
    if (!definition || !future.length || busy) return;
    setPast((items) => [...items, definition]);
    setDefinition(future[0]);
    setFuture((items) => items.slice(1));
  };
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (
        page !== 'builder' ||
        busy ||
        event.defaultPrevented ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey)
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      const key = event.key.toLowerCase();
      const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
      if ((key === 'z' && !event.shiftKey && past.length) || (isRedo && future.length)) {
        event.preventDefault();
        if (isRedo) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [page, busy, definition, past, future]);
  const updateRecord = (next: TemplateRecord) => {
    setRecord(next);
    setRecords((items) =>
      items.some((item) => item.id === next.id)
        ? items.map((item) => (item.id === next.id ? next : item))
        : [...items, next],
    );
  };
  const chooseRecord = (id: string) => {
    if (
      (dirty || jsonPending) &&
      !window.confirm('Есть несохранённые изменения. Переключить шаблон и отменить их?')
    )
      return;
    const next = records.find((item) => item.id === id);
    if (!next) return;
    setRecord(next);
    setDefinition(canonicalizeDefinition(next.draft));
    setPast([]);
    setFuture([]);
    setSelection('$header');
    setOpened(true);
  };
  const save = async (publish = false) => {
    if (!record || !definition || busy || jsonPending || editorInvalid) return;
    setBusy(true);
    try {
      let saved = record;
      if (dirty) {
        saved = await api<TemplateRecord>(
          `/templates/${record.id}`,
          { definition, expectedDraftVersion: record.draftVersion },
          'PUT',
        );
        updateRecord(saved);
      }
      if (publish)
        saved = await api<TemplateRecord>(`/templates/${record.id}/publish`, {
          expectedDraftVersion: saved.draftVersion,
        });
      updateRecord(saved);
      setNotice(
        publish
          ? `Опубликована версия ${saved.activeRevision}. Она доступна в приложении.`
          : 'Черновик сохранён на сервере',
      );
    } catch (error) {
      setNotice(
        error instanceof ApiError && error.status === 409
          ? 'Черновик изменён в другой сессии. Экспортируйте изменения и перезагрузите страницу.'
          : (error as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  const newTemplate = async () => {
    if (!record || busy) return;
    if (
      (dirty || jsonPending) &&
      !window.confirm(
        'Есть несохранённые или неприменённые изменения. Создать шаблон из сохранённой версии и отменить их?',
      )
    )
      return;
    setBusy(true);
    try {
      const next = await api<TemplateRecord>('/templates', {
        name: 'Новая карточка объекта',
        baseId: record.id,
      });
      updateRecord(next);
      setDefinition(canonicalizeDefinition(next.draft));
      setPast([]);
      setFuture([]);
      setSelection('$header');
      setPage('builder');
      setNotice('Создан новый черновик. Настройте его название и содержимое.');
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const activate = async (revision: number) => {
    if (!record || busy) return;
    setBusy(true);
    try {
      const next = await api<TemplateRecord>(`/templates/${record.id}/activate`, { revision });
      updateRecord({ ...next, draft: record.draft, draftVersion: record.draftVersion });
      setNotice(`Для приложения выбрана версия ${revision}`);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const exportDefinition = () => {
    if (!definition) return;
    const blob = new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${definition.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const selectNode = (id: string) => {
    setSelection(id);
  };
  const navigate = (next: Page) => {
    if (next === 'json') setJsonVisited(true);
    setPage(next);
    setOpened(true);
    setUtility(null);
    setWidgetRequest(undefined);
    pendingWidgets.current.clear();
  };
  const loadContractExample = () => {
    if (
      (dirty || jsonPending) &&
      !window.confirm('Заменить текущий черновик примером договора? Сохранённая версия останется прежней.')
    )
      return;
    if (!definition) return;
    change({ ...structuredClone(contractExampleDefinition), id: definition.id });
    setPreviewData(structuredClone(contractExampleData));
    setScenario('normal');
    setOpened(true);
    setSelection('$header');
    setJsonPending(false);
    setJsonResetKey((value) => value + 1);
    setNotice('Пример договора загружен в черновик. Сохранение и публикация доступны отдельно.');
  };

  if (initialError)
    return (
      <div className="boot-screen">
        <ShieldCheck size={36} />
        <h1>Не удалось подключиться к серверу</h1>
        <p>{initialError}</p>
        <p>
          Запустите проект командой <code>pnpm dev</code> и обновите страницу.
        </p>
        <Button onClick={() => location.reload()}>Повторить</Button>
      </div>
    );
  if (!catalog || !record || !definition)
    return (
      <div className="boot-screen">
        <Loader2 className="spin" size={28} />
        <p>Загружаем рабочее пространство…</p>
      </div>
    );

  const preview = (
    <div className="preview-workspace">
      <div className="preview-controls">
        <div className="preview-controls-title">
          <Monitor size={16} />
          <strong>Предпросмотр</strong>
          <span>Данные для проверки</span>
        </div>
        <div className="preview-selectors">
          <Select
            aria-label="Объект для предпросмотра"
            value={entityId}
            options={entities.map((entity) => ({ value: entity.id, label: entity.title }))}
            onChange={(event) => setEntityId(event.target.value)}
          />
          <Select
            aria-label="Сценарий предпросмотра"
            value={scenario}
            options={[
              { value: 'normal', label: 'Обычные данные' },
              { value: 'long', label: 'Длинные значения' },
              { value: 'empty', label: 'Пустые значения' },
              { value: 'error', label: 'Ошибка источника' },
            ]}
            onChange={(event) => setScenario(event.target.value as PreviewScenario)}
          />
        </div>
      </div>
      <div className="preview-ruler">
        <span>Сплит · {width ? `${width} px` : 'Адаптивная ширина'}</span>
        <div>
          {[0, 600, 840].map((value) => (
            <button type="button" key={value} aria-pressed={width === value} onClick={() => setWidth(value)}>
              {value || 'Авто'}
            </button>
          ))}
        </div>
      </div>
      <div className="preview-viewport" aria-busy={loadingPreview}>
        {previewError && !readyDocument ? (
          <div className="preview-error">
            <ShieldCheck size={30} />
            <h3>Проверьте настройки карточки</h3>
            <p>{previewError}</p>
            <span>Ошибки выделены в свойствах элементов.</span>
          </div>
        ) : readyDocument && opened ? (
          <SplitView
            key={`${record.id}-${entityId}`}
            document={readyDocument}
            previewWidth={width}
            selectedNodeId={page === 'builder' ? selection : undefined}
            onSelectNode={page === 'builder' ? selectNode : undefined}
            onClose={() => {
              setOpened(false);
              pendingWidgets.current.clear();
              setWidgetRequest(undefined);
            }}
            onRefresh={refresh}
            onOpenWidget={openWidget}
            onWidgetEvent={handleWidgetEvent}
            actionHandlers={actionHandlers}
            actionDescriptors={catalog.actions}
            tableRefreshToken={refreshEpoch}
            erpTableAdapter={demoErpTableAdapter}
          />
        ) : !opened ? (
          <div className="preview-error">
            <PanelRightOpen size={30} />
            <p>Предпросмотр закрыт</p>
            <Button onClick={() => setOpened(true)}>Открыть сплит</Button>
          </div>
        ) : (
          <div className="preview-error">
            <Loader2 className="spin" size={24} />
            <p>Получаем карточку с сервера…</p>
          </div>
        )}
        {loadingPreview && document && !previewError && (
          <span className="preview-updating">
            <Loader2 size={12} className="spin" />
            Обновляем
          </span>
        )}
        {previewError && readyDocument && (
          <div className="preview-validation-notice" role="status">
            <AlertCircle size={15} />
            <span>{previewError} Показана последняя корректная карточка.</span>
          </div>
        )}
      </div>
      <div className="preview-footnote">
        <ShieldCheck size={13} />
        <span>Один рендерер для конструктора и приложения</span>
        <span>SDDS FinAI</span>
      </div>
    </div>
  );

  return (
    <div className={`app-shell page-${page}`}>
      <aside className="app-rail">
        <a
          className="app-brand"
          href="#"
          aria-label="Split Studio"
          onClick={(event) => {
            event.preventDefault();
            navigate('builder');
          }}
        >
          <PanelsLogo />
        </a>
        <div className="rail-navigation">
          <button
            aria-label="Конструктор"
            title="Конструктор"
            className={page === 'builder' ? 'active' : ''}
            onClick={() => navigate('builder')}
          >
            <LayoutPanelLeft size={21} />
          </button>
          <button
            aria-label="Приложение"
            title="Приложение"
            className={page === 'application' ? 'active' : ''}
            onClick={() => navigate('application')}
          >
            <Monitor size={21} />
          </button>
          <button
            aria-label="Каталог блоков"
            title="Каталог блоков"
            className={page === 'components' ? 'active' : ''}
            onClick={() => navigate('components')}
          >
            <Blocks size={21} />
          </button>
        </div>
        <button
          className="rail-help"
          aria-label="Как пользоваться"
          title="Как пользоваться"
          onClick={() => setUtility(utility === 'help' ? null : 'help')}
        >
          <CircleHelp size={21} />
        </button>
        <span className="user-avatar" title="Рабочее пространство аналитика">
          АН
        </span>
      </aside>
      <main className="app-main">
        <header className="studio-toolbar">
          <div className="studio-project">
            <h1 className="sr-only">
              {page === 'application'
                ? 'Карточка в приложении'
                : page === 'components'
                  ? 'Каталог блоков'
                  : definition.name}
            </h1>
            <span className="studio-label">Split Studio</span>
            <Select
              aria-label="Шаблон карточки"
              disabled={busy}
              value={record.id}
              options={records.map((item) => ({ value: item.id, label: item.draft.name }))}
              onChange={(event) => chooseRecord(event.target.value)}
            />
            <IconButton label="Создать шаблон" disabled={busy} onClick={newTemplate}>
              <Plus size={17} />
            </IconButton>
            <span
              className={`studio-draft-dot ${dirty ? 'is-dirty' : ''}`}
              title={dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}
              aria-label={dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}
            />
          </div>
          <nav className="studio-modes" aria-label="Режим работы">
            <button
              title="Конструктор"
              className={page === 'builder' ? 'active' : ''}
              onClick={() => navigate('builder')}
            >
              <LayoutPanelLeft size={16} />
              <span>Конструктор</span>
            </button>
            <button
              title="JSON-редактор"
              aria-label="JSON-редактор"
              className={`json-mode ${page === 'json' ? 'active' : ''}`}
              onClick={() => navigate('json')}
            >
              <Code2 size={16} />
              <span>JSON</span>
            </button>
            <button
              title="Приложение"
              className={page === 'application' ? 'active' : ''}
              onClick={() => navigate('application')}
            >
              <Monitor size={16} />
              <span>Приложение</span>
            </button>
            <button
              title="Каталог блоков"
              className={page === 'components' ? 'active' : ''}
              onClick={() => navigate('components')}
            >
              <Blocks size={16} />
              <span>Блоки</span>
            </button>
          </nav>
          <div className="studio-tools">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Данные"
              className="data-settings-button"
              title="Данные предпросмотра"
              onClick={() => setUtility(utility === 'preview' ? null : 'preview')}
            >
              <Settings2 size={16} />
              <span>Данные</span>
            </Button>
            <div className="studio-history">
              <IconButton label="Отменить изменение" disabled={!past.length || busy} onClick={undo}>
                <Undo2 size={16} />
              </IconButton>
              <IconButton label="Повторить изменение" disabled={!future.length || busy} onClick={redo}>
                <Redo2 size={16} />
              </IconButton>
            </div>
            <IconButton
              label="Версии шаблона"
              onClick={() => setUtility(utility === 'versions' ? null : 'versions')}
            >
              <History size={17} />
            </IconButton>
            <IconButton label="Скачать JSON шаблона" onClick={exportDefinition}>
              <Download size={17} />
            </IconButton>
            <Button
              size="sm"
              aria-label="Сохранить"
              title="Сохранить черновик"
              disabled={busy || !dirty || jsonPending || editorInvalid}
              onClick={() => save()}
            >
              <Save size={15} />
              <span>Сохранить</span>
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || errors.length > 0 || editorInvalid || jsonPending}
              onClick={() => save(true)}
            >
              {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
              <span>Опубликовать</span>
            </Button>
          </div>
        </header>
        <div className="workspace-content">
          {page === 'builder' && (
            <Builder
              definition={definition}
              catalog={catalog}
              onChange={change}
              selectedNodeId={selection}
              onSelectNode={selectNode}
              issues={issues}
              onValidityChange={setEditorInvalid}
              data={previewData ?? readyDocument?.data}
              onDataChange={setPreviewData}
            >
              <div className="constructor-canvas">
                <div className="constructor-canvas-toolbar">
                  <span>Предпросмотр</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={inlineEditors}
                    aria-label="Данные и шаблон"
                    aria-controls="constructor-json-dock"
                    onClick={() => {
                      setJsonVisited(true);
                      setInlineEditors((value) => !value);
                    }}
                  >
                    <Code2 size={15} />
                    Данные и шаблон
                    {jsonPending && (
                      <span className="constructor-pending" aria-label="Есть неприменённые изменения" />
                    )}
                  </Button>
                </div>
                <div className={'constructor-workspace ' + (inlineEditors ? 'has-editors' : '')}>
                  <div className="constructor-live-preview">{preview}</div>
                  <aside
                    id="constructor-json-dock"
                    className="constructor-json-dock"
                    hidden={!inlineEditors}
                    aria-label="Данные и шаблон в конструкторе"
                  >
                    <div className="constructor-dock-heading">
                      <strong>Данные и шаблон</strong>
                      <IconButton
                        label="Закрыть редакторы конструктора"
                        onClick={() => setInlineEditors(false)}
                      >
                        <X size={15} />
                      </IconButton>
                    </div>
                    <div className="constructor-editor-target" ref={setInlineEditorTarget} />
                  </aside>
                </div>
              </div>
            </Builder>
          )}
          {jsonVisited && (
            <div className="json-page" hidden={page !== 'json'}>
              <Suspense
                fallback={
                  <div className="boot-screen">
                    <Loader2 className="spin" size={24} />
                    <p>Загружаем JSON-редактор…</p>
                  </div>
                }
              >
                <JsonWorkspace
                  key={`${record.id}-${jsonResetKey}`}
                  definition={definition}
                  data={readyDocument?.data}
                  previewData={previewData}
                  catalog={catalog}
                  onDefinitionChange={change}
                  onDataChange={setPreviewData}
                  onPendingChange={setJsonPending}
                  onLoadExample={loadContractExample}
                  editorTarget={page === 'builder' ? inlineEditorTarget : null}
                >
                  {page === 'json' ? preview : null}
                </JsonWorkspace>
              </Suspense>
            </div>
          )}
          {page === 'components' && (
            <div className="component-gallery">
              <aside>
                <h2>Блоки просмотра</h2>
                <p>Каждый блок имеет собственный контракт и настройки.</p>
                {(Object.keys(nodeMeta) as ContentNode['type'][])
                  .filter(
                    (type) =>
                      catalog.nodeTypes.includes(type) &&
                      (catalog.authoringNodeTypes ?? catalog.nodeTypes).includes(type),
                  )
                  .map((type) => {
                    const meta = nodeMeta[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        className={componentType === type ? 'active' : ''}
                        onClick={() => setComponentType(type)}
                      >
                        <meta.icon size={19} />
                        <span>
                          <strong>{meta.title}</strong>
                          <small>{meta.description}</small>
                        </span>
                        <ArrowRight size={15} />
                      </button>
                    );
                  })}
                <div className="catalog-integration">
                  <Puzzle size={19} />
                  <strong>Микрофронтенды через хост</strong>
                  <p>Виджет получает контекст объекта и возвращает события через стабильный интерфейс.</p>
                  <button type="button" onClick={() => setUtility('contract')}>
                    Посмотреть контракт
                    <ArrowRight size={13} />
                  </button>
                </div>
              </aside>
              {preview}
            </div>
          )}
          {page === 'application' && (
            <div className="application-demo">
              <div className="demo-page-heading">
                <div>
                  <h2>Реестр активов</h2>
                  <p>Выберите строку, чтобы открыть карточку объекта.</p>
                </div>
                <span>Данные вымышлены</span>
              </div>
              <div className={`demo-columns ${opened ? 'has-split' : ''}`}>
                <div className="demo-register">
                  <Table
                    size="s"
                    borderVariant="rows"
                    data={entities.map((entity) => ({ ...entity }))}
                    columns={[
                      { id: 'title', label: 'Наименование', width: 280 },
                      { id: 'inventoryNumber', label: 'Инвентарный номер', width: 160 },
                      {
                        id: 'status',
                        label: 'Статус',
                        width: 120,
                        renderCell: (value) => <FormattedValue value={value} format="status" />,
                      },
                    ]}
                    setRowProps={(row) => ({
                      onClick: () => {
                        setEntityId(row.id);
                        setOpened(true);
                      },
                      tabIndex: 0,
                      onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                          setEntityId(row.id);
                          setOpened(true);
                        }
                      },
                      'aria-selected': opened && entityId === row.id,
                      className: opened && entityId === row.id ? 'selected-entity-row' : '',
                    })}
                  />
                  <p className="demo-register-note">
                    <ShieldCheck size={14} />
                    Рабочий экран использует только опубликованную версию. Черновик на него не влияет.
                  </p>
                  {!opened && (
                    <Button onClick={() => setOpened(true)}>
                      <PanelRightOpen size={16} />
                      Открыть карточку
                    </Button>
                  )}
                </div>
                {opened && (
                  <div className="demo-split-area">
                    {previewError ? (
                      <div className="preview-error">
                        <p>{previewError}</p>
                        <Button onClick={() => navigate('builder')}>Вернуться к конструктору</Button>
                      </div>
                    ) : (
                      readyDocument && (
                        <SplitView
                          key={`${record.id}-${entityId}`}
                          document={readyDocument}
                          floating
                          onClose={() => {
                            setOpened(false);
                            pendingWidgets.current.clear();
                            setWidgetRequest(undefined);
                          }}
                          onRefresh={refresh}
                          onOpenWidget={openWidget}
                          onWidgetEvent={handleWidgetEvent}
                          actionHandlers={actionHandlers}
                          actionDescriptors={catalog.actions}
                          tableRefreshToken={refreshEpoch}
                          erpTableAdapter={demoErpTableAdapter}
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <footer className="app-statusbar">
          <span>
            <span className="connection-dot" />
            Бэкенд подключён
          </span>
          <span>
            SDUI v1<span className="status-separator">·</span>Просмотр карточек
            <span className="status-separator">·</span>
            <button onClick={() => setUtility('contract')}>Контракт интеграции</button>
          </span>
        </footer>
      </main>
      {utility && (
        <aside className="utility-panel">
          <div className="utility-heading">
            <h2>
              {utility === 'help'
                ? 'Как собрать карточку'
                : utility === 'versions'
                  ? 'Версии шаблона'
                  : utility === 'preview'
                    ? 'Данные предпросмотра'
                    : 'Интеграция виджетов'}
            </h2>
            <IconButton label="Закрыть панель" onClick={() => setUtility(null)}>
              <X size={18} />
            </IconButton>
          </div>
          <div className="utility-content">
            {utility === 'preview' ? (
              <div className="preview-settings">
                <p>
                  Проверьте карточку на разных данных. Настройки действуют только в предпросмотре и не меняют
                  шаблон.
                </p>
                <Select
                  label="Объект"
                  value={entityId}
                  options={entities.map((entity) => ({ value: entity.id, label: entity.title }))}
                  onChange={(event) => setEntityId(event.target.value)}
                />
                {page !== 'application' && (
                  <>
                    <Select
                      label="Сценарий"
                      value={scenario}
                      options={[
                        { value: 'normal', label: 'Обычные данные' },
                        { value: 'long', label: 'Длинные значения' },
                        { value: 'empty', label: 'Пустые значения' },
                        { value: 'error', label: 'Ошибка источника' },
                      ]}
                      onChange={(event) => setScenario(event.target.value as PreviewScenario)}
                    />
                    <Select
                      label="Ширина сплита"
                      value={String(width)}
                      options={[
                        { value: '0', label: 'По ширине рабочей области' },
                        { value: '600', label: '600 px — минимальная' },
                        { value: '840', label: '840 px — стандартная' },
                      ]}
                      onChange={(event) => setWidth(Number(event.target.value))}
                    />
                    <PreviewDataEditor
                      data={readyDocument?.data}
                      value={previewData}
                      onChange={setPreviewData}
                    />
                  </>
                )}
                <div className="utility-note">
                  В приложении открывается опубликованная версия {record.activeRevision ?? '—'}. У сплита
                  единая прокрутка содержимого, закреплённая шапка и нижняя панель.
                </div>
              </div>
            ) : utility === 'help' ? (
              <>
                <p>
                  Начните с готовой карточки. Выбирайте элементы слева или прямо в предпросмотре — их
                  настройки появятся справа.
                </p>
                <ol>
                  <li>
                    <strong>Настройте значения.</strong> Укажите любой путь к данным API или своё значение.
                    Каталог подсказывает знакомые поля и примеры, но не ограничивает выбор.
                  </li>
                  <li>
                    <strong>Соберите разделы.</strong> Добавляйте группы реквизитов, описания, таблицы и
                    виджеты. Меняйте порядок кнопками со стрелками.
                  </li>
                  <li>
                    <strong>Проверьте состояния.</strong> Переключите длинные, пустые данные и ошибку
                    источника. Проверьте узкую ширину.
                  </li>
                  <li>
                    <strong>Сохраните и опубликуйте.</strong> Сохранение обновляет черновик. Публикация
                    создаёт версию для приложения.
                  </li>
                </ol>
                <div className="utility-note">
                  Система сама управляет отступами, переносами и прокруткой. Настройки Figma вроде Hug и Fill
                  здесь не нужны.
                </div>
                <a href="https://plasma.sberdevices.ru/sdds-finai/" target="_blank" rel="noreferrer">
                  Документация SDDS FinAI
                  <ExternalLink size={13} />
                </a>
              </>
            ) : utility === 'versions' ? (
              <>
                <p>
                  Публикация фиксирует содержимое карточки. Можно переключить приложение на любую сохранённую
                  версию.
                </p>
                {[...record.versions].reverse().map((version) => (
                  <div className="version-row" key={version.revision}>
                    <div>
                      <strong>Версия {version.revision}</strong>
                      {version.revision === record.activeRevision && (
                        <span className="version-active">В приложении</span>
                      )}
                      <p>
                        {new Intl.DateTimeFormat('ru-RU', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'Europe/Moscow',
                        }).format(new Date(version.createdAt))}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={version.revision === record.activeRevision || busy}
                      onClick={() => activate(version.revision)}
                    >
                      Использовать
                    </Button>
                  </div>
                ))}
                {!record.versions.length && (
                  <p>Опубликованных версий пока нет. Проверьте карточку и нажмите «Опубликовать».</p>
                )}
              </>
            ) : (
              <>
                <p>
                  Хост регистрирует микрофронты и их <code>name</code>. В SDUI задаются
                  <code>widgetId</code>, параметры <code>props</code> и события <code>events</code>.
                </p>
                <h3>SberERPConnector</h3>
                <p>
                  Адаптер <code>createSberERPWidgetAdapter</code> принимает ваш Connector и передаёт ему
                  <code>name</code> и <code>data</code>, как в ваших проектах. Значения берутся из любого пути
                  API или задаются явно. Обработчики, включая вложенные, создаёт хост.
                </p>
                <h3>Встроенный виджет</h3>
                <p>
                  <code>mount(container, context, emit, input)</code> возвращает <code>unmount()</code>.
                  Контекст включает объект, экземпляр сплита и локаль; input содержит параметры и события.
                </p>
                <h3>Отдельное открытие</h3>
                <p>
                  Событие <code>sdui:open-widget</code> передаёт ID виджета, контекст и{' '}
                  <code>correlationId</code>. Хост открывает микрофронтенд своим способом.
                </p>
                <h3>Результат работы</h3>
                <p>
                  Хост отправляет <code>sdui:widget-result</code>. Результат с <code>dataChanged: true</code>{' '}
                  обновляет сведения текущего объекта.
                </p>
                <div className="utility-note">
                  Локальные примеры показывают передачу параметров и вызов событий. Для запуска ваших
                  микрофронтов подключите настоящий SberERPConnector и зарегистрируйте их в хосте.
                </div>
              </>
            )}
          </div>
        </aside>
      )}
      {widgetRequest && demoWidgetRegistry[widgetRequest.widgetId] ? (
        <ExternalWidgetHost
          intent={widgetRequest}
          registry={demoWidgetRegistry}
          onResult={reportWidgetResult}
          onHostEvent={handleWidgetEvent}
          chrome
        />
      ) : (
        widgetRequest && (
          <aside className="widget-request-panel" aria-label="Запрос хосту на открытие виджета">
            <div className="utility-heading">
              <h2>
                <Puzzle size={19} />
                Запрос на открытие виджета
              </h2>
              <IconButton label="Отменить открытие виджета" onClick={() => widgetResult('cancelled')}>
                <X size={17} />
              </IconButton>
            </div>
            <div className="utility-content">
              <Badge size="xs" view="accent" text="Проверка интеграции" transparent />
              <p>Хост получил команду. В вашей системе здесь откроется отдельный микрофронтенд.</p>
              <dl className="intent-details">
                <dt>Виджет</dt>
                <dd>{catalog.widgets.find((widget) => widget.id === widgetRequest.widgetId)?.name}</dd>
                <dt>Объект</dt>
                <dd>{widgetRequest.context.entityId}</dd>
                <dt>Событие</dt>
                <dd>
                  <code>sdui:open-widget</code>
                </dd>
              </dl>
              <p className="ui-hint">Кнопки ниже имитируют ответ хоста и не изменяют бизнес-данные.</p>
              <Button onClick={() => widgetResult('completed', true)}>
                <RefreshIcon />
                Проверить обновление данных
              </Button>
              <Button variant="ghost" onClick={() => widgetResult('completed')}>
                Завершить просмотр
              </Button>
            </div>
          </aside>
        )
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button type="button" aria-label="Закрыть уведомление" onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function PanelsLogo() {
  return (
    <svg width="25" height="25" viewBox="0 0 25 25" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="20" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M10 4v17M16 9h3M16 13h3M16 17h2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ChevronSeparator() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="m4.5 3 3 3-3 3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13 7a5 5 0 1 0-1 4M13 3v4H9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
