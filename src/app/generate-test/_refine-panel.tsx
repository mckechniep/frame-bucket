'use client';
import { useState } from 'react';

interface RefinePanelProps {
  roundCount: number;
  maxRounds: number;
  disabled: boolean;
  onSubmit: (feedback: string) => void;
  rateLimited: boolean;
}

export function RefinePanel({
  roundCount,
  maxRounds,
  disabled,
  onSubmit,
  rateLimited,
}: RefinePanelProps) {
  const [feedback, setFeedback] = useState('');

  if (rateLimited) {
    return (
      <div className="border border-red-500/30 rounded p-4 bg-red-500/5">
        <p className="text-sm text-red-700">
          Iteration limit reached for this generation. Start a fresh generation to continue.
        </p>
      </div>
    );
  }

  const atCap = roundCount >= maxRounds;
  const trimmedLength = feedback.trim().length;
  const validLength = trimmedLength >= 10 && trimmedLength <= 1000;

  function handleSubmit() {
    if (validLength && !disabled && !atCap) {
      onSubmit(feedback.trim());
      setFeedback('');
    }
  }

  return (
    <div className="border-t pt-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm uppercase tracking-wide opacity-70">Refine</h3>
        <span className="text-xs opacity-60">
          {atCap
            ? `${roundCount} / ${maxRounds} rounds (max reached)`
            : `${roundCount} / ${maxRounds} rounds`}
        </span>
      </div>
      {atCap && (
        <p className="text-xs text-[var(--color-ink-muted)] opacity-70">
          Maximum iteration rounds reached. Start a fresh generation to continue refining.
        </p>
      )}
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={3}
        placeholder="What should the model fix or change in the next iteration?"
        disabled={disabled || atCap}
        maxLength={1000}
        className="w-full border border-[var(--color-border)] rounded p-2 text-sm disabled:opacity-50"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs opacity-60">{trimmedLength} / 1000 chars (10 min)</span>
        <button
          onClick={handleSubmit}
          disabled={disabled || atCap || !validLength}
          className="px-4 py-2 bg-[var(--color-ink)] text-[var(--color-surface)] rounded disabled:opacity-50"
        >
          {disabled ? 'Streaming…' : 'Iterate'}
        </button>
      </div>
    </div>
  );
}
