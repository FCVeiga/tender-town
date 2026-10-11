import { getSupabaseServerClient } from '@/lib/supabase';
import { getT } from '@/lib/i18n/server';

/** Other outlets that covered this tender or story. The page already links the record we keep. */
export default async function ItemSources({ type, id, skip }: { type: 'tender' | 'news'; id: string; skip?: string | null }) {
  const { data } = await getSupabaseServerClient()
    .from('item_sources')
    .select('url, title, source_name')
    .eq('item_type', type)
    .eq('item_id', id)
    .order('created_at', { ascending: true });
  const rows = (data || []).filter((s) => s.url && s.url !== skip);
  if (!rows.length) return null;
  const t = await getT();
  return (
    <div className="source-more">
      <h3>{t('Sources')}</h3>
      <ul className="source-list">
        {rows.map((s) => (
          <li key={s.url}>
            <a className="ext-link" href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title || s.source_name || s.url} ↗
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
