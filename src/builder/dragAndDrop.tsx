import { createContext, useContext, useId, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  MeasuringStrategy,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { ContentNode, SplitTemplate } from '../../shared/model';
import { locateNode, nodeContainers, type NodeDropTarget } from './operations';

export type EditorDragItem =
  | { kind: 'node'; nodeId: string; label: string }
  | { kind: 'palette'; nodeType: ContentNode['type']; label: string };
interface EditorDragState {
  definition: SplitTemplate;
  dragging: boolean;
  active?: EditorDragItem;
}
const EditorDragContext = createContext<EditorDragState | null>(null);
interface KeyboardDropZone {
  id: string;
  target: NodeDropTarget;
  surface: string;
  rect: { left: number; top: number; width: number; height: number };
}
/** Keyboard navigation follows logical insertion places, independent of the overlay's changing size. */
export function nextKeyboardDropZone(
  zones: KeyboardDropZone[],
  options: {
    code: string;
    surface: string;
    currentId?: string;
    source?: NodeDropTarget;
    origin: { x: number; y: number };
  },
): KeyboardDropZone | undefined {
  const key = (target: NodeDropTarget) => `${target.containerId}:${target.index}`;
  const sorted = zones
    .filter((zone) => zone.surface === options.surface && zone.rect.width > 0 && zone.rect.height > 0)
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const unique = sorted.filter(
    (zone, index) => sorted.findIndex((other) => key(other.target) === key(zone.target)) === index,
  );
  const current =
    unique.find((zone) => zone.id === options.currentId) ??
    (options.source && unique.find((zone) => key(zone.target) === key(options.source!)));
  const origin = current
    ? { x: current.rect.left + current.rect.width / 2, y: current.rect.top + current.rect.height / 2 }
    : options.origin;
  const vertical = options.code === 'ArrowUp' || options.code === 'ArrowDown';
  const forward = options.code === 'ArrowDown' || options.code === 'ArrowRight';
  return unique
    .flatMap((zone) => {
      if (zone.id === current?.id) return [];
      // Before the original node and immediately after it both mean no movement.
      if (
        options.source &&
        zone.target.containerId === options.source.containerId &&
        (zone.target.index === options.source.index + 1 ||
          (!options.currentId && zone.target.index === options.source.index))
      )
        return [];
      const x = zone.rect.left + zone.rect.width / 2;
      const y = zone.rect.top + zone.rect.height / 2;
      const primary = vertical ? y - origin.y : x - origin.x;
      if ((forward ? primary : -primary) < 5) return [];
      return [{ zone, score: Math.abs(primary) + Math.abs(vertical ? x - origin.x : y - origin.y) * 3 }];
    })
    .sort((a, b) => a.score - b.score)[0]?.zone;
}

export function EditorDragProvider({
  definition,
  onDrop,
  children,
}: {
  definition: SplitTemplate;
  onDrop: (item: EditorDragItem, target: NodeDropTarget) => void;
  children: ReactNode;
}) {
  const [active, setActive] = useState<EditorDragItem>();
  const keyboardTarget = useRef<KeyboardDropZone>();
  const [, updateKeyboardTarget] = useState(0);
  const collisions: CollisionDetection = (args) => {
    if (args.pointerCoordinates) return pointerWithin(args);
    const selected = keyboardTarget.current;
    if (selected && args.droppableContainers.some((container) => String(container.id) === selected.id))
      return [{ id: selected.id, data: { value: 0 } }];
    return closestCenter(args);
  };
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { active, currentCoordinates, context }) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return;
    const activeRect = context.collisionRect;
    if (!activeRect) return;
    event.preventDefault();
    const item = context.active?.data.current?.item as EditorDragItem | undefined;
    const source = item?.kind === 'node' ? locateNode(definition, item.nodeId) : undefined;
    const allowed = new Set(
      nodeContainers(definition, item?.kind === 'node' ? item.nodeId : undefined).map(
        (container) => container.value,
      ),
    );
    const zones: KeyboardDropZone[] = context.droppableContainers.getEnabled().flatMap((container) => {
      const rect = context.droppableRects.get(container.id);
      const target = container.data.current?.target as NodeDropTarget | undefined;
      if (!rect || !target || !allowed.has(target.containerId)) return [];
      return [
        {
          id: String(container.id),
          target,
          rect,
          surface: String(container.data.current?.surface ?? 'tree'),
        },
      ];
    });
    const surface = String(active).startsWith('preview-') ? 'preview' : 'tree';
    const next = nextKeyboardDropZone(zones, {
      code: event.code,
      surface,
      currentId: keyboardTarget.current?.id,
      source: source && { containerId: source.containerId, index: source.index },
      origin: { x: activeRect.left + activeRect.width / 2, y: activeRect.top + activeRect.height / 2 },
    });
    if (!next) return currentCoordinates;
    keyboardTarget.current = next;
    updateKeyboardTarget((version) => version + 1);
    return {
      x: next.rect.left + (next.rect.width - activeRect.width) / 2,
      y: next.rect.top + (next.rect.height - activeRect.height) / 2,
    };
  };
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 230, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates, scrollBehavior: 'auto' }),
  );
  return (
    <EditorDragContext.Provider value={{ definition, active, dragging: Boolean(active) }}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisions}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Нажмите пробел, чтобы начать перенос. Стрелки перемещают блок, пробел завершает, Escape отменяет. Для точного переноса используйте также кнопки Выше, Ниже и выбор контейнера в свойствах.',
          },
          announcements: {
            onDragStart: ({ active }) =>
              `Начат перенос: ${(active.data.current?.item as EditorDragItem)?.label ?? 'блок'}.`,
            onDragOver: ({ over }) =>
              over
                ? `Место вставки: ${String(over.data.current?.label ?? 'контейнер')}.`
                : 'Выберите место вставки.',
            onDragEnd: ({ over }) =>
              over ? 'Перенос завершён. Проверьте сообщение конструктора.' : 'Перенос отменён.',
            onDragCancel: () => 'Перенос отменён.',
          },
        }}
        onDragStart={({ active }) => {
          keyboardTarget.current = undefined;
          setActive(active.data.current?.item as EditorDragItem);
        }}
        onDragCancel={() => {
          keyboardTarget.current = undefined;
          setActive(undefined);
        }}
        onDragEnd={({ active, over }) => {
          const item = active.data.current?.item as EditorDragItem | undefined;
          const target =
            keyboardTarget.current?.target ?? (over?.data.current?.target as NodeDropTarget | undefined);
          keyboardTarget.current = undefined;
          setActive(undefined);
          if (item && target) onDrop(item, target);
        }}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {active && (
            <div className="builder-drag-overlay">
              <GripVertical size={15} />
              {active.label}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </EditorDragContext.Provider>
  );
}

