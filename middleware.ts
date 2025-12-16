import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 使用 getSession 代替 getUser，避免每次都发网络请求验证
  // getSession 只验证本地 JWT token，速度更快
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user

  const { pathname } = request.nextUrl

  // 受保护的路由（需要登录）
  const protectedRoutes = ['/dashboard']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  // 认证页面路由（已登录用户不应访问）
  const authRoutes = ['/auth/login', '/auth/register']
  const isAuthRoute = authRoutes.some(route => pathname.startsWith(route))

  // 未登录用户访问受保护页面 → 重定向到登录
  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('redirect', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(url)
  }

  // 已登录用户访问认证页面 → 重定向到 dashboard
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone()
    const redirectParam = request.nextUrl.searchParams.get('redirect')

    if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')) {
      const [redirectPathname, redirectSearch = ''] = redirectParam.split('?')

      // Prevent loops back to auth routes.
      if (!redirectPathname.startsWith('/auth')) {
        url.pathname = redirectPathname
        url.search = redirectSearch ? `?${redirectSearch}` : ''
        return NextResponse.redirect(url)
      }
    }

    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api).*)',
  ],
}
