import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isProtectedPath = request.nextUrl.pathname.startsWith('/workspace')
    || request.nextUrl.pathname.startsWith('/notes')
    || request.nextUrl.pathname.startsWith('/journal')
    || request.nextUrl.pathname.startsWith('/chat')
    // Segment-bound, not a plain prefix: a plain startsWith('/harry') also
    // matches /harry-shared/[token], which must stay public (anon-readable
    // share links, same exemption as /shared/[token]) -- a plain prefix
    // check would silently redirect anonymous visitors to /login.
    || request.nextUrl.pathname === '/harry'
    || request.nextUrl.pathname.startsWith('/harry/')

  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}
