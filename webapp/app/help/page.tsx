import Link from 'next/link';
import { Fragment } from 'react';
import LegalPage from '@/components/LegalPage';
import { getT, getTSync } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({ title: `${t('Help')} — Tender Town`, description: t('How Tender Town works, and how to read tenders, news and posts.'), path: '/help' });
}

/** Turns <b>…</b> and <a1>…</a1>-style tags in a translated string into elements. */
function rich(text: string, tags: Record<string, (s: string) => React.ReactNode>) {
  return text.split(/(<(\w+)>.*?<\/\2>)/).map((part, i, arr) => {
    if (i % 3 === 2) return null; // the captured tag name
    const m = part.match(/^<(\w+)>(.*?)<\/\1>$/);
    return <Fragment key={i}>{m && tags[m[1]] ? tags[m[1]](m[2]) : part}</Fragment>;
  });
}

const b = (s: string) => <strong>{s}</strong>;
const link = (href: string) => (s: string) => <Link href={href}>{s}</Link>;

function faq(t: (key: string) => string): { q: string; a: React.ReactNode }[] {
  return [
    { q: t('What is Tender Town?'), a: t('A radar for public tenders, grants and market news in your field. Agents search TED, national portals, news and the sources you follow every day, sort what matters, and write it up for you.') },
    { q: t('How is the home feed ordered?'), a: rich(t('<b>Top</b> blends each item’s relevance with how recent it is, so important news stays up longer. <b>Relevance</b> is the AI score alone; <b>New</b> is newest first.'), { b }) },
    { q: t('What does the heart do?'), a: rich(t('It follows a tender or news story. Everything you follow is under <b>Following</b> on your profile, visible only to you.'), { b }) },
    { q: t('What are the agents?'), a: rich(t('Each step of the radar is an agent — search, triage, documents, analysis, evaluation, proposal brief, news reports, feed writing and translation. Each scope in your <workspaces>Workspaces</workspaces> has its own; on a paid plan you can switch them on or off and tune them in plain language.'), { workspaces: link('/workspaces') }) },
    { q: t('How do I get a fit score for a tender?'), a: rich(t('Open the tender and run the <b>Tender Evaluation Agent</b>. It checks the requirements against your scope’s instructions and context in Workspace. Then the <b>Proposal Manager Agent</b> can write the proposal brief.'), { b }) },
    { q: t('What are workspaces and plans?'), a: rich(t('A workspace holds your scopes. Every account has General and the template scopes. Free can turn on one template scope besides General, and cannot create its own. Starter can turn on one scope besides General, and that scope can be one you create. Pro can turn on up to five. Teams adds unlimited workspaces, each with its own team members (admins configure, members see the results). Create workspaces and add members on <workspaces>Workspaces</workspaces>, change your plan in <settings>Settings</settings>, and switch workspaces from your account menu.'), { workspaces: link('/workspaces'), settings: link('/settings/account?plan=1') }) },
    { q: t('I forgot my password.'), a: rich(t('Use <reset>Reset your password</reset> on the log-in page. (Reset emails need the platform’s email service to be set up; until then, contact us.)'), { reset: link('/forgot-password') }) },
    { q: t('How do I change my profile or delete my account?'), a: rich(t('Profile → <b>Edit profile</b>. You can change your picture, name, username and description, change your password, or delete your account and all its data.'), { b }) },
  ];
}

export default function HelpPage() {
  const t = getTSync();
  return (
    <LegalPage title={t('Help')}>
      <div className="faq">
        {faq(t).map((f) => (
          <details key={f.q} className="faq-item">
            <summary>{f.q}</summary>
            <div>{f.a}</div>
          </details>
        ))}
      </div>
      <h2>{t('Still stuck?')}</h2>
      <p>{t('Write to us at [support email] and we’ll get back to you.')}</p>
    </LegalPage>
  );
}
