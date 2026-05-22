import { defaultShareStore } from '@/lib/shares/share-store-factory';
import { SharesTable } from './_components/shares-table';

export const runtime = 'nodejs';

// Author tool — must reflect the latest state on every `router.refresh()`
// from the child client components. Without this, Next 16 may statically
// cache the page (no dynamic functions are used here otherwise).
export const dynamic = 'force-dynamic';

export default async function SharesPage() {
  const shares = await defaultShareStore().list();

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-[var(--space-8)] px-[var(--space-6)] py-[var(--space-12)]">
      <header className="flex flex-col gap-[var(--space-2)]">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)] tracking-tight text-[var(--color-ink)]">
          Shares
        </h1>
        <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
          Every share link you have created. Rename or revoke any of them — revoked links show a
          “preview removed” message to recipients.
        </p>
      </header>

      <SharesTable shares={shares} />
    </main>
  );
}
