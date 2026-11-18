import type { ErpTableNode, ErpTableOptions } from '../../shared/model';

export const ERP_EXPENSES_DEMO_URL = '/api/demo/erp-table/expenses';
export const erpExpensesDemoOptions: ErpTableOptions = {
  defaultQueryFiltres: [
    {
      predicateHighLevel: 'AND',
      fieldName: 'reportId',
      search: ['demo-report-001'],
      predicateLowLevel: 'EQ',
    },
  ],
  customParams: { mode: 'approve', accountingTemplateCode: 'DEMO_TRAVEL' },
};

export function connectExpensesDemo(node: ErpTableNode): ErpTableNode {
  // Remove only conflicting dynamic bindings; this explicit example button is undoable.
  const props = Object.fromEntries(
    Object.entries(node.props ?? {}).filter(
      ([name]) =>
        !['defaultQueryFiltres', 'customParams'].some((root) => name === root || name.startsWith(`${root}.`)),
    ),
  );
  return {
    ...node,
    title: 'Расходы по командировке',
    tableUrl: { kind: 'literal', value: ERP_EXPENSES_DEMO_URL },
    options: { ...node.options, ...structuredClone(erpExpensesDemoOptions) },
    props,
  };
}
