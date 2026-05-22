'use client';

interface RevokeConfirmProps {
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Inline confirmation that replaces a row's action buttons when the author
 * clicks Revoke. Kept inline (not a modal) so the row's context stays in
 * view — the author is reading the row to decide whether to revoke it.
 */
export function RevokeConfirm({ busy, error, onConfirm, onCancel }: RevokeConfirmProps) {
  return (
    <div
      role="group"
      aria-label="Confirm revoke"
      className="flex flex-col items-end gap-[var(--space-1)]"
    >
      <div className="flex items-center gap-[var(--space-3)]">
        <span className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
          Recipients will see “preview removed”.
        </span>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-[var(--radius-sm)] border border-[color-mix(in_oklch,oklch(55%_0.18_25)_50%,var(--color-border))] bg-[color-mix(in_oklch,oklch(55%_0.18_25)_8%,transparent)] px-[var(--space-3)] py-[2px] text-[var(--text-base)] font-medium text-[var(--color-ink)] transition-transform duration-[var(--duration-fast)] hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Revoking…' : 'Confirm revoke'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-[var(--text-base)] text-[var(--color-ink-muted)] underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-ink)] hover:underline disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <span
          role="alert"
          className="font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[color-mix(in_oklch,oklch(45%_0.18_25)_70%,var(--color-ink))]"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
