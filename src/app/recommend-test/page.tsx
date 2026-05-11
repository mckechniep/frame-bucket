import { defaultFileStore } from '@/lib/taxonomy/file-store';
import { RecommendTestForm } from './_form';

export default async function RecommendTestPage() {
  const store = defaultFileStore();
  const taxonomy = await store.get();
  if (!taxonomy) {
    return (
      <main className="p-8">
        <h1 className="text-[var(--text-2xl)] mb-4">Recommend Test Harness</h1>
        <p>
          No taxonomy cached. Sync from <code>/admin</code> first.
        </p>
      </main>
    );
  }
  return (
    <main className="p-8 max-w-[1400px] mx-auto">
      <h1 className="text-[var(--text-2xl)] mb-6">Recommend Test Harness</h1>
      <RecommendTestForm taxonomy={taxonomy} />
    </main>
  );
}
