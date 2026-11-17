import { ArrowLeft, FileText } from 'lucide-react';
import { Badge } from '@salutejs/sdds-finai';
export function DemoContract() {
  return (
    <main className="contract-page">
      <a href="/">
        <ArrowLeft size={15} />В рабочее пространство
      </a>
      <div className="contract-heading">
        <FileText size={24} />
        <div>
          <h1>Договор Д-2026/041</h1>
          <p>Демонстрационная связанная карточка</p>
        </div>
        <Badge size="s" view="positive" text="Действует" transparent />
      </div>
      <dl className="field-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
        {[
          ['Номер договора', 'Д-2026/041'],
          ['Дата договора', '15 апреля 2026 г.'],
          ['Предмет договора', 'Поставка офисного оборудования'],
          ['Субъект учёта', 'АО «Демо Финанс»'],
        ].map(([label, value]) => (
          <div className="detail-field" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="utility-note">
        Данные вымышлены. В рабочей системе ссылка может вести на зарегистрированный маршрут хоста или
        отдельный виджет.
      </p>
    </main>
  );
}
