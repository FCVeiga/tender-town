import { redirect } from 'next/navigation';
import { NOINDEX } from '@/lib/seo';

export const metadata = { title: 'Profile — Tender Town', ...NOINDEX };

/** Profile editing lives in Settings → Profile. */
export default function EditProfile() {
  redirect('/settings/profile');
}
