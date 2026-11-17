import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from 'react';

const EditorValidityContext = createContext<(id: string, invalid: boolean) => void>(() => undefined);
export function EditorValidityProvider({
  children,
  onValidityChange,
}: {
  children: ReactNode;
  onValidityChange?: (invalid: boolean) => void;
}) {
  const [invalidEditors, setInvalidEditors] = useState<Set<string>>(new Set());
  const report = useCallback(
    (id: string, invalid: boolean) =>
      setInvalidEditors((previous) => {
        if (previous.has(id) === invalid) return previous;
        const next = new Set(previous);
        if (invalid) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  useEffect(() => onValidityChange?.(invalidEditors.size > 0), [invalidEditors, onValidityChange]);
  useEffect(() => () => onValidityChange?.(false), [onValidityChange]);
  return <EditorValidityContext.Provider value={report}>{children}</EditorValidityContext.Provider>;
}
export function useEditorValidity(invalid: boolean) {
  const id = useId();
  const report = useContext(EditorValidityContext);
  useEffect(() => {
    report(id, invalid);
    return () => report(id, false);
  }, [id, invalid, report]);
}
