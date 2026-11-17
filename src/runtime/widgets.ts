import type { WidgetAdapter } from '../../shared/model';
import { demoConnectorRegistry } from '../widgets/demo-connector';

/** Host-owned registry. Server definitions contain IDs only, never remote module URLs. */
export type WidgetRegistry = Readonly<Record<string, WidgetAdapter>>;
export const demoWidgetRegistry: WidgetRegistry = {
  ...demoConnectorRegistry,
  'asset-history': {
    async mount(container, context) {
      const { mountHistory } = await import('../widgets/history-widget');
      return mountHistory(container, context);
    },
  },
};
