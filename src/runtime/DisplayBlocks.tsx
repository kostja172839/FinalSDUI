import { useState, type CSSProperties, type ReactNode } from 'react';
import { Avatar, Badge, Divider, Image, Progress } from '@salutejs/sdds-finai';
import { AlertCircle, ImageOff } from 'lucide-react';
import type { AvatarNode, BadgeNode, DividerNode, ImageNode, ProgressNode } from '../../shared/model';
import { resolveValue } from '../../shared/values';
import { displayText, safeHref } from './bindings';
import { Button } from '../ui';
import './DisplayBlocks.css';

export type DisplayContentNode = BadgeNode | AvatarNode | ImageNode | ProgressNode | DividerNode;
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
  const rawName = resolveValue(data, node.name);
  const name = labelOf(rawName);
  const rawSrc = node.src ? resolveValue(data, node.src) : undefined;
  const src = safeHref(rawSrc);
  const [failedSrc, setFailedSrc] = useState<string>();
  return (
    <>
      <h3 className="block-heading">{node.title}</h3>
      <div className="display-avatar-row">
        <div onErrorCapture={() => setFailedSrc(src)} aria-hidden="true">
          <Avatar
            name={name ?? ''}
            customText={name ? undefined : '—'}
            url={src !== failedSrc ? src : undefined}
            size={node.size}
            view="default"
            focused={false}
          />
        </div>
        <span className={name ? '' : 'empty-value'}>{name ?? 'Не указано'}</span>
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
  const rawSrc = resolveValue(data, node.src);
  const src = safeHref(rawSrc);
  const altValue = resolveValue(data, node.alt);
  const alt = typeof altValue === 'string' ? altValue : node.title;
  const [failedSrc, setFailedSrc] = useState<string>();
  const height = Number.isFinite(node.height) ? Math.min(1200, Math.max(80, node.height)) : 240;
  return (
    <>
      <h3 className="block-heading">{node.title}</h3>
      {empty(rawSrc) ? (
        <MissingValue>Изображение не указано</MissingValue>
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
          height={`${height}px`}
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
  return (
    <>
      <h3 className="block-heading">{node.title}</h3>
      {problem ? (
        <ValueError>{problem}</ValueError>
      ) : empty(raw) ? (
        <MissingValue>Значение прогресса не указано</MissingValue>
      ) : (
        <Progress
          value={percentage}
          hasValue={node.showValue}
          view="accent"
          size="s"
          role="progressbar"
          aria-label={node.title}
          aria-valuemin={0}
          aria-valuemax={node.max}
          aria-valuenow={current}
          aria-valuetext={`${number.format(current)} из ${number.format(node.max)} (${number.format(percentage)}%)`}
          caption={
            node.showValue && node.max !== 100
              ? `${number.format(current)} из ${number.format(node.max)}`
              : undefined
          }
        />
      )}
    </>
  );
}

/** Read-only SDUI adapters use the installed FinAI primitives and semantic source values. */
export function DisplayBlock({ node, data }: DisplayBlockProps) {
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
          <h3 className="block-heading">{node.title}</h3>
          {empty(raw) ? (
            <MissingValue>Значение метки не указано</MissingValue>
          ) : value === undefined ? (
            <ValueError>Метка должна содержать текст, число или объект с name / label.</ValueError>
          ) : (
            <Badge size="s" view={view} text={value} transparent maxWidth="100%" title={displayText(raw)} />
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
          role="separator"
          aria-orientation="horizontal"
          aria-label={node.label || node.title}
        >
          {node.label && <span>{node.label}</span>}
          <Divider orientation="horizontal" view="default" size="m" length="100%" />
        </div>
      );
  }
}
