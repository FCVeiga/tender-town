import 'server-only';
import { cache } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase';

/** The only account that may open the dashboard. Google sign-in, not a password with the same address. */
const SUPER_ADMIN_EMAIL = 's3mztube@gmail.com';

export const isSuperAdmin = cache(async () => {
  const user = await getCurrentUser();
  if (!user || user.email.toLowerCase() !== SUPER_ADMIN_EMAIL) return false;
  const { data } = await getSupabaseServerClient().auth.admin.getUserById(user.id);
  const identities = data.user?.identities ?? [];
  return identities.some((identity) => identity.provider === 'google') || data.user?.app_metadata?.provider === 'google';
});
