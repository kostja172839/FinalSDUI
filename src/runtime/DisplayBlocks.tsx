import { useState, type CSSProperties, type ReactNode, type ComponentProps, type ComponentType } from 'react';
import { Avatar, Badge, Divider, Image, Progress } from '@salutejs/sdds-finai';
import { AlertCircle, ImageOff } from 'lucide-react';
import type { AvatarNode, BadgeNode, DividerNode, ImageNode, ProgressNode } from '../../shared/model';
import { resolveValue } from '../../shared/values';
import type { ResolvedComponentOptions } from '../../shared/component-props';
import { displayText, safeHref } from './bindings';
import { Button } from '../ui';
import './DisplayBlocks.css';

export type DisplayContentNode = BadgeNode | AvatarNode | ImageNode | ProgressNode | DividerNode;
type KitBadgeView = 'default' | 'accent' | 'positive' | 'warning' | 'negative' | 'dark' | 'light';
// FinAI 0.369 declares numeric variant keys against ProgressProps' string field,
// narrowing progressSize to never. Runtime accepts these four configured keys.
const NativeProgress = Progress as unknown as ComponentType<
  Omit<ComponentProps<typeof Progress>, 'progressSize'> & { progressSize?: '2' | '4' | '6' | '8' }
>;
export interface DisplayBlockProps {
  node: DisplayContentNode;
  data: Record<string, unknown>;
}

const empty = (value: unknown) =>
  value === undefined || value === null || (typeof value === 'string' && !value.trim());
function labelOf(value: unknown): string | undefined {
  if (empty(value)) return undefined;
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof (record.name ?? record.label) === 'string') return String(record.name ?? record.label);
  }
  return undefined;
}
function ValueError({ children }: { children: ReactNode }) {
  return (
    <p className="display-value-error" role="status">
      <AlertCircle size={15} aria-hidden="true" />
      {children}
    </p>
  );
}
function MissingValue({ children }: { children: ReactNode }) {
  return <p className="runtime-note display-empty">{children}</p>;
}
function AvatarDisplay({ node, data }: { node: AvatarNode; data: Record<string, unknown> }) {
  const options: ResolvedComponentOptions = node as AvatarNode & ResolvedComponentOptions;
  const rawName = resolveValue(data, node.name);
  const name = labelOf(rawName);
  const rawSrc = node.src ? resolveValue(data, node.src) : undefined;
  const src = safeHref(rawSrc);
  const [failedSrc, setFailedSrc] = useState<string>();
  return (
    <>
      {options.showTitle !== false && <h3 className="block-heading">{node.title}</h3>}
      <div className="display-avatar-row">
        <div
          onErrorCapture={() => setFailedSrc(src)}
          aria-hidden={(!options.status && !options.hasExtra) || undefined}
          style={
            options.size === 'fit'
              ? { width: options.fitSize ?? 64, height: options.fitSize ?? 64, flexShrink: 0 }
              : undefined
          }
        >
          <Avatar
            name={name ?? ''}
            customText={options.customText ?? (name ? undefined : '—')}
            url={src !== failedSrc ? src : undefined}
            size={options.size as 's' | 'm' | 'l' | 'xxl' | 'fit'}
            view="default"
            focused={options.focused ?? false}
            status={options.status}
            statusLabels={options.statusLabels}
            isScalable={options.isScalable}
            customBorderRadius={options.customBorderRadius}
            hasExtra={options.hasExtra}
            extraPlacement={options.extraPlacement}
            {...(options.extraType === 'counter'
              ? {
                  type: 'counter' as const,
                  counterView: options.counterView as KitBadgeView,
                  count: options.count,
                }
              : {
                  type: 'badge' as const,
                  badgeView: options.badgeView as KitBadgeView,
                  text: options.extraText,
                })}
          />
        </div>
        <span className={name ? '' : 'empty-value'}>{name ?? options.emptyText ?? 'Не указано'}</span>
      </div>
      {!empty(rawName) && !name && (
        <ValueError>Имя должно быть текстом или объектом с name / label.</ValueError>
      )}
      {!empty(rawSrc) && !src && (
        <ValueError>Для фотографии нужна HTTP/HTTPS ссылка или путь от /.</ValueError>
      )}
      {src && src === failedSrc && (
        <>
          <ValueError>Фото недоступно. Показаны инициалы.</ValueError>
          <Button size="sm" variant="ghost" onClick={() => setFailedSrc(undefined)}>
            Повторить загрузку фото
          </Button>
        </>
      )}
    </>
  );
}
function ImageDisplay({ node, data }: { node: ImageNode; data: Record<string, unknown> }) {
  const options = node as ImageNode & ResolvedComponentOptions;
  const rawSrc = resolveValue(data, node.src);
  const src = safeHref(rawSrc);
  const altValue = resolveValue(data, node.alt);
  const alt = typeof altValue === 'string' ? altValue : node.title;
  const [failedSrc, setFailedSrc] = useState<string>();
  const height = Number.isFinite(node.height) ? Math.min(1200, Math.max(80, node.height)) : 240;
  return (
    <>
      {options.showTitle !== false && <h3 className="block-heading">{node.title}</h3>}
      {empty(rawSrc) ? (
        <MissingValue>{options.emptyText ?? 'Изображение не указано'}</MissingValue>
      ) : !src ? (
        <ValueError>
          Для изображения нужна HTTP/HTTPS ссылка или путь от /. Встроенные данные и исполняемые адреса
          запрещены.
        </ValueError>
      ) : failedSrc === src ? (
        <div className="display-image-unavailable" style={{ minHeight: Math.min(height, 180) }}>
          <ImageOff size={24} aria-hidden="true" />
          <p>Изображение недоступно</p>
          {alt && <span>{alt}</span>}
          <Button size="sm" variant="ghost" onClick={() => setFailedSrc(undefined)}>
            Повторить загрузку изображения
          </Button>
        </div>
      ) : (
        <Image
          className="display-kit-image"
          base="img"
          src={src}
          alt={alt}
          width="100%"
          height={options.ratio || options.customRatio ? undefined : `${height}px`}
          ratio={options.ratio as '1/1' | '3/4' | '4/3' | '9/16' | '16/9' | '1/2' | '2/1' | undefined}
          customRatio={options.customRatio === undefined ? undefined : String(options.customRatio)}
          srcSet={options.srcSet}
          sizes={options.sizes}
          style={{ '--display-image-fit': node.fit } as CSSProperties}
          onError={() => setFailedSrc(src)}
        />
      )}
      {!empty(altValue) && typeof altValue !== 'string' && (
        <ValueError>Описание изображения должно быть текстом.</ValueError>
      )}
    </>
  );
}
function ProgressDisplay({ node, data }: { node: ProgressNode; data: Record<string, unknown> }) {
  const options = node as ProgressNode & ResolvedComponentOptions;
  const raw = resolveValue(data, node.value);
  let problem = '';
  const current = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
  if (!Number.isFinite(node.max) || node.max <= 0)
    problem = 'Максимальное значение должно быть конечным числом больше нуля.';
  else if (!empty(raw) && !Number.isFinite(current)) problem = 'Для прогресса нужно конечное число.';
  else if (!empty(raw) && (current < 0 || current > node.max))
    problem = `Значение должно быть от 0 до ${node.max}.`;
  const percentage = problem || empty(raw) ? 0 : Number(((current / node.max) * 100).toFixed(2));
  const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const hasValue = options.hasValue ?? node.showValue;
  return (
    <>
      {options.showTitle !== false && <h3 className="block-heading">{node.title}</h3>}
      {problem ? (
        <ValueError>{problem}</ValueError>
      ) : empty(raw) ? (
        <MissingValue>{options.emptyText ?? 'Значение прогресса не указано'}</MissingValue>
      ) : (
        <NativeProgress
          value={percentage}
          hasValue={hasValue}
          view={
            (options.view ?? 'accent') as
              | 'default'
              | 'secondary'
              | 'primary'
              | 'accent'
              | 'info'
              | 'success'
              | 'positive'
              | 'warning'
              | 'error'
              | 'negative'
          }
          size={(options.size ?? 's') as 's' | 'm' | 'l'}
          progressSize={options.progressSize as '2' | '4' | '6' | '8' | undefined}
          label={options.label}
          labelPlacement={options.labelPlacement}
          labelTextPlacement={options.labelTextPlacement}
          valuePlacement={options.valuePlacement}
          valueAlign={options.valueAlign}
          role="progressbar"
          aria-label={node.title}
          aria-valuemin={0}
          aria-valuemax={node.max}
          aria-valuenow={current}
          aria-valuetext={`${number.format(current)} из ${number.format(node.max)} (${number.format(percentage)}%)`}
          caption={
            options.caption ??
            (hasValue && node.max !== 100
              ? `${number.format(current)} из ${number.format(node.max)}`
              : undefined)
          }
        />
      )}
    </>
  );
}

