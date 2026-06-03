import Link from 'next/link';

interface ShareFooterProps {
  /** Share token — when present, the contract-download disclosure is rendered. */
  token?: string;
  /** Current page title — used for the iframe's accessible label. Optional. */
  pageName?: string;
}

/**
 * The ONLY origin-trusted UI element on the share page. Everything else
 * inside the iframe runs in a sandboxed isolated origin. This footer is
 * also the branding budget for M5/M6 (per spec § 8.6).
 *
 * The footer composes against the iframe element's white background, not
 * the artifact's contents inside (iframes are opaque to the parent's
 * compositing context). We pick a mid-tone gray that reads cleanly on
 * white without needing mix-blend tricks.
 *
 * When `token` is provided the footer also renders a server-renderable
 * contract-download disclosure (no client JS required): a <details>/
 * <summary> element with three download links for the design contract files
 * produced by Task 18's /api/share/<token>/contract route.
 */
export function ShareFooter({ token, pageName: _pageName }: ShareFooterProps) {
  return (
    <div className="fixed bottom-3 right-3 z-10 flex flex-col items-end gap-1.5">
      {token && (
        <details className="text-right">
          <summary
            className="cursor-pointer select-none font-[family-name:var(--font-display)] text-[11px] italic text-[var(--color-ink-muted)] hover:underline list-none"
            aria-label="Download design contract files"
          >
            Design contract ↓
          </summary>
          <div className="mt-1 flex flex-col items-end gap-0.5 rounded border border-[var(--color-border,#e5e5e5)] bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
            <a
              href={`/api/share/${token}/contract?file=contract.md`}
              download="contract.md"
              className="font-[family-name:var(--font-display)] text-[11px] italic text-[var(--color-ink-muted)] no-underline hover:underline"
            >
              contract.md
            </a>
            <a
              href={`/api/share/${token}/contract?file=scope.md`}
              download="scope.md"
              className="font-[family-name:var(--font-display)] text-[11px] italic text-[var(--color-ink-muted)] no-underline hover:underline"
            >
              scope.md
            </a>
            <a
              href={`/api/share/${token}/contract?file=timeline.md`}
              download="timeline.md"
              className="font-[family-name:var(--font-display)] text-[11px] italic text-[var(--color-ink-muted)] no-underline hover:underline"
            >
              timeline.md
            </a>
          </div>
        </details>
      )}
      <Link
        href="/"
        className="font-[family-name:var(--font-display)] text-[12px] italic no-underline text-[var(--color-ink-muted)] hover:underline"
      >
        Made with Frame Bucket ↗
      </Link>
    </div>
  );
}
