---
name: Split Studio
description: "Зафиксированная визуальная система конструктора и Split-view на SDDS FinAI."
colors:
  accent: "#216bce"
  accent-soft: "#eaf2fd"
  surface: "var(--surface-solid-card, #fff)"
  surface-soft: "#f4f6f8"
  line: "#e5e9ee"
  text: "var(--text-primary, #20262d)"
  muted: "#687482"
  danger: "#ac3b36"
  danger-soft: "#fff0ee"
  kit-surface-accent: "#199AF0"
  kit-surface-accent-hover: "#36A7F2FF"
  kit-surface-accent-active: "#0F90E6FF"
  kit-text-primary: "#13181BF5"
  kit-text-on-dark: "#F2F5F8F5"
  kit-surface-secondary: "#ADB9C238"
  kit-outline-primary: "#D5DFE6"
  kit-outline-accent: "#0B7ECB"
  kit-positive-text: "#108E26"
  kit-positive-surface: "#1A9E321F"
  tabs-surface: "rgba(213, 223, 230, 0.32)"
typography:
  code:
    fontFamily: "Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.6
  title:
    fontFamily: "'SB Sans Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "'SB Sans Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontSize: "12px"
    lineHeight: 1.4
  panel-title:
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.15px"
  tab:
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "18px"
  hint:
    fontSize: "11px"
    lineHeight: 1.65
  kit-control:
    fontFamily: "'SB Sans Text', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "0.875rem"
    letterSpacing: "-0.02em"
rounded:
  badge: "0.25rem"
  control-xs: "0.5rem"
  control-s: "0.625rem"
  select: "6px"
  tree-row: "6px"
  tab: "6px"
  tablist: "8px"
  split: "12px"
spacing:
  field-gap: "7px"
  settings-gap: "12px"
  preview: "16px"
  preview-mobile: "8px"
  panel-section: "18px"
  split: "24px"
  split-narrow: "20px"
  field-row: "22px"
components:
  button-primary-xs:
    backgroundColor: "{colors.kit-surface-accent}"
    textColor: "{colors.kit-text-on-dark}"
    typography: "{typography.kit-control}"
    rounded: "{rounded.control-xs}"
    padding: "0 0.75rem"
    height: "2rem"
  button-primary-xs-hover:
    backgroundColor: "{colors.kit-surface-accent-hover}"
  button-primary-xs-active:
    backgroundColor: "{colors.kit-surface-accent-active}"
  input-xs:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control-xs}"
    padding: "0.5625rem 0.625rem"
    height: "2rem"
  split:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.split}"
  tab:
    typography: "{typography.tab}"
    rounded: "{rounded.tab}"
    padding: "0 13px"
    height: "32px"
  tablist:
    backgroundColor: "{colors.tabs-surface}"
    rounded: "{rounded.tablist}"
    padding: "3px"
    height: "38px"
  status-positive-xs:
    backgroundColor: "{colors.kit-positive-surface}"
    textColor: "{colors.kit-positive-text}"
    rounded: "{rounded.badge}"
    padding: "0 0.25rem"
    height: "1rem"
---

# Design System: Split Studio

Визуальный конструктор поддерживает прямое создание тестового значения по привязке в свойствах поля. Панель «Данные и шаблон» открывает два редактора возле существующего предпросмотра. В широком режиме сплит сохраняет высоту, на узком экране рабочая область прокручивается вертикально. Подсказки, валидация и конфликты черновиков используют текущую палитру и компоненты FinAI.

Текущее расширение сохраняет FinAI и исходную оболочку: режим JSON доступен в верхней навигации, редактор и действующий сплит занимают рабочую область. На узком экране редактор располагается над предпросмотром; навигация и действия помещаются в две строки. Ошибки настроек показаны возле полей, ошибки данных — возле значений. Сообщения, суммы, карточки записей и документы используют существующие цвета, типографику и отступы.

## Overview

Существующая визуальная опора — **SDDS FinAI** и 17 предоставленных пользователем скриншотов документации и корпоративных Split-view. Новая метафора, фирменный стиль и палитра не выбирались. Документ описывает реализацию, не утверждает попиксельного совпадения со всеми референсами.

