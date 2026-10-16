/**
 * The platform's agents, as shown on Workspace and in the sidebar's
 * "Working Agents". Search, Triage, Tender Evaluation, Proposal Manager and
 * News Report work per scope (lib/scopes.ts); the rest are platform agents. (The Verification Agent, which checks each tender is
 * really open, runs internally on the platform's own configuration and is
 * not listed.) Keys match agent_settings.agent_key and the pipeline's
 * services/agent_settings.py (AGENT_PROMPTS).
 */
export type AgentFaceStyle = {
  colors: [string, string];                // background gradient
  eyes: 'round' | 'visor' | 'wide' | 'happy' | 'scan';
  top: 'antenna' | 'dish' | 'bolt' | 'leaf' | 'cap' | 'spark' | 'twin' | 'halo' | 'none';
  mouth: 'smile' | 'flat' | 'o' | 'grin';
};

export type AgentDef = {
  key: string;
  name: string;
  role: string;                             // one line: what it does
  runs: 'pipeline' | 'on page open' | 'on click';
  prompt: string | null;                    // its config file, shown under "Open config"
  fineTune: boolean;                        // accepts plain-language fine-tuning
  face: AgentFaceStyle;
};

export const AGENTS: AgentDef[] = [
  {
    key: 'search', name: 'Search Agent', runs: 'pipeline', prompt: 'search scope (Workspace → scope → Search Agent)', fineTune: false,
    role: 'Finds tenders and news on procurement portals, the web and your followed sources.',
    face: { colors: ['#00CCFF', '#3D7BFF'], eyes: 'scan', top: 'dish', mouth: 'flat' },
  },
  {
    key: 'triage', name: 'Triage Agent', runs: 'pipeline', prompt: 'prompts/triage.md', fineTune: true,
    role: 'Scores each find for relevance and sorts tenders, grants and news.',
    face: { colors: ['#FFB547', '#FF7A59'], eyes: 'round', top: 'bolt', mouth: 'flat' },
  },
  {
    key: 'tender_documents', name: 'Tender Documents Agent', runs: 'pipeline', prompt: 'agents/tender_documents.py — settings (JSON)', fineTune: true,
    role: 'Collects each tender’s notices and documents and spots changes.',
    face: { colors: ['#94A3B8', '#475569'], eyes: 'round', top: 'twin', mouth: 'o' },
  },
  {
    key: 'tender_analysis', name: 'Tender Analysis Agent', runs: 'on click', prompt: 'prompts/tender_requirements.md', fineTune: true,
    role: 'Writes each tender’s summary and its full list of requirements.',
    face: { colors: ['#A5B4FC', '#4F46E5'], eyes: 'wide', top: 'antenna', mouth: 'flat' },
  },
  {
    key: 'tender_evaluation', name: 'Tender Evaluation Agent', runs: 'on click', prompt: 'webapp/agents/tender_evaluation.md', fineTune: true,
    role: 'Checks a tender against your scope, scores the fit and advises.',
    face: { colors: ['#FF5FA2', '#B5367F'], eyes: 'visor', top: 'halo', mouth: 'grin' },
  },
  {
    key: 'proposal_manager', name: 'Proposal Manager Agent', runs: 'on click', prompt: 'webapp/agents/proposal_manager.md', fineTune: true,
    role: 'Prepares the submission pack from the tender’s templates, fills each document from your company file, and lists the next steps.',
    face: { colors: ['#5EEAD4', '#0D9488'], eyes: 'round', top: 'cap', mouth: 'smile' },
  },
  {
    key: 'news_report', name: 'News Report Agent', runs: 'on page open', prompt: 'webapp/agents/news_report.md', fineTune: true,
    role: 'Summarises a story when opened and suggests what to do about it.',
    face: { colors: ['#00CCFF', '#00FFCC'], eyes: 'happy', top: 'antenna', mouth: 'smile' },
  },
  {
    key: 'feed_writer', name: 'Feed Writer Agent', runs: 'pipeline', prompt: 'prompts/feed_post.md', fineTune: true,
    role: 'Writes the headline and post for every item in the feed.',
    face: { colors: ['#FDE047', '#F59E0B'], eyes: 'happy', top: 'spark', mouth: 'grin' },
  },
  {
    key: 'translator', name: 'Translator Agent', runs: 'pipeline', prompt: 'prompts/translation.md', fineTune: true,
    role: 'Translates titles, documents and summaries into the site language.',
    face: { colors: ['#C084FC', '#7C3AED'], eyes: 'round', top: 'leaf', mouth: 'smile' },
  },
];

export const agentByKey = (key: string) => AGENTS.find((a) => a.key === key)!;
