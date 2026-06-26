import { requireProfile } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <div className="flex">
      <Sidebar role={profile.role} fullName={profile.full_name} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
