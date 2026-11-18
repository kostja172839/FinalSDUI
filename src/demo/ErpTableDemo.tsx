import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Badge, Table } from '@salutejs/sdds-finai';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button, IconButton, Input, Select, Toggle } from '../ui';
import { createErpTableAdapter, type ErpTableHandle } from '../runtime/erp-table';
import { erpTableMockData, erpTableMockMeta } from './erp-table-fixture';
import { buildErpDemoModel, type DemoErpCell } from './erp-table-model';
import type { IAddInfo, IMetaDataResponse, IRowData } from './erp-table-types';
import './erp-table-demo.css';

interface ErpTableDemoProps {
  tableUrl: string;
  mockMeta?: IMetaDataResponse;
  mockData?: IRowData;
  enableColumns?: boolean;
  defaultRowSize?: 'small' | 'medium' | 'big';
  onFetchData?: (data: IRowData) => void;
  onChangeNoteInfo?: (data: IAddInfo[]) => void;
}

/** Local preview only. The production runtime injects the private ErpTableWidget instead. */
export const ErpTableDemo = forwardRef<ErpTableHandle, ErpTableDemoProps>(function ErpTableDemo(
  {
    tableUrl,
    mockMeta,
    mockData,
    enableColumns = true,
    defaultRowSize = 'small',
    onFetchData,
    onChangeNoteInfo,
  },
  ref,
) {
  const [query, setQuery] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [sortField, setSortField] = useState('');
  const [descending, setDescending] = useState(false);
  const [includeDefaultHidden, setIncludeDefaultHidden] = useState(false);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const callbacks = useRef({ onFetchData, onChangeNoteInfo });
  callbacks.current = { onFetchData, onChangeNoteInfo };
  const refresh = () => {
    setQuery('');
    setPageIndex(0);
    setRefreshEpoch((epoch) => epoch + 1);
  };
  useImperativeHandle(ref, () => ({ refetch: refresh }), []);
  useEffect(() => {
    if (!mockData) return;
    callbacks.current.onFetchData?.(mockData);
    callbacks.current.onChangeNoteInfo?.(mockData.data.additionalInfo ?? []);
  }, [mockData, refreshEpoch]);

  if (!mockMeta || !mockData)
    return <p className="runtime-note">Для демопросмотра передайте mockMeta и mockData в адаптер.</p>;

  const metadata = mockMeta.data;
  const model = buildErpDemoModel(mockMeta, mockData, {
    query: metadata?.isGlobalSearchEnabled === false ? '' : query,
    pageIndex,
    pageSize,
    paginate: metadata?.isGlobalPaginationEnabled !== false,
    sort:
      metadata?.isGlobalSortingEnabled === false || !sortField
        ? undefined
        : { fieldName: sortField, direction: descending ? 'desc' : 'asc' },
    includeDefaultHidden: enableColumns && includeDefaultHidden,
  });
  const sortingColumns = model.columns.filter((column) => column.metadata.isFilterSort !== false);
  const tableData = model.rows.map((row) => ({
    id: row.key,
    ...Object.fromEntries(Object.entries(row.cells).map(([fieldName, cell]) => [`cell_${fieldName}`, cell])),
  }));
  return (
    <section className={`erp-demo erp-demo-${defaultRowSize}`} aria-label="Мок ERP-таблицы">
      <div className="erp-demo-notice">
        <strong>Мок ERP-таблицы</strong>
        <span>Вымышленные данные по вашему контракту. Приватный ErpTableWidget не подключён.</span>
      </div>
      <div className="erp-demo-toolbar">
        {metadata?.isGlobalSearchEnabled !== false && (
          <Input
            aria-label="Поиск в моке ERP-таблицы"
            placeholder="Поиск по событиям"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPageIndex(0);
            }}
          />
        )}
        <IconButton label="Обновить мок ERP-таблицы" onClick={refresh}>
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
            onChange={(event) => {
              setSortField(event.target.value);
              setPageIndex(0);
            }}
          />
          <Button
            size="sm"
            disabled={!sortField}
            aria-label={descending ? 'Сортировка по убыванию' : 'Сортировка по возрастанию'}
            onClick={() => {
              setDescending(!descending);
              setPageIndex(0);
            }}
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
      <div className="erp-demo-table-scroll" tabIndex={0} role="region" aria-label="Строки ERP-таблицы">
        {tableData.length && model.columns.length ? (
          <div style={{ minWidth: model.columns.reduce((width, column) => width + column.minimumWidth, 0) }}>
            <Table
              size="s"
              borderVariant="rows"
              data={tableData}
              columns={model.columns.map((column) => ({
                id: `cell_${column.fieldName}`,
                label: column.title,
                width: column.minimumWidth,
                enableEditing: false,
                renderCell: (value: unknown) => <DemoCell cell={value as DemoErpCell} wrap={column.wrap} />,
              }))}
            />
          </div>
        ) : (
          <div className="runtime-empty">
            {query ? 'По вашему запросу ничего не найдено' : metadata?.emptyTableDescription || 'Нет записей'}
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
          {model.from}–{model.to} из {model.filteredRows}
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
              disabled={model.pageIndex === 0}
              onClick={() => setPageIndex(model.pageIndex - 1)}
            >
              <ChevronLeft size={16} />
            </IconButton>
            <span>
              {model.pageIndex + 1} / {model.pageCount}
            </span>
            <IconButton
              label="Следующая страница ERP-таблицы"
              disabled={model.pageIndex + 1 >= model.pageCount}
              onClick={() => setPageIndex(model.pageIndex + 1)}
            >
              <ChevronRight size={16} />
            </IconButton>
          </div>
        )}
      </div>
      <details className="erp-demo-inputs">
        <summary>Входные данные: mockMeta и mockData</summary>
        <p>
          tableUrl: <code>{tableUrl}</code>. Демо использует локальные пропсы, запросы по этому адресу не
          выполняются.
        </p>
        <h4>mockMeta — настройки и колонки</h4>
        <pre tabIndex={0} aria-label="JSON mockMeta">
          {JSON.stringify(mockMeta, null, 2)}
        </pre>
        <h4>mockData — строки и пагинация</h4>
        <pre tabIndex={0} aria-label="JSON mockData">
          {JSON.stringify(mockData, null, 2)}
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

export const demoErpTableAdapter = createErpTableAdapter(ErpTableDemo, {
  props: { mockMeta: erpTableMockMeta, mockData: erpTableMockData },
});
