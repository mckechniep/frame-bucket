import { NextResponse, type NextRequest } from 'next/server';

// TODO(M1, Task 18): real admin gate — read x-admin-secret, compare against
// env.ADMIN_SECRET (constant-time), 401 on mismatch.
// Until then the matcher is narrowed to /api/admin/* so this no-op proxy
// doesn't sit in front of the static /admin page and create a false signal.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/admin/:path*'],
};
