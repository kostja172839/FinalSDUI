import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { fetchErpDemoMetadata, fetchErpDemoRows, type ErpDemoRowsRequest } from './erp-table-client';
import type { IAddInfo, IMetaDataResponse, IRowData } from './erp-table-types';
import { erpPreviewFilters, erpPreviewSearch, erpPreviewUrl } from './erp-table-request';

interface Result<T> {
  key: string;
  value?: T;
  error?: string;
}

export function useErpTablePreview(
  tableUrl: string,
  callbacks: { onFetchData?: (data: IRowData) => void; onChangeNoteInfo?: (data: IAddInfo[]) => void },
  options: {
    defaultQueryFiltres?: unknown;
    initialFilters?: unknown;
    techFilters?: unknown;
    customParams?: unknown;
  },
) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [sortField, setSortField] = useState('');
  const [descending, setDescending] = useState(false);
  const [scenario, setScenario] = useState('');
  const [epoch, setEpoch] = useState(0);
  const [metaResult, setMetaResult] = useState<Result<IMetaDataResponse>>();
  const [rowsResult, setRowsResult] = useState<Result<IRowData>>();
  const latestCallbacks = useRef(callbacks);
  latestCallbacks.current = callbacks;
  const urlResult = (() => {
    try {
      return { url: erpPreviewUrl(tableUrl, options.customParams, scenario), error: '' };
    } catch (cause) {
      return { url: tableUrl, error: cause instanceof Error ? cause.message : 'Проверьте адрес таблицы.' };
    }
  })();
  const requestUrl = urlResult.url;
  const metaKey = JSON.stringify([requestUrl, epoch]);
  const currentMetadata = metaResult?.key === metaKey ? metaResult.value : undefined;
  let requestError = '';
  let requestText = 'null';
  try {
    const input: ErpDemoRowsRequest = {
      sorts: sortField ? [{ sortParam: sortField, sortType: descending ? 'DESC' : 'ASC' }] : [],
      filters: erpPreviewFilters(
        options.defaultQueryFiltres,
        options.techFilters,
        options.initialFilters,
        erpPreviewSearch(deferredQuery, currentMetadata),
      ),
      pageable: { offset: pageIndex * pageSize, limit: pageSize },
    };
    requestText = JSON.stringify(input);
  } catch (cause) {
    requestError = cause instanceof Error ? cause.message : 'Проверьте фильтры таблицы.';
  }
  const request = useMemo<ErpDemoRowsRequest | undefined>(
    () => JSON.parse(requestText) ?? undefined,
    [requestText],
  );
  const canLoadRows = Boolean(request && !urlResult.error && (!deferredQuery.trim() || currentMetadata));
  const rowsKey = JSON.stringify([metaKey, requestText]);
  const currentKeys = useRef({ metaKey, rowsKey });
  currentKeys.current = { metaKey, rowsKey };

  useEffect(() => {
    if (urlResult.error) return;
    const abort = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 10_000);
    fetchErpDemoMetadata(requestUrl, abort.signal)
      .then((value) => {
        if (active && currentKeys.current.metaKey === metaKey) setMetaResult({ key: metaKey, value });
      })
      .catch((cause: unknown) => {
        if (active && currentKeys.current.metaKey === metaKey)
          setMetaResult({
            key: metaKey,
            error: timedOut
              ? 'Сервер не ответил за 10 секунд. Повторите загрузку.'
              : cause instanceof Error
                ? cause.message
                : 'Не удалось загрузить метаданные.',
          });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      abort.abort();
    };
  }, [requestUrl, metaKey, urlResult.error]);

  useEffect(() => {
    if (!canLoadRows || !request) return;
    const abort = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 10_000);
    fetchErpDemoRows(requestUrl, request, abort.signal)
      .then((value) => {
        if (!active || currentKeys.current.rowsKey !== rowsKey) return;
        setRowsResult({ key: rowsKey, value });
        latestCallbacks.current.onFetchData?.(value);
        latestCallbacks.current.onChangeNoteInfo?.(value.data.additionalInfo ?? []);
      })
      .catch((cause: unknown) => {
        if (active && currentKeys.current.rowsKey === rowsKey)
          setRowsResult({
            key: rowsKey,
            error: timedOut
              ? 'Сервер не ответил за 10 секунд. Повторите загрузку.'
              : cause instanceof Error
                ? cause.message
                : 'Не удалось загрузить строки.',
          });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      abort.abort();
    };
  }, [requestUrl, request, rowsKey, canLoadRows]);

  const meta = metaResult?.key === metaKey ? metaResult : undefined;
  const rows = rowsResult?.key === rowsKey ? rowsResult : undefined;
  const refetch = useCallback(() => {
    setPageIndex(0);
    setEpoch((value) => value + 1);
  }, []);
  return {
    mockMeta: meta?.value,
    mockData: rows?.value,
    error: urlResult.error || requestError || meta?.error || rows?.error,
    loading: !meta || !rows || deferredQuery !== query,
    requestUrl,
    request,
    refetch,
    query,
    pageIndex,
    pageSize,
    sortField,
    descending,
    setSortField: (value: string) => {
      setSortField(value);
      setPageIndex(0);
    },
    setDescending: (value: boolean) => {
      setDescending(value);
      setPageIndex(0);
    },
    scenario,
    setQuery: (value: string) => {
      setQuery(value);
      setPageIndex(0);
    },
    setPageIndex,
    setPageSize: (value: number) => {
      setPageSize(value);
      setPageIndex(0);
    },
    setScenario: (value: string) => {
      setScenario(value);
      setPageIndex(0);
    },
  };
}