Пользователь отдельно исправил слишком маленький холст и вкладки. Итоговая оболочка использует одну верхнюю панель инструментов и центральный предпросмотр на доступную высоту. В конструкторе слева дерево, в центре действующая карточка, справа свойства. Предпросмотр и приложение используют один рендерер.

**Key Characteristics:**

- Компоненты SDDS FinAI и собственная оболочка конструктора.
- Светлые поверхности, разделители, компактные подписи и читаемые значения.
- Заполняющий доступную высоту центр и фиксированные области карточки.

Источники: `src/styles.css`, `src/runtime/runtime.css`, `src/builder/builder.css`, `src/ui.tsx`, `src/runtime/SplitView.tsx`, `src/main.tsx`, установленная светлая тема FinAI; снимки `.impeccable/review/desktop.jpg`, `mobile.jpg`, `user-1280.jpg`. Учитываются последние переопределения CSS. Примеры данных синтетические.

## Colors

### Primary

`accent` / `accent-soft` выделяют собственную навигацию, ссылки и выбранные узлы. `kit-surface-accent` и его состояния задают заливку кнопок FinAI. Эти синие не объединены в исходниках в один токен.

### Neutral

`surface` используется карточкой и панелями; `surface-soft` — рабочей областью и подсказками; `line` — разделителями. `text` ссылается на тему, а `muted` задаёт подписи и служебные иконки. Fallback в `text` не является вычисленным цветом подключённой темы. `kit-surface-secondary` — полупрозрачная вторичная кнопка, `tabs-surface` — контейнер вкладок с белой активной вкладкой.

Статусы используют варианты Badge positive / negative / accent. Собственные `danger` / `danger-soft` используются ошибкой блока и отличаются от negative-варианта kit. Тональные шкалы не синтезированы.

## Typography

Оболочка использует стек SB Sans Text с системными fallback, включая Segoe UI; kit — `'SB Sans Text', sans-serif`. Локальные `@font-face` отсутствуют: наличие SB Sans Text на устройстве не гарантируется.

Заголовок карточки использует `title`; при ширине контейнера до (680px) размер становится (16px), до (420px) — (15px). Заголовок блока — (14px, 600, line-height 1.5). Панели используют `panel-title`, заголовки настроек — (12px, 650). Значения реквизитов используют `body`, подписи — `label`, описание — (14px / 1.65). Кнопки оболочки переопределены до (12px / 500), кнопки toolbar — до (11px). Отдельного display-шрифта нет.

## Layout

Оболочка заполняет корневой элемент, минимальная ширина страницы (320px). Rail имеет ширину (64px), до viewport (700px) — (48px). Одна верхняя панель инструментов имеет высоту (60px); до (700px) она переносится в две строки высотой (96px). Старые CSS-правила дополнительных шапок и статуса не описывают итоговую видимую оболочку.

Конструктор: (260px / minmax(0, 1fr) / 310px). От viewport (1600px) — (280px / minmax(0, 1fr) / 330px); до (1199px) — (230px / minmax(0, 1fr) / 280px). Центр занимает оставшееся место и высоту. Внешняя страница не прокручивается, дерево и свойства прокручиваются независимо. Отступ предпросмотра — `preview`, на мобильном — `preview-mobile`.

До (1020px) свойства становятся правой выдвижной панелью (310px); добавляется строка управления (49px). До (700px) дерево становится левой панелью (270px), свойства имеют ширину `min(320px, calc(100% - 20px))`. Шапки боковых панелей — (64px).

В карточке шапка, вкладки и footer не прокручиваются; прокручивается содержимое. Отступы используют `split`, при контейнере до (680px) — `split-narrow`. Сетка полей: промежутки (24px по колонкам, 22px по строкам); до контейнера (680px) — не более двух колонок и промежуток (20px), до (420px) — одна колонка. Это container queries.

Вкладка имеет высоту (32px), контейнер (38px), padding (3px), промежуток (2px). Переполнение обслуживается исходным Tabs, на мобильном снимке видна навигация к скрытым вкладкам.

