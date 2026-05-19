import Link from 'next/link';

/**
 * The ONLY origin-trusted UI element on the share page. Everything else
 * inside the iframe runs in a sandboxed isolated origin. This footer is
 * also the entire branding budget for M5 (per spec § 8.6).
 *
 * The footer composes against the iframe element's white background, not
 * the artifact's contents inside (iframes are opaque to the parent's
 * compositing context). We pick a mid-tone gray that reads cleanly on
 * white without needing mix-blend tricks. If contrast becomes a real
 * problem against unusual artifact backgrounds, M7 can revisit.
 */
export function ShareFooter() {
  return (
    <Link
      href="/"
      className="fixed bottom-3 right-3 z-10 font-[family-name:var(--font-display)] text-[12px] italic no-underline text-[var(--color-ink-muted)] hover:underline"
    >
      Made with Frame Bucket ↗
    </Link>
  );
}
