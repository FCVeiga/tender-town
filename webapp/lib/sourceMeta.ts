// Source registry metadata, shared by client and server code (no server imports here).
// Types mirror the `sourcetype` enum; methods mirror agents/source_monitor.py.

export const SOURCE_TYPES = [
  { value: 'PROCUREMENT_PORTAL', label: 'Tender portal', icon: 'portal' },
  { value: 'FUNDING_PORTAL', label: 'Funding portal', icon: 'funding' },
  { value: 'EU_PROGRAMME', label: 'EU programme', icon: 'funding' },
  { value: 'LSP', label: 'Large-scale pilot', icon: 'funding' },
  { value: 'CONSORTIUM', label: 'Consortium', icon: 'funding' },
  { value: 'GOVERNMENT', label: 'Government site', icon: 'government' },
  { value: 'DIGITAL_AGENCY', label: 'Digital agency', icon: 'government' },
  { value: 'IDENTITY_AUTHORITY', label: 'Identity authority', icon: 'government' },
  { value: 'STANDARDS_BODY', label: 'Standards body', icon: 'standards' },
  { value: 'DEVELOPMENT_BANK', label: 'Development bank', icon: 'bank' },
  { value: 'NEWS', label: 'News site / blog', icon: 'news' },
  { value: 'INDUSTRY_SOURCE', label: 'Industry source', icon: 'news' },
  { value: 'SOCIAL_REDDIT', label: 'Reddit', icon: 'reddit' },
  { value: 'SOCIAL_TWITTER', label: 'X / Twitter', icon: 'twitter' },
  { value: 'SOCIAL_LINKEDIN', label: 'LinkedIn', icon: 'linkedin' },
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number]['value'];
export const typeMeta = (t: string) => SOURCE_TYPES.find((x) => x.value === t) ?? SOURCE_TYPES[5];

export const SOURCE_GROUPS = [
  { key: 'portals', label: 'Tender portals', types: ['PROCUREMENT_PORTAL'] },
  { key: 'funding', label: 'Funding & EU programmes', types: ['FUNDING_PORTAL', 'EU_PROGRAMME', 'LSP', 'CONSORTIUM'] },
  { key: 'government', label: 'Government & agencies', types: ['GOVERNMENT', 'DIGITAL_AGENCY', 'IDENTITY_AUTHORITY'] },
  { key: 'standards', label: 'Standards & trust', types: ['STANDARDS_BODY'] },
  { key: 'banks', label: 'Development banks', types: ['DEVELOPMENT_BANK'] },
  { key: 'news', label: 'News & media', types: ['NEWS', 'INDUSTRY_SOURCE'] },
  { key: 'social', label: 'Social', types: ['SOCIAL_REDDIT', 'SOCIAL_TWITTER', 'SOCIAL_LINKEDIN'] },
] as const;

export const METHODS = {
  ted: { label: 'TED API', hint: 'Searched daily through the TED API.' },
  api: { label: 'Procurement API', hint: 'Searched on each run through this source’s API.' },
  rss: { label: 'RSS / Atom feed', hint: 'Every new item in the feed is picked up.' },
  site_search: { label: 'Site search', hint: 'A web search limited to this site, on the schedule below. For portals and sites without a feed.' },
  off: { label: 'Off — list only', hint: 'Listed here but not monitored.' },
} as const;
export type Method = keyof typeof METHODS;

export const FREQUENCIES = [1, 3, 7, 14, 30] as const;

// X and LinkedIn have no free feed; they can be listed but not monitored yet.
export const NOT_CONNECTABLE: string[] = ['SOCIAL_TWITTER', 'SOCIAL_LINKEDIN'];

export type Source = {
  source_id: string; name: string; source_type: SourceType; country: string | null;
  url: string | null; handle: string | null; feed_url: string | null;
  method: Method; enabled: boolean; check_every_days: number;
  last_checked: string | null; last_successful_check: string | null; last_error: string | null;
  number_results_last_run: number | null;
};

export type SourceActivity = {
  id: number; source_id: string; title: string | null; url: string | null; published_at: string | null;
  relevant: boolean | null;
  title_en: string | null;
  kind: string | null;          // what triage found it to be: TENDER, RFI, GRANT, NEWS_ONLY…
  sources: { name: string; source_type: SourceType; handle: string | null; method: Method } | null;
};
