import { requireProfileWithPlan } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfileWithPlan();

  return (
    <div className="flex">
      <Sidebar role={profile.role} fullName={profile.full_name} modules={profile.modules} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
