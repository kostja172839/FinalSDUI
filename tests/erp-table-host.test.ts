import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, createRef, forwardRef, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ErpTableNode, WidgetContext } from '../shared/model';
import { createErpTableAdapter, ErpTableHost, type ErpTableHandle } from '../src/runtime/erp-table';

const node: ErpTableNode = {
  id: 'expense-registry',
  type: 'erpTable',
  title: 'Расходы',
  height: 420,
  tableUrl: { kind: 'literal', value: '/api/demo/erp-table/expenses' },
};
const context: WidgetContext = {
  entityId: 'demo-entity',
  entityType: 'expense',
  instanceId: 'preview',
  locale: 'ru-RU',
};

test('ERP host without a private component shows a connection hint instead of a replacement table', () => {
  const sentinel = 'UNRENDERED_ERP_ROW';
  const markup = renderToStaticMarkup(
    createElement(ErpTableHost, {
      node,
      context,
      data: { collections: { expenses: [{ documentName: sentinel }] } },
    }),
  );
  assert.match(markup, /подключите компонент ErpTableWidget/);
  assert.doesNotMatch(markup, /<table\b|role="(?:table|grid)"/i);
  assert.doesNotMatch(markup, new RegExp(sentinel));
});

test('ERP adapter preserves the host component, native props and ref without rendering its own table', () => {
  interface HostProps {
    tableUrl: string;
    defaultSelectRows: Set<string | number>;
    customParams: { mode: string };
    onSelectChange: (value: unknown) => void;
  }
  let renderedByHost = false;
  const HostStub = forwardRef<ErpTableHandle, HostProps>(function HostStub() {
    renderedByHost = true;
    return null;
  });
  const selected = new Set<string | number>(['expense-1', 0]);
  const customParams = { mode: 'approve' };
  const onSelectChange = () => undefined;
  const props = {
    tableUrl: '/api/demo/erp-table/expenses',
    defaultSelectRows: selected,
    customParams,
    onSelectChange,
  };
  const ref = createRef<ErpTableHandle>();
  const options = { props: { hostOnly: true } };
  const adapter = createErpTableAdapter(HostStub, options);
  const element = adapter.render(props, ref);

  assert.ok(isValidElement<HostProps>(element));
  assert.equal(element.type, HostStub);
  assert.equal(element.props.tableUrl, props.tableUrl);
  assert.equal(element.props.defaultSelectRows, selected);
  assert.equal(element.props.customParams, customParams);
  assert.equal(element.props.onSelectChange, onSelectChange);
  assert.equal(Reflect.get(element, 'ref'), ref);
  assert.equal(adapter.options, options);
  assert.equal(Object.hasOwn(props, 'ref'), false);
  assert.equal(renderedByHost, false);
});
