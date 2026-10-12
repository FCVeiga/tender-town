import Link from 'next/link';
import { siteOrigin } from '@/lib/auth';
import { getT, getTSync } from '@/lib/i18n/server';

const LEAD = 'Public tenders, funding and market news across Europe — and a community of the people who bid on them.';

const QUESTIONS: [string, string][] = [
  ['What is Tender Town?', 'A platform for public tenders, grants and market news across Europe, and a community of the people who bid on them.'],
  ['Who is Tender Town for?', 'Companies, consultants and teams that look for and bid on public contracts in Europe.'],
  ['What do the agents do?', 'They fetch tenders and news, summarise them, pull the documents, and list the requirements. Tender Evaluation scores how well a tender fits your context: 1 a month on Starter, 5 on Pro, unlimited on Teams. Proposal briefs are on Teams. You configure each agent, per scope, in plain language.'],
  ['Can I configure the agents?', 'Yes, on Starter, Pro and Teams. Each scope has its own agents. You switch them on or off and tell them, in plain language, what to look for and how to work. Search, triage, document collection and requirements are on those plans. Tender Evaluation starts on Starter. Proposal briefs are on Teams. The News Report Agent is on Pro and Teams.'],
  ['Does Tender Town pull the tender documents?', 'Yes. The documents agent collects the notices and files, starting from the first publication of the procedure and including later updates such as deadline extensions.'],
  ['Can it list the requirements?', 'Yes. The analysis agent reads those documents and lists the requirements. Free includes this on 2 tender pages a month, Starter on 10, and Pro and Teams on every tender.'],
  ['Can it judge whether a tender fits us?', 'From Starter, the Tender Evaluation Agent checks the requirements against the instructions and context of your scope and scores the fit. Starter includes 1 a month, Pro 5, and Teams unlimited.'],
  ['Can it suggest how to approach a proposal?', 'On Teams, the Proposal Manager turns that evaluation into a brief: the requirements, the references you already have, the gaps, and the steps.'],
  ['What is the News Report Agent?', 'It reads a news story and writes a full summary plus what your team should do about it. Pro includes 50 reports a month. Teams includes unlimited reports. It is not on Free or Starter.'],
  ['Is an account required?', 'No. Tenders, news and posts can be read without one. An account is for following items, posting, chat and, on Starter and above, your own scopes.'],
  ['Which plan should I choose?', 'Free includes General and one template scope, and cannot create its own. Starter includes one scope besides General, which you can create, and 1 tender evaluation a month. Pro adds up to five scopes, 5 evaluations a month and 50 news reports a month, at €89 a month. Teams adds unlimited evaluations and proposal briefs, for several workspaces and members, at €139 a month. A year costs eleven months.'],
  ['How often does Tender Town update?', 'A pipeline runs every four hours. Each scope refreshes as often as its plan allows: once a day on Free, twice on Starter, three times on Pro and six times on Teams.'],
];

export async function generateMetadata() {
  const t = await getT();
  const origin = siteOrigin();
  const description = t(LEAD);
  const title = `${t('About')} — Tender Town`;
  return {
    title,
    description,
    alternates: { canonical: `${origin}/about`, types: { 'application/rss+xml': `${origin}/feed.xml` } },
    openGraph: { title, description, url: `${origin}/about`, siteName: 'Tender Town', type: 'website' },
  };
}

export default function AboutPage() {
  const t = getTSync();
  const origin = siteOrigin();
  const faq = QUESTIONS.map(([q, a]) => ({ q: t(q), a: t(a) }));
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'Tender Town',
        url: origin,
        description: t(LEAD),
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Tender Town',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: origin,
        description: t(LEAD),
        offers: { '@type': 'AggregateOffer', lowPrice: '0', highPrice: '139', priceCurrency: 'EUR', offerCount: 4 },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
  return (
    <article className="legal">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />
      <h1 className="opps-h1">{t('About')}</h1>
      <p className="page-sub">{t(LEAD)}</p>
      <div className="legal-body">
        <h2>{t('What Tender Town is')}</h2>
        <p>{t('Tender Town is a platform for public procurement across Europe. It tracks open tenders — requests for proposals, requests for information, grants and funding calls — with their documents and requirements, plus regulation, industry and market news.')}</p>
        <p>{t('Posts, comments, chat and profiles sit on the same site, for the people who find and bid on this work.')}</p>

        <h2>{t('Agents you configure')}</h2>
        <p>{t('Each scope has its own agents, and you set them in plain language: what to look for, how to score it, and what to do with it. They fetch tenders and news, summarise them, pull the documents, list the requirements, judge how well a tender fits your context, and outline how you could approach a proposal.')}</p>
        <h3>{t('Fetch and summarise')}</h3>
        <p>{t('The Search Agent collects notices and stories from TED, national portals, funding programmes, development banks, news, and the sources a workspace follows. The Triage Agent scores them. Visitors see the General scope, which ranks without a language model. A custom scope scores against your instructions.')}</p>
        <h3>{t('Documents and requirements')}</h3>
        <p>{t('A tender page starts from the first publication of the procedure — the original request, grant or contract notice — and then the changes since, including deadline extensions. Agents pull the documents, write a summary and list the requirements.')}</p>
        <h3>{t('Fit and the proposal')}</h3>
        <p>{t('On Pro and Teams, the Tender Evaluation Agent checks those requirements against the instructions and context of your scope. The Proposal Manager then outlines how a proposal could be approached: what you already have, what is missing, and the steps to take.')}</p>
        <h3>{t('News reports')}</h3>
        <p>{t('The News Report Agent reads an article and writes a full summary and a report on what to do: publish, take part, announce, reach out, bid, or watch. It is included on Pro, up to 50 reports a month, and unlimited on Teams.')}</p>

        <h2>{t('How it works')}</h2>
        <h3>{t('Where the material comes from')}</h3>
        <p>{t('Agents search TED (Tenders Electronic Daily), national procurement portals, EU funding programmes, development-bank notices and news, and the sources a workspace follows.')}</p>
        <h3>{t('How items are chosen')}</h3>
        <p>{t('Each result is scored. Visitors and new accounts see the General scope. It ranks tenders by contract value, the standing of the buyer, how widely the opportunity applies and the time left to bid, without a language model. News is ranked by the outlet, how widely the story is covered and how recent it is. A custom scope scores results against the instructions of that workspace.')}</p>
        <h3>{t('From the first notice to the latest update')}</h3>
        <p>{t('A tender page starts from the first publication of the procedure — the original request, grant or contract notice — and then the changes since, including deadline extensions. Agents write a summary and list the requirements from those documents.')}</p>
        <h3>{t('Workspaces and scopes')}</h3>
        <p>{t('A scope is one configuration of the radar: its instructions, context documents, search and agents. A workspace holds scopes and members. The workspace you have open decides what Home, Tenders, News, History and Community show.')}</p>

        <h2>{t('Accounts and plans')}</h2>
        <p>
          {t('Tenders, news and community posts can be read without an account. An account lets you follow items, keep a profile, post, comment and chat. Starter adds a scope you configure and 1 tender evaluation a month. Pro adds 5 evaluations a month and the News Report Agent. Teams adds unlimited evaluations and proposal briefs.')}
          {' '}<Link href="/pricing">{t('Pricing')}</Link>
        </p>

        <h2>{t('Questions')}</h2>
        {faq.map((f) => (
          <section key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
