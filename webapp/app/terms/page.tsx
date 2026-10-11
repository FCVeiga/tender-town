import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import { getT, getTSync } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({ title: `${t('Terms & Conditions')} — Tender Town`, description: t('The terms for using Tender Town.'), path: '/terms' });
}

export default function TermsPage() {
  const t = getTSync();
  return (
    <LegalPage title={t('Terms & Conditions')} updated="2026-10-02" draft englishOnly>
      <h2>1. Who we are</h2>
      <p>Tender Town is operated by Neonancestry, Unipessoal, Lda, NIPC 519172825, Rua Latino Coelho 39, 4.º Dto., 1050-132 Lisboa, Portugal (“the operator”, “we”). Contact: privacy@tendertown.io.</p>
      <h2>2. Your account</h2>
      <p>You need an account to follow items, keep a profile and use the platform’s agents. Give accurate details, keep your password safe, and tell us if you suspect misuse. You’re responsible for activity on your account. You can delete it at any time from Edit profile.</p>
      <h2>3. What the platform provides</h2>
      <p>Tender Town collects publicly available tender notices, documents and news, and uses automated agents — including AI models — to sort, summarise, translate and analyse them. Summaries, scores, evaluations and proposal briefs are generated automatically and may be incomplete or wrong. Always check the official notice and documents before you act; they prevail over anything shown here. Nothing on the platform is legal, financial or bidding advice.</p>
      <h2>4. Acceptable use</h2>
      <p>Don’t use the platform to break the law, infringe others’ rights, upload malicious content or personal data you have no right to share, scrape or overload the service, or try to access other users’ accounts or data. We may suspend accounts that do.</p>
      <h2>5. Your content</h2>
      <p>You keep the rights to what you upload or write (profile, company material, and — later — posts and comments). You give the operator the permission needed to host and process it to run the platform for you, including sending it to the AI providers that power the agents. Public content such as posts will be visible to other users.</p>
      <h2>6. Third-party content</h2>
      <p>Tender notices, documents and news belong to their publishers. We link to the sources and show short summaries; follow the publishers’ own terms when you use their material.</p>
      <h2>7. Availability and changes</h2>
      <p>We work to keep the platform running but don’t guarantee it will be uninterrupted or error-free. We may change features or these terms; we’ll tell you about significant changes.</p>
      <h2>8. Liability</h2>
      <p>[To be completed by counsel: limitation of liability and governing law / jurisdiction.]</p>
      <h2>9. Privacy</h2>
      <p>How we handle personal data is described in our <Link href="/privacy">Privacy Policy</Link>.</p>
    </LegalPage>
  );
}
