import { findNodeAtLocation, parseTree, printParseErrorCode, type Node, type ParseError } from 'jsonc-parser';
import { isJsonValue } from './values';

export interface JsonProblem {
  message: string;
  path: string;
  offset: number;
  length: number;
  severity: 'error' | 'warning';
}
export interface JsonDocument {
  value?: Record<string, unknown>;
  tree?: Node;
  problems: JsonProblem[];
}
const messages: Record<string, string> = {
  InvalidSymbol: 'Недопустимый символ.',
  InvalidNumberFormat: 'Некорректное число.',
  PropertyNameExpected: 'Нужно имя поля в двойных кавычках.',
  ValueExpected: 'Нужно значение поля.',
  ColonExpected: 'После имени поля нужно двоеточие.',
  CommaExpected: 'Между значениями нужна запятая.',
  CloseBraceExpected: 'Не хватает закрывающей фигурной скобки.',
  CloseBracketExpected: 'Не хватает закрывающей квадратной скобки.',
  EndOfFileExpected: 'После JSON-объекта есть лишние символы.',
  InvalidCommentToken: 'Комментарии в JSON не поддерживаются.',
  UnexpectedEndOfString: 'Строка не закрыта двойной кавычкой.',
  UnexpectedEndOfNumber: 'Число не закончено.',
  InvalidEscapeCharacter: 'Некорректная escape-последовательность.',
  InvalidUnicode: 'Некорректный Unicode-символ.',
};
export function parseJsonDocument(text: string): JsonDocument {
  try {
    return parseJsonDocumentInternal(text);
  } catch (cause) {
    return {
      problems: [
        {
          message:
            cause instanceof RangeError
              ? 'JSON слишком глубоко вложен: допустимо до 24 уровней.'
              : 'Не удалось разобрать JSON. Проверьте его структуру.',
          path: '$',
          offset: 0,
          length: 1,
          severity: 'error',
        },
      ],
    };
  }
}
function parseJsonDocumentInternal(text: string): JsonDocument {
  if (new TextEncoder().encode(text).length > 900_000)
    return {
      problems: [
        {
          message: 'JSON слишком большой: допустимо до 900 КБ.',
          path: '$',
          offset: 0,
          length: 1,
          severity: 'error',
        },
      ],
    };
  const syntax: ParseError[] = [];
  const tree = parseTree(text, syntax, { allowTrailingComma: false, disallowComments: true });
  const problems: JsonProblem[] = syntax.map((error) => ({
    message: messages[printParseErrorCode(error.error)] ?? 'Проверьте синтаксис JSON.',
    path: '$',
    offset: error.offset,
    length: Math.max(1, error.length),
    severity: 'error',
  }));
  if (problems.length || !tree)
    return {
      tree,
      problems: problems.length
        ? problems
        : [{ message: 'Введите JSON-объект.', path: '$', offset: 0, length: 1, severity: 'error' }],
    };
  const visit = (node: Node, path: string, depth = 0) => {
    if (depth > 24) {
      if (!problems.some((problem) => problem.message.includes('24 уровня')))
        problems.push({
          message: 'Допустимо до 24 уровней вложенности.',
          path,
          offset: node.offset,
          length: 1,
          severity: 'error',
        });
      return;
    }
    if (node.type === 'object') {
      const names = new Set<string>();
      for (const property of node.children ?? []) {
        const key = property.children?.[0];
        const value = property.children?.[1];
        if (!key || !value) continue;
        if (names.has(key.value))
          problems.push({
            message: `Поле «${key.value}» повторяется. Оставьте одно значение.`,
            path: `${path}.${key.value}`,
            offset: key.offset,
            length: key.length,
            severity: 'error',
          });
        names.add(key.value);
        visit(value, `${path}.${key.value}`, depth + 1);
      }
    } else if (node.type === 'array')
      (node.children ?? []).forEach((child, index) => visit(child, `${path}[${index}]`, depth + 1));
  };
  visit(tree, '$');
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    problems.push({
      message: 'В корне нужен объект, например {"entity": {"title": "Название"}}.',
      path: '$',
      offset: tree.offset,
      length: 1,
      severity: 'error',
    });
  else if (!isJsonValue(value))
    problems.push({
      message: 'Допустим JSON без служебных ключей, до 24 уровней вложенности и 20 000 значений.',
      path: '$',
      offset: 0,
      length: 1,
      severity: 'error',
    });
  return { tree, ...(problems.length ? {} : { value: value as Record<string, unknown> }), problems };
}
/** Locate schema paths and data paths; fall back to the nearest parent for missing properties. */
export function jsonPathRange(tree: Node | undefined, path: string) {
  const parts = path
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  while (tree && parts.length) {
    const node = findNodeAtLocation(tree, parts);
    if (node) return { offset: node.offset, length: node.length };
    parts.pop();
  }
  return { offset: tree?.offset ?? 0, length: 1 };
}
export function jsonLineColumn(text: string, offset: number) {
  const lines = text.slice(0, Math.max(0, offset)).split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}
