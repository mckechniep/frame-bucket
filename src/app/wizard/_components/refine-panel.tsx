'use client';

import { useState } from 'react';

interface RefinePanelProps {
  /** How many iteration rounds have completed (round 0 + each iterate). */
  roundCount: number;
  /** Maximum allowed iterations beyond round 0. After this, the panel locks. */
  maxRounds: number;
  /** True while a stream is in flight — hides the input behind a disabled state. */
  disabled: boolean;
  /** True when the server returned 429 — replaces the input with a cap message. */
  rateLimited: boolean;
  /** Called with trimmed feedback when the user submits a valid iteration. */
  onSubmit: (feedback: string) => void;
}

const MIN = 10;
const MAX = 1000;

export function RefinePanel({
  roundCount,
  maxRounds,
  disabled,
  rateLimited,
  onSubmit,
}: RefinePanelProps) {
  const [feedback, setFeedback] = useState('');

  if (rateLimited) {
    return (
      <CapMessage>
        Iteration limit reached for this generation. Start a fresh generation to keep refining.
      </CapMessage>
    );
  }

  const atCap = roundCount >= maxRounds;
  const trimmedLength = feedback.trim().length;
  const validLength = trimmedLength >= MIN && trimmedLength <= MAX;
  const remainingRounds = Math.max(0, maxRounds - roundCount);

  function handleSubmit() {
    if (!validLength || disabled || atCap) return;
    onSubmit(feedback.trim());
    setFeedback('');
  }

  return (
    <section
      aria-label="Refine the current generation"
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-6)]"
    >
      <header className="mb-[var(--space-4)] flex items-baseline justify-between gap-[var(--space-4)]">
        <h2 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)] tracking-tight">
          Refine
        </h2>
        <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] tabular-nums text-[var(--color-ink-muted)]">
          {roundCount} / {maxRounds}
        </span>
      </header>

      {atCap ? (
        <CapMessage>
          You&rsquo;ve used every iteration on this generation. Start a fresh generation to keep
          refining.
        </CapMessage>
      ) : (
        <>
          <p className="mb-[var(--space-3)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
            What should the next round change? Specific structural feedback — what to move, what to
            cut, what to emphasize — works best.
            {remainingRounds === 1 ? ' One iteration left.' : ` ${remainingRounds} left.`}
          </p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            placeholder="Pull the hero copy tighter; the second section needs a hero image, not a paragraph."
            disabled={disabled}
            maxLength={MAX}
            className={[
              'w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)]',
              'px-[var(--space-4)] py-[var(--space-3)]',
              'text-[var(--text-base)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]',
              'transition-colors duration-[var(--duration-fast)]',
              'border-[var(--color-border)] hover:border-[var(--color-ink-muted)]',
              'focus:outline-none focus:border-[var(--color-accent)]',
              'focus:ring-2 focus:ring-[color-mix(in_oklch,var(--color-accent)_30%,transparent)]',
              'disabled:opacity-60',
            ].join(' ')}
          />
          <div className="mt-[var(--space-3)] flex items-center justify-between gap-[var(--space-4)]">
            <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] tabular-nums text-[var(--color-ink-muted)]">
              {trimmedLength} / {MAX}
              {trimmedLength < MIN ? ` · ${MIN - trimmedLength} more to submit` : ''}
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled || !validLength}
              className={[
                'inline-flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)]',
                'px-[var(--space-5)] py-[var(--space-2)]',
                'text-[var(--text-base)] font-medium',
                'transition-transform duration-[var(--duration-fast)]',
                disabled || !validLength
                  ? 'cursor-not-allowed bg-[var(--color-border)] text-[var(--color-ink-muted)]'
                  : 'bg-[var(--color-accent)] text-[var(--color-surface)] hover:-translate-y-px',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-[var(--color-ink)]',
              ].join(' ')}
            >
              {disabled ? 'Iterating…' : 'Iterate'}
              {!disabled ? <span aria-hidden>→</span> : null}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function CapMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-[var(--space-4)]">
      <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">{children}</p>
    </div>
  );
}
