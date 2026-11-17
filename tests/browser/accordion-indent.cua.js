/**
 * Browser regression for the real FinAI hidden-tab layout path.
 * Run with the Codex CUA Tab bound to the running local app:
 *   await assertAccordionIndent(tab)
 * A DOM-less test cannot measure the offsetWidth defect in FinAI.
 */
export async function assertAccordionIndent(tab) {
  await tab.reload();
  await tab.playwright
    .getByRole('tab', { name: 'Основное', exact: true })
    .waitFor({ state: 'visible', timeoutMs: 5000 });
  await tab.playwright.getByRole('button', { name: 'Приложение', exact: true }).last().click();
  await tab.playwright
    .getByRole('tab', { name: 'Стоимость, количество', exact: true })
    .waitFor({ state: 'visible', timeoutMs: 5000 });
  await tab.playwright.getByRole('tab', { name: 'Стоимость, количество', exact: true }).click();
  await tab.getAXState({ emit: false });
  const measure = () =>
    tab.playwright.evaluate(() => {
      const block = document.querySelector('[data-node-id="bookkeeping"]');
      const body = block?.querySelector('[aria-labelledby]');
      const grid = block?.querySelector('.field-grid');
      if (!block || !body || !grid) throw new Error('Accounting accordion is missing');
      return {
        paddingLeft: getComputedStyle(body).paddingLeft,
        contentOffset: grid.getBoundingClientRect().left - block.getBoundingClientRect().left,
      };
    });
  const initial = await measure();
  await tab.playwright.getByRole('tab', { name: 'Бухгалтерский учёт', exact: true }).click();
  await tab.getAXState({ emit: false });
  await tab.playwright.getByRole('tab', { name: 'Бухгалтерский учёт', exact: true }).click();
  await tab.getAXState({ emit: false });
  const reopened = await measure();
  if (initial.paddingLeft !== reopened.paddingLeft || initial.contentOffset !== reopened.contentOffset) {
    throw new Error(`Accordion indentation changed: ${JSON.stringify({ initial, reopened })}`);
  }
  return { initial, reopened };
}
