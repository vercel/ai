import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PATHS = ['/login', '/signup', '/suspended'];

export async function updateSession(request: NextRequest) {
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
  }

  return response;
}
