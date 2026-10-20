import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { NOINDEX } from '@/lib/seo';

export const metadata = { title: 'Profile — Tender Town', ...NOINDEX };

/** "Profile" in the user menu: your own page. */
export default async function MyProfile() {
  const user = await getCurrentUser();
  redirect(user ? `/u/${user.username}` : '/login?next=/profile');
}
