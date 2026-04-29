import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="mb-4 text-[var(--text-3xl)] font-semibold">Frame Bucket</h1>
      <p className="mb-8 max-w-md text-center text-[var(--text-base)] text-[var(--color-ink-muted)]">
        Build a site from a layered design recipe.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/wizard/brief"
          className="rounded-[var(--radius-md)] border border-current px-6 py-3 transition hover:bg-[var(--color-ink)] hover:text-[var(--color-surface)]"
        >
          Start a new design
        </Link>
        <Link href="/admin" className="px-3 py-2 text-sm underline opacity-70">
          Admin
        </Link>
      </div>
    </main>
  );
}
