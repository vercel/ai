import { requireProfileWithPlan } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { SubscriptionBanner } from '@/components/subscription-banner';
import { ImpersonationBanner } from '@/components/impersonation-banner';

// Every page under /dashboard depends on the logged-in user's live
// profile/subscription/super-admin status. Without this, Next.js's fetch
// Data Cache can serve a stale Supabase response (e.g. "not a super admin")
// captured before a DB change, and that stale entry persists across
// deployments until explicitly bypassed.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfileWithPlan();

  const supabase = createSupabaseServerClient();
  const { data: superAdmin } = await supabase
    .from('super_admins')
    .select('user_id')
    .eq('user_id', profile.id)
    .maybeSingle();

  return (
    <div className="flex h-screen">
      <Sidebar
        role={profile.role}
        fullName={profile.full_name}
        modules={profile.modules}
        planName={profile.plan?.name ?? null}
        subscription={profile.subscription}
        trialEndsAt={profile.clinic?.trial_ends_at ?? null}
        isSuperAdmin={Boolean(superAdmin)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ImpersonationBanner actorId={profile.id} />
        <SubscriptionBanner subscription={profile.subscription} trialEndsAt={profile.clinic?.trial_ends_at ?? null} />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