export function NodeDragHandle({
  nodeId,
  label,
  surface = 'tree',
}: {
  nodeId: string;
  label: string;
  surface?: string;
}) {
  const context = useContext(EditorDragContext);
  const unique = useId();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${surface}-${nodeId}-${unique}`,
    disabled: !context,
    data: { item: { kind: 'node', nodeId, label } satisfies EditorDragItem },
  });
  if (!context) return null;
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`builder-drag-handle ${isDragging ? 'is-dragging' : ''}`}
      aria-label={`Перетащить блок «${label}»`}
      title="Перетащите мышью или удерживайте на сенсорном экране"
      onClick={(event) => event.stopPropagation()}
    >
      <GripVertical size={14} />
    </button>
  );
}

export function PaletteDragItem({
  type,
  label,
  disabled,
  onClick,
  children,
}: {
  type: ContentNode['type'];
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `palette-${type}`,
    disabled,
    data: { item: { kind: 'palette', nodeType: type, label } satisfies EditorDragItem },
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      disabled={disabled}
      onClick={onClick}
      className="builder-palette-item"
      title="Нажмите для добавления или перетащите в карточку"
    >
      {children}
    </button>
  );
}

export function NodeDropZone({
  target,
  label,
  children,
  surface = 'tree',
}: {
  target: NodeDropTarget;
  label: string;
  children?: ReactNode;
  surface?: string;
}) {
  const context = useContext(EditorDragContext);
  const unique = useId();
  const { setNodeRef, isOver } = useDroppable({
    id: `${surface}-drop-${target.containerId}-${target.index}-${unique}`,
    disabled: !context?.dragging,
    data: { target, label, surface },
  });
  if (!context) return <>{children}</>;
  return (
    <div
      ref={setNodeRef}
      data-drop-container={target.containerId}
      data-drop-index={target.index}
      className={`${children ? 'builder-drop-container' : 'builder-drop-zone'} ${context.dragging ? 'is-drag-active' : ''} ${isOver ? 'is-over' : ''}`}
      aria-label={label}
    >
      {children ?? <span>{label}</span>}
    </div>
  );
}

export function EditorNodeFrame({
  nodeId,
  label,
  children,
}: {
  nodeId: string;
  label: string;
  children: ReactNode;
}) {
  const context = useContext(EditorDragContext);
  if (!context) return <>{children}</>;
  const location = locateNode(context.definition, nodeId);
  if (!location) return <>{children}</>;
  const owner = location.containerId;
  return (
    <div className="builder-preview-node" data-editor-node={nodeId}>
      <NodeDropZone
        target={{ containerId: owner, index: location.index }}
        label={`Перед блоком «${label}»`}
        surface="preview"
      />
      <div className="builder-preview-node-tools">
        <NodeDragHandle nodeId={nodeId} label={label} surface="preview" />
      </div>
      {children}
      {location.node.type === 'section' && (
        <EditorContainerDrop containerId={nodeId} label={`В раздел «${label}»`} />
      )}
    </div>
  );
}
export function EditorContainerDrop({ containerId, label }: { containerId: string; label: string }) {
  const context = useContext(EditorDragContext);
  if (!context) return null;
  const tab = context.definition.tabs.find((tab) => tab.id === containerId);
  const node = locateNode(context.definition, containerId)?.node;
  const nodes = tab?.nodes ?? (node?.type === 'section' ? node.children : undefined);
  return nodes ? (
    <NodeDropZone target={{ containerId, index: nodes.length }} label={label} surface="preview" />
  ) : null;
}
