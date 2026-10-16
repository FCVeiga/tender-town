'use client';

import type { ShownCriterion } from '@/lib/award';
import { useT } from '@/lib/i18n/client';

function weightText(weight: number | null, asPercent: boolean) {
  if (weight == null || Number.isNaN(weight)) return '—';
  const n = Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 10) / 10);
  return asPercent && weight <= 100 ? `${n}%` : n;
}

/** How the buyer scores the offer: the price and quality split, then the scoring grid. */
export default function EvaluationCriteria({ rows }: { rows: ShownCriterion[] }) {
  const t = useT();
  const split = rows.filter((row) => row.kind === 'split');
  const grid = rows.filter((row) => row.kind === 'grid').slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!split.length && !grid.length) return null;
  return (
    <div className="req-category-block">
      <h3 className="req-category-title">{t('Evaluation criteria')}</h3>
      {split.length > 0 && (
        <div className="award-list">
          {split.map((row) => (
            <div key={row.id} className="award-row">
              <span className="award-label">
                {row.name}
                {row.description && <span className="award-note">{row.description}</span>}
              </span>
              <span className="award-bar">{row.weight != null && row.weight <= 100 ? <span style={{ width: `${Math.max(0, Math.min(100, row.weight))}%` }} /> : null}</span>
              <span className="award-weight">{weightText(row.weight, true)}</span>
            </div>
          ))}
        </div>
      )}
      {grid.length > 0 && (
        <div className="brief-table-wrap">
          <table className="award-table">
            <thead>
              <tr>
                <th>{t('Criterion')}</th>
                <th>{t('Marks')}</th>
                <th>{t('What is assessed')}</th>
              </tr>
            </thead>
            <tbody>
              {grid.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{weightText(row.weight, false)}</td>
                  <td>{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
