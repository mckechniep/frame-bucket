import { defaultShareStore } from '@/lib/shares/share-store-factory';
import { defaultSiteStore } from '@/lib/sites/site-store-factory';
import { SharesTable } from './_components/shares-table';

export const runtime = 'nodejs';

// Author tool -- must reflect the latest state on every `router.refresh()`
// from the child client components. Without this, Next 16 may statically
// cache the page (no dynamic functions are used here otherwise).
export const dynamic = 'force-dynamic';

export default async function SharesPage() {
  const shares = await defaultShareStore().list();

  // Fetch site names for all unique siteIds referenced by the shares so
  // each row can display the site name without an extra client-side fetch.
  const uniqueSiteIds = [...new Set(shares.map((s) => s.siteId))];
  const siteStore = defaultSiteStore();
  const siteResults = await Promise.all(uniqueSiteIds.map((id) => siteStore.getSite(id)));
  const siteNames: Record<string, string> = {};
  for (let i = 0; i < uniqueSiteIds.length; i++) {
    const id = uniqueSiteIds[i]!;
    const record = siteResults[i];
    siteNames[id] = record?.name ?? `Site ...${id.slice(-6)}`;
  }

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-[var(--space-12)] px-[var(--space-6)] py-[var(--space-12)]">
      {/* Editorial page-opener: mono eyebrow + serif title + lede,
          rule below as spatial transition into the table. The kicker
          establishes section even though /shares is its own page --
          it gives /shares a stable visual signature you can recognise
          across the app. */}
      <header className="flex flex-col gap-[var(--space-3)] border-b border-[var(--color-border)] pb-[var(--space-8)]">
        <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          Manage
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)] font-medium tracking-tight text-[var(--color-ink)]">
          Shares
        </h1>
        <p className="max-w-[60ch] text-[var(--text-base)] leading-relaxed text-[var(--color-ink-muted)]">
          Every share link you have created. Rename or revoke any of them -- revoked links show a
          &ldquo;preview removed&rdquo; message to recipients.
        </p>
      </header>

      <SharesTable shares={shares} siteNames={siteNames} />
    </main>
  );
}
