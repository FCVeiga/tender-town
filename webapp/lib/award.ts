import { firstInLanguage } from '@/lib/english';

/** One award row as the Requirements & fit section shows it. */
export type ShownCriterion = {
  id: string;
  name: string;
  weight: number | null;
  description: string;
  kind: 'split' | 'grid';
};

export function shownCriteria(rows: any[] | null | undefined): ShownCriterion[] {
  return (rows || []).map((row) => {
    const sub = row.subcriteria && typeof row.subcriteria === 'object' ? row.subcriteria : {};
    const name = firstInLanguage(sub.name_en, sub.name) || sub.name || row.criterion || '';
    const raw = firstInLanguage(sub.description_en, sub.description) || sub.description || '';
    return {
      id: String(row.id),
      name: String(name),
      weight: row.weight == null || row.weight === '' ? null : Number(row.weight),
      description: raw && raw !== name ? String(raw) : '',
      kind: (sub.type === 'grid' ? 'grid' : 'split') as ShownCriterion['kind'],
    };
  }).filter((row) => row.name);
}
