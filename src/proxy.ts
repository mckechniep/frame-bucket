import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/admin')) {
    const provided =
      request.headers.get('x-admin-secret') ?? request.cookies.get('fb_admin')?.value;
    const expected = process.env.ADMIN_SECRET;
    if (!expected || provided !== expected) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/admin/:path*'],
};
