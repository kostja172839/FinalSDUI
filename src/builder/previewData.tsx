import { createContext, useContext, type ReactNode } from 'react';
import type { ValueSource } from '../../shared/model';
import { readPath, resolveBindingPath } from '../../shared/values';

interface PreviewScope {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
  prefix?: string;
  scopeData?: unknown;
  disabledReason?: string;
}
const PreviewContext = createContext<PreviewScope>({});
export function PreviewDataProvider({
  data,
  onDataChange,
  children,
}: {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
  children: ReactNode;
}) {
  return (
    <PreviewContext.Provider value={{ data, onDataChange, scopeData: data }}>
      {children}
    </PreviewContext.Provider>
  );
}
export function PreviewRowScope({
  source,
  binding,
  children,
}: {
  source?: ValueSource;
  binding: string;
  children: ReactNode;
}) {
  const parent = useContext(PreviewContext);
  const path = source?.kind === 'binding' ? source.path : source?.kind === 'literal' ? undefined : binding;
  const rows = path && parent.data ? readPath(parent.data, path) : undefined;
  const index = Array.isArray(rows)
    ? rows.findIndex((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
    : -1;
  const prefix =
    path && parent.data && index >= 0 ? `${resolveBindingPath(parent.data, path)}.${index}` : undefined;
  return (
    <PreviewContext.Provider
      value={{
        ...parent,
        prefix,
        scopeData: index >= 0 ? (rows as unknown[])[index] : undefined,
        disabledReason: prefix
          ? undefined
          : 'Сначала добавьте список с хотя бы одной строкой в его источнике. Поля записи редактируют первую строку списка.',
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
}
export const usePreviewData = () => useContext(PreviewContext);
