import { notFound } from 'next/navigation';
import { isSuperAdmin } from '@/lib/admin';

/** The dashboard and each of its reports. Only the Google super-admin account. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSuperAdmin())) notFound();
  return children;
}
