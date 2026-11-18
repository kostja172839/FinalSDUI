import type { SectionAppearance, SectionNode } from './model';

export const SECTION_APPEARANCES = ['plain', 'divider', 'outlined'] as const;

export function isSectionAppearance(value: unknown): value is SectionAppearance {
  return typeof value === 'string' && (SECTION_APPEARANCES as readonly string[]).includes(value);
}

/** FinAI has clear/default views; an outlined section is our bounded layout wrapper. */
export function sectionAppearance(node: Pick<SectionNode, 'appearance'>): {
  appearance: SectionAppearance;
  accordionView: 'clear' | 'default';
} {
  const appearance = isSectionAppearance(node.appearance) ? node.appearance : 'divider';
  return { appearance, accordionView: appearance === 'outlined' ? 'default' : 'clear' };
}
