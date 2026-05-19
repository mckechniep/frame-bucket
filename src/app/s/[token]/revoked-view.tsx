interface RevokedViewProps {
  name: string;
  revokedAt?: string;
  reason?: 'missing';
}

/**
 * Shown when:
 *   - share.revokedAt is set (recipient sees the canonical "removed" copy)
 *   - share exists but the underlying artifact is gone (reason='missing')
 *
 * The `name` prop is intentionally NOT rendered to the recipient — the
 * share name is an author-side label and may contain context (e.g. client
 * names, internal references) that shouldn't leak. Accepting it lets us
 * use it for the page title or logging without forcing rendering changes.
 */
export function RevokedView({ reason }: RevokedViewProps) {
  const message =
    reason === 'missing'
      ? 'This preview is no longer available.'
      : 'This preview was removed by the person who shared it.';

  return (
    <main className="grid h-screen w-screen place-items-center bg-[var(--color-surface)]">
      <p className="max-w-md px-6 text-center text-[var(--text-lg)] text-[var(--color-ink-muted)]">
        {message}
      </p>
    </main>
  );
}
