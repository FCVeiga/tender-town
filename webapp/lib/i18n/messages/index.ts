/**
 * Interface translations. Each JSON file maps the English text (the key) to
 * its translations: { "Save": { "pt": "Guardar", "es": "Guardar", ... } }.
 * English needs no entry: the key is the English text.
 */
import type { Messages, UiLang } from '../languages';
import settings from './settings.json';
import workspaces from './workspaces.json';
import people from './people.json';
import tenders from './tenders.json';
import news from './news.json';
import shell from './shell.json';
import mcp from './mcp.json';
import analytics from './analytics.json';
import markets from './markets.json';

// Later files win where two define the same key differently: the most visible wording last.
const FILES: Record<string, Partial<Record<UiLang, string>>>[] = [settings, workspaces, people, tenders, news, shell, mcp, analytics, markets];

const cache = new Map<UiLang, Messages>();
export function messagesFor(lang: UiLang): Messages {
  if (lang === 'en') return {};
  if (!cache.has(lang)) {
    const out: Messages = {};
    for (const file of FILES) for (const [key, tr] of Object.entries(file)) if (tr[lang]) out[key] = tr[lang]!;
    cache.set(lang, out);
  }
  return cache.get(lang)!;
}
