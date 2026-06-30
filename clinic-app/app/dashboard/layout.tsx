import { requireProfileWithPlan } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { SubscriptionBanner } from '@/components/subscription-banner';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfileWithPlan();

  return (
    <div className="flex h-screen">
      <Sidebar
        role={profile.role}
        fullName={profile.full_name}
        modules={profile.modules}
        planName={profile.plan?.name ?? null}
        subscription={profile.subscription}
        trialEndsAt={profile.clinic?.trial_ends_at ?? null}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <SubscriptionBanner subscription={profile.subscription} trialEndsAt={profile.clinic?.trial_ends_at ?? null} />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