Открытое правило ширины: в предоставленных макетах фигурируют (1334/1344px); текущая модель задаёт default (840px), min (600px), max (70% viewport). Встроенный предпросмотр по умолчанию заполняет центр; (70vw) ограничивает плавающий Split-view приложения. Это поведение кода, не подтверждение эквивалентности исходному ограничению.

## Elevation & Depth

Основные панели разделены границей. У итогового предпросмотра тень отключена. Тени используются палитрой, выдвижными и вспомогательными панелями, уведомлением; активная вкладка имеет слабую тень. Точные значения находятся в sidecar и CSS.

Полноэкранная карточка находится поверх затемнения `rgba(10, 20, 34, 0.4)`, отступ от окна (16px), до viewport (680px) — (8px). Выбор блока и клавиатурный фокус обозначаются контуром (2px). Spinner вращается с периодом (1s); `prefers-reduced-motion: reduce` сокращает анимации и переходы до (0.01ms).

## Shapes

Карточка использует `split`, нативный select и строки дерева — `select` / `tree-row`, вкладки — `tab` / `tablist`. Кнопки kit xs/s используют `control-xs` / `control-s`, статус xs — `badge`. Аватары круглые. Содержательные блоки отделяются линиями, а не набором внешних карточек.

## Components

Реальные импорты: Button, TextField, Switch, Badge, Tabs, TabItem, Accordion, AccordionItem, Table из `@salutejs/sdds-finai` (0.369.0); светлая тема `@sddsjs/sdds_finai` (0.2.3). Rail, toolbar, дерево, свойства и select — собственная оболочка.

Кнопки: primary → accent, secondary → secondary, ghost → clear, danger → negative; sm → xs (2rem), md → s (2.5rem). По умолчанию secondary/md. IconButton — xs/clear/square с `aria-label` и `title`. Видимый focus — контур (2px) цвета `accent`, offset (3px), внутри builder — (2px).

TextField использует xs, внешнюю связанную подпись и `aria-describedby` для подсказки. Select нативный: высота (36px), граница `#d7dfe7`, padding `0 29px 0 11px`, ChevronDown справа. Switch — size s / toggleSize s.

Режимы toolbar выделяются акцентным текстом и нижней линией (2px). Карточка использует Tabs s/filled, TabItem s/secondary с `aria-selected` и связанными tabpanel. Активная вкладка белая; состояние чтения сохраняется при переключении. Группы полей — `dt/dd`, секции — Accordion s/clear. Badge xs/transparent выбирает вариант из текста статуса. Table находится в контейнере с прокруткой, границей и радиусом (8px); рядом поиск, сортировка, пагинация. Длинные значения переносятся, пустое значение подписано «Не указано».

Строки дерева имеют минимум (36px), hover использует мягкую поверхность, selected — `accent-soft` / `accent`. Выбранный блок в предпросмотре получает контур. Sidecar содержит пять самостоятельных статических HTML/CSS-выдержек: кнопку, поле, вкладки, статус и оболочку карточки. Они показывают визуальные правила, но не заменяют React-компоненты kit, их DOM, обработчики и доступность.

## Do's and Don'ts

### Do:

- **Do** сохранять выбранную SDDS FinAI и предоставленные Split-view-макеты как визуальный источник.
- **Do** сохранять одну верхнюю панель и заполняющий доступную высоту предпросмотр.
- **Do** сохранять размеры вкладок и существующие пороги выдвижных панелей.
- **Do** различать токены собственной оболочки и подключённого kit.
- **Do** сохранять переносы, подписи, состояния пустоты, ошибки и клавиатурного фокуса.

### Don't:

- **Don't** вводить новую метафору, палитру или эстетическую систему вместо выбранной SDDS FinAI.
- **Don't** возвращать дополнительные шапки и управление вокруг предпросмотра, уменьшающие холст.
- **Don't** уменьшать текст вкладок ради освобождения места.
- **Don't** считать 70vw согласованной заменой значений 1334/1344px из макетов.
- **Don't** выдавать статические snippets за полную реализацию FinAI или доказательство попиксельного совпадения.
