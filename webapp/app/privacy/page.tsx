import LegalPage from '@/components/LegalPage';
import { getT, getTSync } from '@/lib/i18n/server';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return pageMeta({ title: `${t('Privacy Policy')} — Tender Town`, description: t('How Tender Town handles personal data.'), path: '/privacy' });
}

export default function PrivacyPage() {
  const t = getTSync();
  return (
    <LegalPage title={t('Privacy Policy')} updated="2026-10-11" englishOnly>
      <h2>Who is responsible</h2>
      <p>Neonancestry, Unipessoal, Lda, NIPC 519172825, Rua Latino Coelho 39, 4.º Dto., 1050-132 Lisboa, Portugal, is the controller of the personal data described here. Contact: privacy@tendertown.io. No data protection officer is appointed.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your email address, and either a password (stored only as a secure hash by our authentication provider) or a sign-in with Google, which shares that email with us. Also your username and sign-up date.</li>
        <li><strong>Profile:</strong> display name, picture and the description you write — shown on your public profile.</li>
        <li><strong>Activity:</strong> the tenders and news you follow (visible only to you); your posts, comments and likes (visible to other people); and your chat messages.</li>
        <li><strong>Billing:</strong> if you take a paid plan, Stripe processes the payment. We store a customer reference and your plan, not your card number.</li>
        <li><strong>Scope context:</strong> files uploaded to a workspace’s scopes (such as presentations, references and team CVs, which can contain other people’s personal data). Upload only what you’re entitled to share.</li>
        <li><strong>Technical:</strong> a session cookie that keeps you signed in, and cookies that remember your interface language and display mode (light, dark or automatic). We don’t use advertising or tracking cookies.</li>
      </ul>
      <h2>Why we use it</h2>
      <p>To provide your account and the platform’s features (performance of our contract with you), to keep the service secure, and to improve it (our legitimate interests). We don’t sell your data.</p>
      <h2>Who processes it for us</h2>
      <ul>
        <li><strong>Supabase</strong> — database, file storage and authentication (EU region: Ireland).</li>
        <li><strong>Vercel</strong> — website hosting.</li>
        <li><strong>Anthropic</strong> — AI models behind the agents; tender and company material is sent to them when an agent runs.</li>
        <li><strong>Tavily</strong> — web search and page reading for the search agents (no account data).</li>
        <li><strong>Stripe</strong> — subscription payments, when you choose a paid plan.</li>
        <li><strong>Google</strong> — only if you choose to sign in with Google. It authenticates you and shares your email address.</li>
      </ul>
      <p>Supabase stores and processes data in the EU (Ireland). Vercel, Anthropic, and Stripe may process personal data outside the European Economic Area, and Google does too when you sign in with Google. Those transfers rely on the European Commission’s standard contractual clauses.</p>
      <h2>How long we keep it</h2>
      <p>For as long as your account exists. Deleting your account (Edit profile → Delete account) removes your profile, picture, follows, posts, comments and chat from the live database. Backups exist only so the service can be restored, and they expire on the provider’s backup cycle.</p>
      <h2>Your rights</h2>
      <p>You can access, correct or delete your data, object to or restrict its use, and ask for a copy (portability) — most of it directly in Edit profile, or by writing to privacy@tendertown.io. You can also complain to your data protection authority.</p>
    </LegalPage>
  );
}
