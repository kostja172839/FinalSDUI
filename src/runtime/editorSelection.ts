import type { KeyboardEvent, MouseEvent } from 'react';

export function editorSelection(
  id: string,
  label: string,
  selectedId?: string,
  onSelect?: (id: string) => void,
) {
  return {
    'data-field-id': id,
    ...(onSelect
      ? {
          role: 'button' as const,
          tabIndex: 0,
          'aria-label': `Выбрать поле «${label}»`,
          'aria-pressed': selectedId === id,
          onClickCapture: (event: MouseEvent<HTMLElement>) => {
            const target = event.target as HTMLElement;
            if (typeof target.closest === 'function' && target.closest('[data-editor-drag-handle]')) return;
            if (typeof target.closest === 'function' && target.closest('a[href]')) event.preventDefault();
            event.stopPropagation();
            onSelect(id);
          },
          onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              onSelect(id);
            }
          },
        }
      : {}),
  };
}

export function fieldSelectionClass(id: string, selectedId?: string, onSelect?: (id: string) => void) {
  return onSelect ? `runtime-selectable-field ${selectedId === id ? 'is-field-selected' : ''}` : '';
}
