import { randomUUID } from 'node:crypto';
import { seedEntities } from '../shared/seeds';
import { safePath, validateTemplate, type ValidationCapabilities } from '../shared/validation';
import type { BlockError, ContentNode, PreviewScenario, ResolvedSplit, SplitTemplate } from '../shared/model';
import { validateResolvedData } from '../shared/data-validation';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: ReturnType<typeof validateTemplate>,
  ) {
    super(message);
  }
}

export interface EntityData {
  data: Record<string, unknown>;
  version: string;
}

export interface ResolveOptions {
  data: Record<string, unknown>;
  entityVersion?: string;
}

export function resolveSplit(
  definition: SplitTemplate,
  entityId: string,
  revision: number | 'draft',
  scenario: PreviewScenario = 'normal',
  capabilities?: ValidationCapabilities,
  options?: ResolveOptions,
): ResolvedSplit {
  const issues = validateTemplate(definition, capabilities);
  if (issues.some((issue) => issue.severity === 'error'))
    throw new ApiError(422, 'Шаблон содержит ошибки. Исправьте их перед предпросмотром.', issues);
  const entity = seedEntities.find((item) => item.id === entityId);
  if (!entity && !options) throw new ApiError(404, 'Объект не найден.');
  const data = structuredClone(options?.data ?? entity!.data);
  const asset = (data.entity ?? data.asset) as Record<string, unknown>;
  if (scenario === 'long' && asset && typeof asset === 'object' && !Array.isArray(asset)) {
    asset.title = `${String(asset.title)} — объект с длинным названием для проверки переноса текста и изменения ширины панели`;
    asset.description = Array.from(
      { length: 8 },
      () =>
        'Подробное описание объекта: учётные сведения, расположение и история использования. Длинный текст должен переноситься и оставаться доступным при минимальной ширине сплита.',
    ).join('\n\n');
    asset.custodian = 'Александра Константиновна Преображенская-Добровольская';
    asset.address =
      'Российская Федерация, Московская область, городской округ Примерный, административно-деловой комплекс, корпус 12, строение 4, помещение 108';
  } else if (scenario === 'empty' && asset && typeof asset === 'object' && !Array.isArray(asset)) {
    for (const key of Object.keys(asset))
      if (!['title', 'subtitle', 'status'].includes(key)) asset[key] = null;
    if (data.collections && typeof data.collections === 'object' && !Array.isArray(data.collections))
      (data.collections as Record<string, unknown>).events = [];
    else data.events = [];
  }
  const errors: BlockError[] = [];
  const instanceId = randomUUID();
  const dataIssues = validateResolvedData(
    definition,
    data,
    { entityId, entityType: definition.entityType, instanceId, locale: 'ru-RU' },
    capabilities?.catalog,
  );
  const visit = (nodes: ContentNode[]) => {
    for (const node of nodes) {
      if (node.type === 'widget') {
        const messages = dataIssues.filter((issue) => issue.nodeId === node.id).map((issue) => issue.message);
        if (messages.length) errors.push({ nodeId: node.id, message: [...new Set(messages)].join(' ') });
      }
      if (scenario === 'error' && (node.type === 'table' || (errors.length === 0 && node.type === 'fields')))
        errors.push({
          nodeId: node.id,
          message: 'Источник временно недоступен. Остальные разделы карточки продолжают работать.',
        });
      if (node.type === 'section') visit(node.children);
      if (node.visibleWhen) {
        const actual = safePath(data, node.visibleWhen.binding);
        // Visibility stays declarative; the renderer evaluates the same constrained rule.
        if (actual === undefined)
          errors.push({ nodeId: node.id, message: 'Источник условия видимости недоступен.' });
      }
    }
  };
  definition.tabs.forEach((tab) => visit(tab.nodes));
  return {
    schemaVersion: 1,
    instanceId,
    templateId: definition.id,
    templateRevision: revision,
    entityId,
    entityVersion: options?.entityVersion ?? entity?.version ?? 'preview',
    definition: structuredClone(definition),
    data,
    errors,
  };
}
