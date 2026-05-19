import Link from 'next/link';

/**
 * The ONLY origin-trusted UI element on the share page. Everything else
 * inside the iframe runs in a sandboxed isolated origin. This footer is
 * also the entire branding budget for M5 (per spec § 8.6).
 *
 * mix-blend-mode: difference keeps the text readable over both light
 * artifacts (becomes near-black) and dark artifacts (becomes near-white)
 * without per-artifact configuration.
 */
export function ShareFooter() {
  return (
    <Link
      href="/"
      className="fixed bottom-3 right-3 z-10 text-[12px] italic no-underline hover:underline"
      style={{
        fontFamily: 'var(--font-fraunces, serif)',
        color: 'oklch(80% 0 0)',
        mixBlendMode: 'difference',
      }}
    >
      Made with Frame Bucket ↗
    </Link>
  );
}
