import { cookies } from 'next/headers';
import { AdminLogin } from './login';
import { AdminSyncPanel } from './sync-panel';

export default async function AdminPage() {
  const jar = await cookies();
  const token = jar.get('fb_admin')?.value;

  if (!token || token !== process.env.ADMIN_SECRET) {
    return (
      <main className="p-8">
        <h2 className="text-[var(--text-xl)] mb-4">Admin access</h2>
        <AdminLogin />
      </main>
    );
  }

  return (
    <main className="p-8">
      <h2 className="text-[var(--text-xl)] mb-4">Taxonomy sync</h2>
      <AdminSyncPanel adminToken={token} />
    </main>
  );
}
