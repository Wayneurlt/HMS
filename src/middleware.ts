import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge pre-filter only: bounces requests without a session cookie to /login.
 * Real authentication and authorization happen server-side in every page/action
 * (src/lib/auth/guards.ts) — the cookie's presence is never trusted on its own.
 */
const PUBLIC = ["/login", "/setup", "/api/cron", "/api/health"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/" || PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.get("hms_session")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Let server layouts know the current path (used to enforce first-login password change).
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