/** Read-only SDUI adapters use the installed FinAI primitives and semantic source values. */
export function DisplayBlock({ node, data }: DisplayBlockProps) {
  const options = node as DisplayContentNode & ResolvedComponentOptions;
  switch (node.type) {
    case 'badge': {
      const raw = resolveValue(data, node.value);
      const value = labelOf(raw);
      const view = (
        {
          neutral: 'default',
          info: 'accent',
          success: 'positive',
          warning: 'warning',
          error: 'negative',
        } as const
      )[node.tone];
      return (
        <>
          {options.showTitle !== false && <h3 className="block-heading">{node.title}</h3>}
          {empty(raw) ? (
            <MissingValue>{options.emptyText ?? 'Значение метки не указано'}</MissingValue>
          ) : value === undefined ? (
            <ValueError>Метка должна содержать текст, число или объект с name / label.</ValueError>
          ) : (
            <Badge
              size={(options.size ?? 's') as 'xs' | 's' | 'm' | 'l'}
              view={(options.view ?? view) as KitBadgeView}
              text={value}
              transparent={options.transparent ?? true}
              pilled={options.pilled}
              clear={options.clear}
              maxWidth="100%"
              title={displayText(raw)}
            />
          )}
        </>
      );
    }
    case 'avatar':
      return <AvatarDisplay node={node} data={data} />;
    case 'image':
      return <ImageDisplay node={node} data={data} />;
    case 'progress':
      return <ProgressDisplay node={node} data={data} />;
    case 'divider':
      return (
        <div
          className="display-divider"
          style={
            options.orientation === 'vertical'
              ? { height: options.height ?? 120, width: 'auto', flexDirection: 'column' }
              : undefined
          }
          role="separator"
          aria-orientation={options.orientation ?? 'horizontal'}
          aria-label={node.label || node.title}
        >
          {node.label && <span>{node.label}</span>}
          <Divider
            orientation={options.orientation ?? 'horizontal'}
            view={(options.view ?? 'default') as 'default' | 'dark' | 'light' | 'inverse'}
            size="m"
            length={options.length ?? '100%'}
            style={options.orientation === 'vertical' ? { flex: '0 1 auto', minWidth: 0 } : undefined}
          />
        </div>
      );
  }
}
