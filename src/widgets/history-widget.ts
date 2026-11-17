import type { WidgetContext, WidgetMount } from '../../shared/model';

/** Demonstration of an independently mounted read-only widget, not a deployed microfrontend. */
export function mountHistory(container: HTMLElement, context: WidgetContext): WidgetMount {
  const root = document.createElement('div');
  root.className = 'history-widget';
  const render = (next: WidgetContext) => {
    root.replaceChildren();
    const caption = document.createElement('p');
    caption.className = 'widget-caption';
    caption.textContent = `История объекта ${next.entityId} · демонстрационный виджет`;
    root.append(caption);
    for (const [date, title, description] of [
      ['16 ноября', 'Карточка актуализирована', 'Сведения получены из системы учёта'],
      ['12 ноября', 'Проверены реквизиты', 'Договор и идентификаторы подтверждены'],
      ['1 ноября', 'Объект принят к учёту', 'Создана запись об активе'],
    ]) {
      const item = document.createElement('div');
      item.className = 'history-event';
      const dateElement = document.createElement('time');
      dateElement.textContent = date;
      const content = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = title;
      const text = document.createElement('p');
      text.textContent = description;
      content.append(strong, text);
      item.append(dateElement, content);
      root.append(item);
    }
  };
  render(context);
  container.append(root);
  return { update: render, unmount: () => root.remove() };
}
