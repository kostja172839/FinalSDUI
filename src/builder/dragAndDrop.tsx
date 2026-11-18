import {
  createContext,
  useContext,
  useCallback,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
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
import {
  locateNode,
  locateField,
  nodeContainers,
  fieldDropContainers,
  isFieldDropTarget,
  type EditorDropTarget,
  type FieldDropTarget,
  type NodeDropTarget,
} from './operations';

export type EditorDragItem =
  | { kind: 'node'; nodeId: string; label: string }
  | { kind: 'field'; fieldId: string; label: string }
  | { kind: 'palette'; nodeType: ContentNode['type']; label: string };
interface EditorDragState {
  definition: SplitTemplate;
  dragging: boolean;
  active?: EditorDragItem;
  allowed: Set<string>;
}
const EditorDragContext = createContext<EditorDragState | null>(null);
interface KeyboardDropZone {
  id: string;
  target: EditorDropTarget;
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
    source?: EditorDropTarget;
    origin: { x: number; y: number };
  },
): KeyboardDropZone | undefined {
  const key = (target: EditorDropTarget) => `${dropContainerKey(target)}:${target.index}`;
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
        dropContainerKey(zone.target) === dropContainerKey(options.source) &&
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

const dropContainerKey = (target: EditorDropTarget) =>
  isFieldDropTarget(target) ? `field:${target.ownerId}` : `node:${target.containerId}`;
function allowedContainers(definition: SplitTemplate, item?: EditorDragItem): Set<string> {
  return new Set(
    item?.kind === 'field'
      ? fieldDropContainers(definition, item.fieldId).map((owner) => `field:${owner.ownerId}`)
      : nodeContainers(definition, item?.kind === 'node' ? item.nodeId : undefined).map(
          (owner) => `node:${owner.value}`,
        ),
  );
}
function sourceTarget(definition: SplitTemplate, item?: EditorDragItem): EditorDropTarget | undefined {
  if (item?.kind === 'node') {
    const source = locateNode(definition, item.nodeId);
    return source && { containerId: source.containerId, index: source.index };
  }
  if (item?.kind === 'field') {
    const source = locateField(definition, item.fieldId);
    return source && { kind: 'field', ownerId: source.ownerId, index: source.index };
  }
}
/** Capture once from the registered frame, never from the 28px activator or moving drop zones. */
export function dragPreviewSize(
  rect: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  return {
    width: Math.min(Math.max(120, rect.width), Math.max(120, viewport.width - 32)),
    height: Math.min(Math.max(36, rect.height), Math.max(36, viewport.height - 80)),
  };
}
export function measureDragPreview(
  frame: Pick<HTMLElement, 'getBoundingClientRect'> | null | undefined,
  initial: { width: number; height: number } | null | undefined,
  viewport: { width: number; height: number },
) {
  const measured = frame?.getBoundingClientRect();
  const rect = measured && measured.width > 0 && measured.height > 0 ? measured : initial;
  return rect && rect.width > 0 && rect.height > 0 ? dragPreviewSize(rect, viewport) : undefined;
}

export function EditorDragProvider({
  definition,
  onDrop,
  children,
}: {
  definition: SplitTemplate;
  onDrop: (item: EditorDragItem, target: EditorDropTarget) => void;
  children: ReactNode;
}) {
  const [active, setActive] = useState<EditorDragItem>();
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>();
  const allowed = allowedContainers(definition, active);
  const keyboardTarget = useRef<KeyboardDropZone>();
  const [, updateKeyboardTarget] = useState(0);
  const collisions: CollisionDetection = (args) => {
    if (args.pointerCoordinates)
      return pointerWithin(args).sort((first, second) => {
        const a = args.droppableRects.get(first.id),
          b = args.droppableRects.get(second.id);
        return (a ? a.width * a.height : Infinity) - (b ? b.width * b.height : Infinity);
      });
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
    const source = sourceTarget(definition, item);
    const allowed = allowedContainers(definition, item);
    const zones: KeyboardDropZone[] = context.droppableContainers.getEnabled().flatMap((container) => {
      const rect = context.droppableRects.get(container.id);
      const target = container.data.current?.target as EditorDropTarget | undefined;
      if (!rect || !target || !allowed.has(dropContainerKey(target))) return [];
      if (
        source &&
        dropContainerKey(source) === dropContainerKey(target) &&
        ['full', 'inside'].includes(String(container.data.current?.position))
      )
        return [];
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
      source,
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
    <EditorDragContext.Provider value={{ definition, active, allowed, dragging: Boolean(active) }}>
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
          const frame = active.data.current?.frameRef?.current as HTMLElement | null | undefined;
          setPreviewSize(
            measureDragPreview(frame, active.rect.current.initial, {
              width: window.innerWidth,
              height: window.innerHeight,
            }),
          );
          setActive(active.data.current?.item as EditorDragItem);
        }}
        onDragCancel={() => {
          keyboardTarget.current = undefined;
          setActive(undefined);
        }}
        onDragEnd={({ active, over }) => {
          const item = active.data.current?.item as EditorDragItem | undefined;
          const target =
            keyboardTarget.current?.target ?? (over?.data.current?.target as EditorDropTarget | undefined);
          keyboardTarget.current = undefined;
          setActive(undefined);
          if (item && target) onDrop(item, target);
        }}
      >
        {children}
        <DragOverlay dropAnimation={null} adjustScale={false} style={previewSize}>
          {active && previewSize && (
            <div
              className="builder-drag-overlay"
              style={{ width: previewSize.width, height: previewSize.height }}
            >
              <GripVertical size={15} />
              {active.label}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </EditorDragContext.Provider>
  );
}

const DragHandleContext = createContext<{
  item: EditorDragItem;
  registration: ReturnType<typeof useDraggable>;
} | null>(null);
export function NodeDragFrame({
  nodeId,
  label,
  surface = 'tree',
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  nodeId: string;
  label: string;
  surface?: string;
  children: ReactNode;
}) {
  return (
    <DragSourceFrame
      item={{ kind: 'node', nodeId, label }}
      surface={surface}
      className={className}
      {...props}
    >
      {children}
    </DragSourceFrame>
  );
}
function DragSourceFrame({
  item,
  surface,
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  item: EditorDragItem;
  surface: string;
  children: ReactNode;
}) {
  const unique = useId();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const registration = useDraggable({
    id: `${surface}-${item.kind}-${item.kind === 'node' ? item.nodeId : item.kind === 'field' ? item.fieldId : item.nodeType}-${unique}`,
    data: { item, frameRef },
  });
  const setFrame = useCallback(
    (element: HTMLDivElement | null) => {
      frameRef.current = element;
      registration.setNodeRef(element);
    },
    [registration.setNodeRef],
  );
  return (
    <DragHandleContext.Provider value={{ item, registration }}>
      <div
        {...props}
        ref={setFrame}
        className={`${className} ${registration.isDragging ? 'builder-drag-source-active' : ''}`}
      >
        {children}
      </div>
    </DragHandleContext.Provider>
  );
}
function DragHandle({ label, kind }: { label: string; kind: 'node' | 'field' }) {
  const context = useContext(DragHandleContext);
  if (!context) return null;
  const { attributes, listeners, setActivatorNodeRef, isDragging } = context.registration;
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      data-editor-drag-handle="true"
      className={`builder-drag-handle ${isDragging ? 'is-dragging' : ''}`}
      aria-label={`Перетащить ${kind === 'field' ? 'поле' : 'блок'} «${label}»`}
      title="Перетащите за ручку. Клавиатура: пробел, стрелки, пробел; Escape — отмена."
      onClick={(event) => event.stopPropagation()}
    >
      <GripVertical size={15} />
    </button>
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
  const context = useContext(DragHandleContext);
  if (context?.item.kind !== 'node' || context.item.nodeId !== nodeId) return null;
  return <DragHandle label={label} kind="node" />;
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
  const frameRef = useRef<HTMLButtonElement | null>(null);
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `palette-${type}`,
    disabled,
    data: { item: { kind: 'palette', nodeType: type, label } satisfies EditorDragItem, frameRef },
  });
  const setFrame = useCallback(
    (element: HTMLButtonElement | null) => {
      frameRef.current = element;
      setNodeRef(element);
    },
    [setNodeRef],
  );
  return (
    <button
      type="button"
      ref={setFrame}
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
  split = false,
  insideTarget,
}: {
  target: NodeDropTarget;
  label: string;
  children?: ReactNode;
  surface?: string;
  split?: boolean;
  insideTarget?: NodeDropTarget;
}) {
  const context = useContext(EditorDragContext);
  if (!context) return <>{children}</>;
  return (
    <div className={children !== undefined ? 'builder-drop-container' : 'builder-drop-zone'}>
      {children}
      {split ? (
        <>
          <DropHitArea
            target={target}
            label={label}
            surface={surface}
            position="before"
            inside={Boolean(insideTarget)}
          />
          {insideTarget && (
            <DropHitArea target={insideTarget} label="Внутрь раздела" surface={surface} position="inside" />
          )}
          <DropHitArea
            target={{ ...target, index: target.index + 1 }}
            label={label.replace('Перед блоком', 'После блока')}
            surface={surface}
            position="after"
            inside={Boolean(insideTarget)}
          />
        </>
      ) : (
        <DropHitArea
          target={target}
          label={label}
          surface={surface}
          position={children !== undefined ? 'full' : 'edge'}
        />
      )}
    </div>
  );
}

function DropHitArea({
  target,
  label,
  surface,
  position,
  axis = 'vertical',
  inside = false,
}: {
  target: EditorDropTarget;
  label: string;
  surface: string;
  position: 'before' | 'after' | 'inside' | 'full' | 'edge';
  axis?: 'vertical' | 'horizontal';
  inside?: boolean;
}) {
  const context = useContext(EditorDragContext);
  const unique = useId();
  const enabled = Boolean(context?.dragging && context.allowed.has(dropContainerKey(target)));
  const { setNodeRef, isOver } = useDroppable({
    id: `${surface}-${dropContainerKey(target)}-${target.index}-${position}-${unique}`,
    disabled: !enabled,
    data: { target, label, surface, position },
  });
  return (
    <div
      ref={setNodeRef}
      data-drop-container={isFieldDropTarget(target) ? target.ownerId : target.containerId}
      data-drop-index={target.index}
      data-drop-kind={isFieldDropTarget(target) ? 'field' : 'node'}
      aria-label={label}
      aria-hidden={!enabled}
      className={`builder-drop-hit builder-drop-hit--${position} builder-drop-hit--${axis} ${inside ? 'has-inside' : ''} ${enabled ? 'is-drag-active' : ''} ${isOver ? 'is-over' : ''}`}
    >
      <span>{label}</span>
    </div>
  );
}

export function FieldDropZone({
  ownerId,
  index,
  label,
  children,
  surface = 'tree',
}: {
  ownerId: string;
  index: number;
  label: string;
  children: ReactNode;
  surface?: string;
}) {
  if (!useContext(EditorDragContext)) return <>{children}</>;
  return (
    <div className="builder-drop-container">
      {children}
      <DropHitArea
        target={{ kind: 'field', ownerId, index }}
        label={label}
        surface={surface}
        position="full"
      />
    </div>
  );
}

/** Replaces the existing field div; no wrapper/grid item is introduced and private table cells are excluded. */
export function EditorFieldFrame({
  fieldId,
  label,
  surface = 'preview',
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  fieldId: string;
  label: string;
  surface?: string;
  children: ReactNode;
}) {
  const editor = useContext(EditorDragContext);
  const field = editor && locateField(editor.definition, fieldId);
  if (!editor || !field || field.collection === 'columns')
    return (
      <div {...props} className={className}>
        {children}
      </div>
    );
  const before: FieldDropTarget = { kind: 'field', ownerId: field.ownerId, index: field.index };
  return (
    <DragSourceFrame
      item={{ kind: 'field', fieldId, label }}
      surface={surface}
      {...props}
      className={`${className} builder-drag-field builder-drag-field--${surface}`}
    >
      <DropHitArea
        target={before}
        label={`Перед полем «${label}»`}
        surface={surface}
        position="before"
        axis={surface === 'tree' ? 'vertical' : 'horizontal'}
      />
      <DropHitArea
        target={{ ...before, index: field.index + 1 }}
        label={`После поля «${label}»`}
        surface={surface}
        position="after"
        axis={surface === 'tree' ? 'vertical' : 'horizontal'}
      />
      <div className="builder-drag-field-tools">
        <DragHandle kind="field" label={label} />
      </div>
      {children}
    </DragSourceFrame>
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
    <NodeDragFrame
      nodeId={nodeId}
      label={label}
      surface="preview"
      className="builder-node-frame"
      data-editor-node={nodeId}
    >
      <DropHitArea
        target={{ containerId: owner, index: location.index }}
        label={`Перед блоком «${label}»`}
        surface="preview"
        position="before"
        inside={location.node.type === 'section'}
      />
      {location.node.type === 'section' && (
        <DropHitArea
          target={{ containerId: nodeId, index: location.node.children.length }}
          label={`В раздел «${label}»`}
          surface="preview"
          position="inside"
        />
      )}
      <DropHitArea
        target={{ containerId: owner, index: location.index + 1 }}
        label={`После блока «${label}»`}
        surface="preview"
        position="after"
        inside={location.node.type === 'section'}
      />
      <div className="builder-node-tools">
        <NodeDragHandle nodeId={nodeId} label={label} surface="preview" />
      </div>
      {children}
    </NodeDragFrame>
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
