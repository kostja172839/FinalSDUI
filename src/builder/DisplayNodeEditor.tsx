import type {
  AvatarNode,
  BadgeNode,
  CatalogField,
  DividerNode,
  ImageNode,
  ProgressNode,
  ValueSource,
} from '../../shared/model';
import { Input, Select, Toggle } from '../ui';
import { ValueSourceEditor } from './ValueSourceEditor';

export type DisplayEditorNode = BadgeNode | AvatarNode | ImageNode | ProgressNode | DividerNode;
export interface DisplayNodeEditorProps {
  node: DisplayEditorNode;
  fields: CatalogField[];
  onChange: (node: DisplayEditorNode) => void;
}

/** Only semantic, bounded kit options are exposed; values may use any API path or literal. */
export function DisplayNodeEditor({ node, fields, onChange }: DisplayNodeEditorProps) {
  const change = (update: Partial<DisplayEditorNode>) =>
    onChange({ ...node, ...update } as DisplayEditorNode);
  const source = (
    label: string,
    path: string,
    value: ValueSource,
    update: (value: ValueSource) => void,
    hint?: string,
  ) => (
    <ValueSourceEditor
      label={label}
      path={path}
      source={value}
      binding={value.kind === 'binding' ? value.path : ''}
      fields={fields}
      onChange={update}
      hint={hint}
    />
  );
  return (
    <section className="builder-setting-group">
      <h3>
        {
          (
            {
              badge: 'Метка',
              avatar: 'Аватар',
              image: 'Изображение',
              progress: 'Прогресс',
              divider: 'Разделитель',
            } as const
          )[node.type]
        }
      </h3>
      <div className="builder-setting-stack">
        {node.type === 'badge' && (
          <>
            {source('Текст метки', 'value', node.value, (value) => change({ value }))}
            <Select
              label="Вид метки"
              path="tone"
              value={node.tone}
              options={[
                { value: 'neutral', label: 'Нейтральная' },
                { value: 'info', label: 'Информация' },
                { value: 'success', label: 'Успех' },
                { value: 'warning', label: 'Предупреждение' },
                { value: 'error', label: 'Ошибка' },
              ]}
              onChange={(event) => change({ tone: event.target.value as BadgeNode['tone'] })}
            />
          </>
        )}
        {node.type === 'avatar' && (
          <>
            {source('Имя пользователя', 'name', node.name, (name) => change({ name }))}
            <Toggle
              label="Показывать фотографию"
              checked={Boolean(node.src)}
              onChange={(checked) =>
                change({ src: checked ? { kind: 'binding', path: 'entity.avatarUrl' } : undefined })
              }
            />
            {node.src &&
              source(
                'Фото пользователя',
                'src',
                node.src,
                (src) => change({ src }),
                'HTTP/HTTPS ссылка или путь от /. Если фото недоступно, останутся инициалы.',
              )}
            <Select
              label="Размер аватара"
              path="size"
              value={node.size}
              options={[
                { value: 's', label: 'Маленький' },
                { value: 'm', label: 'Средний' },
                { value: 'l', label: 'Большой' },
              ]}
              onChange={(event) => change({ size: event.target.value as AvatarNode['size'] })}
            />
          </>
        )}
        {node.type === 'image' && (
          <>
            {source(
              'Адрес изображения',
              'src',
              node.src,
              (src) => change({ src }),
              'HTTP/HTTPS ссылка или путь от /. Встроенные данные и исполняемые адреса не принимаются.',
            )}
            {source(
              'Описание изображения',
              'alt',
              node.alt,
              (alt) => change({ alt }),
              'Коротко опишите смысл изображения для пользователей экранного диктора.',
            )}
            <Input
              label="Высота изображения, px"
              path="height"
              type="number"
              min={80}
              max={1200}
              value={node.height}
              onChange={(event) => change({ height: Number(event.target.value) })}
            />
            <Select
              label="Размещение изображения"
              path="fit"
              value={node.fit}
              options={[
                { value: 'contain', label: 'Показать целиком' },
                { value: 'cover', label: 'Заполнить область с обрезкой' },
              ]}
              onChange={(event) => change({ fit: event.target.value as ImageNode['fit'] })}
            />
          </>
        )}
        {node.type === 'progress' && (
          <>
            {source(
              'Значение прогресса',
              'value',
              node.value,
              (value) => change({ value }),
              'Число от 0 до максимума. Например, 3 из 10 будет показано как 30%.',
            )}
            <Input
              label="Максимальное значение"
              path="max"
              type="number"
              min={0}
              hint="Любое конечное число больше нуля."
              step="any"
              value={node.max}
              onChange={(event) => change({ max: Number(event.target.value) })}
            />
            <Toggle
              label="Показывать числовое значение"
              checked={node.showValue}
              onChange={(showValue) => change({ showValue })}
            />
          </>
        )}
        {node.type === 'divider' && (
          <Input
            label="Подпись разделителя"
            path="label"
            value={node.label ?? ''}
            maxLength={2000}
            hint="Необязательно. Без подписи будет показана только линия."
            onChange={(event) => change({ label: event.target.value })}
          />
        )}
      </div>
    </section>
  );
}
