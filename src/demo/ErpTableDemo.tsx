import { forwardRef, useImperativeHandle, useState } from 'react';
import { Badge, Table } from '@salutejs/sdds-finai';
import { AlertCircle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Button, IconButton, Input, Select, Toggle } from '../ui';
import { createErpTableAdapter, type ErpTableHandle } from '../runtime/erp-table';
import { buildErpDemoModel, projectErpColumns, type DemoErpCell } from './erp-table-model';
import type { IAddInfo, IRowData } from './erp-table-types';
import { useErpTablePreview } from './useErpTablePreview';
import { erpDemoRequestUrls } from './erp-table-client';
import './erp-table-demo.css';

interface ErpTableDemoProps {
  tableUrl: string;
  enableColumns?: boolean;
  defaultRowSize?: 'small' | 'medium' | 'big';
  defaultQueryFiltres?: unknown;
  initialFilters?: unknown;
  techFilters?: unknown;
  customParams?: unknown;
  onFetchData?: (data: IRowData) => void;
  onChangeNoteInfo?: (data: IAddInfo[]) => void;
}

/** Local preview only. The production runtime injects the private ErpTableWidget instead. */
export const ErpTableDemo = forwardRef<ErpTableHandle, ErpTableDemoProps>(function ErpTableDemo(
  {
    tableUrl,
    enableColumns = true,
    defaultRowSize = 'small',
    onFetchData,
    onChangeNoteInfo,
    defaultQueryFiltres,
    initialFilters,
    techFilters,
    customParams,
  },
  ref,
) {
  const preview = useErpTablePreview(
    tableUrl,
    { onFetchData, onChangeNoteInfo },
    { defaultQueryFiltres, initialFilters, techFilters, customParams },
  );
  const {
    mockMeta,
    mockData,
    query,
    setQuery,
    pageIndex,
    setPageIndex,
    pageSize,
    setPageSize,
    sortField,
    setSortField,
    descending,
    setDescending,
  } = preview;
  const [includeDefaultHidden, setIncludeDefaultHidden] = useState(false);
  useImperativeHandle(ref, () => ({ refetch: preview.refetch }), [preview.refetch]);

  const metadata = mockMeta?.data;
  // The server has already filtered, sorted and paginated the raw rows.
  const model =
    mockMeta && mockData
      ? buildErpDemoModel(mockMeta, mockData, {
          paginate: false,
          includeDefaultHidden: enableColumns && includeDefaultHidden,
        })
      : undefined;
  const tableData =
    model?.rows.map((row) => ({
      id: row.key,
      ...Object.fromEntries(
        Object.entries(row.cells).map(([fieldName, cell]) => [`cell_${fieldName}`, cell]),
      ),
    })) ?? [];
  const pagination = mockData?.data.page;
  const sortingColumns = mockMeta
    ? projectErpColumns(mockMeta, true).filter((column) => column.metadata.isFilterSort === true)
    : [];
  const pageCount = Math.max(1, Math.ceil((pagination?.totalElements ?? 0) / pageSize));
  let endpoints: ReturnType<typeof erpDemoRequestUrls> | undefined;
  try {
    endpoints = erpDemoRequestUrls(preview.requestUrl);
  } catch {
    /* The loader displays the URL error. */
  }
  return (
    <section className={`erp-demo erp-demo-${defaultRowSize}`} aria-label="Мок ERP-таблицы">
      <div className="erp-demo-notice">
        <strong>Мок ERP-таблицы</strong>
        <span>
          Метаданные и строки загружаются с демосервера. Данные вымышлены, приватный ErpTableWidget не
          подключён.
        </span>
        <Select
          label="Сценарий демо API"
          value={preview.scenario}
          options={[
            { value: '', label: 'Из адреса таблицы' },
            { value: 'normal', label: 'Данные' },
            { value: 'empty', label: 'Пустой ответ' },
            { value: 'error', label: 'Ошибка сервера (503)' },
          ]}
          onChange={(event) => preview.setScenario(event.target.value)}
        />
      </div>
      <div className="erp-demo-toolbar">
        {metadata?.isGlobalSearchEnabled !== false && (
          <Input
            aria-label="Поиск в моке ERP-таблицы"
            placeholder="Поиск по записям"
            maxLength={200}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPageIndex(0);
            }}
          />
        )}
        <IconButton label="Обновить мок ERP-таблицы" onClick={preview.refetch}>
          <RefreshCw size={16} />
        </IconButton>
      </div>
      {metadata?.isGlobalSortingEnabled !== false && (
        <div className="erp-demo-sorting">
          <Select
            label="Сортировать по"
            value={sortField}
            options={[
              { value: '', label: 'Порядок из данных' },
              ...sortingColumns.map((column) => ({ value: column.fieldName, label: column.title })),
            ]}
            onChange={(event) => setSortField(event.target.value)}
          />
          <Button
            size="sm"
            disabled={!sortField}
            aria-label={descending ? 'Сортировка по убыванию' : 'Сортировка по возрастанию'}
            onClick={() => setDescending(!descending)}
          >
            {descending ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
            {descending ? 'По убыванию' : 'По возрастанию'}
          </Button>
        </div>
      )}
      {enableColumns &&
        (metadata?.metadata ?? []).some((column) => column.isHideByDefault && !column.isHideAlways) && (
          <Toggle
            label="Показать дополнительные колонки"
            checked={includeDefaultHidden}
            onChange={setIncludeDefaultHidden}
          />
        )}
      {preview.error ? (
        <div className="erp-demo-request-error" role="alert">
          <AlertCircle size={18} />
          <p>{preview.error}</p>
          <Button size="sm" onClick={preview.refetch}>
            Повторить загрузку таблицы
          </Button>
        </div>
      ) : preview.loading ? (
        <div className="erp-demo-loading" role="status">
          <Loader2 size={18} className="spin" />
          Загружаем таблицу с сервера…
        </div>
      ) : (
        <>
          <div className="erp-demo-table-scroll" tabIndex={0} role="region" aria-label="Строки ERP-таблицы">
            {tableData.length && model?.columns.length ? (
              <div
                style={{ minWidth: model.columns.reduce((width, column) => width + column.minimumWidth, 0) }}
              >
                <Table
                  size="s"
                  borderVariant="rows"
                  data={tableData}
                  columns={model.columns.map((column) => ({
                    id: `cell_${column.fieldName}`,
                    label: column.title,
                    width: column.minimumWidth,
                    enableEditing: false,
                    renderCell: (value: unknown) => (
                      <DemoCell cell={value as DemoErpCell} wrap={column.wrap} />
                    ),
                  }))}
                />
              </div>
            ) : (
              <div className="runtime-empty">
                {query
                  ? 'По вашему запросу ничего не найдено'
                  : metadata?.emptyTableDescription || 'Нет записей'}
                {query && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setQuery('');
                      setPageIndex(0);
                    }}
                  >
                    Сбросить поиск
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="erp-demo-pagination">
            <span role="status">
              {pagination?.count ? pagination.offset + 1 : 0}–
              {(pagination?.offset ?? 0) + (pagination?.count ?? 0)} из {pagination?.totalElements ?? 0}
            </span>
            {metadata?.isGlobalPaginationEnabled !== false && (
              <div>
                <Select
                  aria-label="Записей на странице ERP-таблицы"
                  value={String(pageSize)}
                  options={[
                    { value: '5', label: 'По 5' },
                    { value: '10', label: 'По 10' },
                  ]}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPageIndex(0);
                  }}
                />
                <IconButton
                  label="Предыдущая страница ERP-таблицы"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex(pageIndex - 1)}
                >
                  <ChevronLeft size={16} />
                </IconButton>
                <span>
                  {pageIndex + 1} / {pageCount}
                </span>
                <IconButton
                  label="Следующая страница ERP-таблицы"
                  disabled={pageIndex + 1 >= pageCount}
                  onClick={() => setPageIndex(pageIndex + 1)}
                >
                  <ChevronRight size={16} />
                </IconButton>
              </div>
            )}
          </div>
        </>
      )}
      <details className="erp-demo-inputs">
        <summary>Запросы и ответы демо API</summary>
        <p>
          tableUrl: <code>{tableUrl}</code>. Метаданные и строки получаем отдельными HTTP-запросами.
        </p>
        {endpoints && (
          <>
            <p>
              GET <code>{endpoints.metadataUrl}</code>
            </p>
            <p>
              POST <code>{endpoints.rowsUrl}</code>
            </p>
            <h4>Запрос строк</h4>
            <pre tabIndex={0} aria-label="JSON запроса строк">
              {JSON.stringify(preview.request, null, 2)}
            </pre>
          </>
        )}
        <h4>Ответ метаданных — IMetaDataResponse</h4>
        <pre tabIndex={0} aria-label="JSON mockMeta">
          {mockMeta ? JSON.stringify(mockMeta, null, 2) : 'Ответ ещё не получен.'}
        </pre>
        <h4>Ответ строк — IRowData</h4>
        <pre tabIndex={0} aria-label="JSON mockData">
          {mockData ? JSON.stringify(mockData, null, 2) : 'Ответ ещё не получен.'}
        </pre>
      </details>
    </section>
  );
});

function DemoCell({ cell, wrap }: { cell: DemoErpCell; wrap: boolean }) {
  if (!cell) return null;
  const view = cell.badge?.view;
  const badgeView = view === 'main' || !view ? 'default' : view;
  return (
    <div className={`erp-demo-cell ${wrap ? 'can-wrap' : ''}`}>
      {cell.badge ? (
        <Badge size="xs" view={badgeView} transparent={cell.badge.isTransparent ?? true} text={cell.text} />
      ) : (
        <span className={cell.empty ? 'empty-value' : undefined}>{cell.text}</span>
      )}
      {cell.subValue && <small>{cell.subValue}</small>}
    </div>
  );
}

export const demoErpTableAdapter = createErpTableAdapter(ErpTableDemo);
