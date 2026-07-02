import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PATHS = ['/login', '/signup', '/suspended', '/p/', '/book/'];

export async function updateSession(request: NextRequest) {
  // API routes authenticate themselves (webhook/cron secrets, RLS-scoped
  // portal tokens) — they must never get redirected to /login just because
  // the caller (a cron job, a payment gateway) sends no session cookie.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const isPublic =
    request.nextUrl.pathname === '/' ||
    PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (data.user) {
    // Super admins are locked to the Centro de Comando — the regular clinic
    // dashboard is only reachable while actively impersonating a clinic.
    const { data: superAdmin } = await supabase
      .from('super_admins')
      .select('user_id')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (superAdmin) {
      const { data: activeImpersonation } = await supabase
        .from('impersonation_sessions')
        .select('id')
        .eq('super_admin_id', data.user.id)
        .is('ended_at', null)
        .maybeSingle();

      if (!activeImpersonation) {
        if (isPublic && request.method === 'GET') {
          const url = request.nextUrl.clone();
          url.pathname = '/super-admin';
          return NextResponse.redirect(url);
        }
        if (request.nextUrl.pathname.startsWith('/dashboard')) {
          const url = request.nextUrl.clone();
          url.pathname = '/super-admin';
          return NextResponse.redirect(url);
        }
      }
    } else if (isPublic && request.method === 'GET') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    if (!superAdmin && request.nextUrl.pathname.startsWith('/dashboard')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('clinic_id')
        .eq('id', data.user.id)
        .maybeSingle<{ clinic_id: string | null }>();

      if (profile?.clinic_id) {
        // Hard-Block: a manually suspended subscription locks the clinic out
        // of every /dashboard/* route, including onboarding. past_due is a
        // soft warning only — the clinic stays navigable, banner handles it.
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('clinic_id', profile.clinic_id)
          .maybeSingle<{ status: string }>();

        if (subscription?.status === 'suspended') {
          const url = request.nextUrl.clone();
          url.pathname = '/suspended';
          url.searchParams.set('reason', 'billing');
          return NextResponse.redirect(url);
        }

        // Hard Paywall: a clinic that signed up for a paid plan can't reach
        // any /dashboard/* route — including the Setup Wizard — until the
        // payment gateway's webhook flips the subscription to 'active'.
        if (subscription?.status === 'pending_payment') {
          const url = request.nextUrl.clone();
          url.pathname = '/checkout';
          return NextResponse.redirect(url);
        }

        const isOnboardingRoute = request.nextUrl.pathname.startsWith('/dashboard/onboarding');
        if (!isOnboardingRoute) {
          const { data: clinic } = await supabase
            .from('clinics')
            .select('onboarding_completed')
            .eq('id', profile.clinic_id)
            .maybeSingle<{ onboarding_completed: boolean }>();

          if (clinic && !clinic.onboarding_completed) {
            const url = request.nextUrl.clone();
            url.pathname = '/dashboard/onboarding';
            return NextResponse.redirect(url);
          }
        }
      }
    }
  }

  return response;
}
