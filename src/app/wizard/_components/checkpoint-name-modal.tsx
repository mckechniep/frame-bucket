'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { useWizardStore, type WizardRound } from '@/lib/wizard/store';

const MAX_NAME_LENGTH = 40;

interface CheckpointNameModalProps {
  round: WizardRound;
  onClose: () => void;
}

export function CheckpointNameModal({ round, onClose }: CheckpointNameModalProps) {
  const setCheckpointName = useWizardStore((s) => s.setCheckpointName);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [name, setName] = useState(round.checkpointName ?? '');

  // Keep the latest onClose accessible without including it in the open/close
  // effect's deps. If we put `onClose` in deps, a new arrow function from the
  // parent (which is the common case — `onClose={() => set...}`) would re-fire
  // the effect, close the dialog, and reopen it, producing a visible flicker.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // The <dialog> element is opened imperatively via showModal() so we get
  // backdrop dimming, focus trapping, and Esc-to-close for free. We listen
  // to the 'cancel' event (Esc key on modal) — NOT 'close' — because 'close'
  // fires on every dialog.close() including the cleanup's own teardown, and
  // in StrictMode dev a queued 'close' from cleanup gets caught by the
  // remount's freshly-attached listener, producing a flash-open-then-shut
  // bug. 'cancel' fires only on user intent.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const handleCancel = () => onCloseRef.current();
    dialog.addEventListener('cancel', handleCancel);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      if (dialog.open) dialog.close();
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
    setCheckpointName(round.artifactId, trimmed.length > 0 ? trimmed : undefined);
    onClose();
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    // The dialog element receives clicks both on its content and on its
    // backdrop pseudo-element. The backdrop click target is the dialog
    // itself; clicks inside content stop here via the form's stopPropagation.
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="m-auto w-[min(420px,90vw)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-ink)] backdrop:bg-[color-mix(in_oklch,var(--color-ink)_40%,transparent)]"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-[var(--space-4)] p-[var(--space-6)]"
      >
        <header>
          <h2 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)] tracking-tight">
            Name this checkpoint
          </h2>
          <p className="mt-[var(--space-2)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
            Short label so you remember why this round mattered. Leave it empty to clear an existing
            name.
          </p>
        </header>

        <label className="flex flex-col gap-[var(--space-2)]">
          <span className="text-[var(--text-base)] font-medium text-[var(--color-ink)]">Label</span>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="e.g. warm palette landed"
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-4)] py-[var(--space-3)] text-[var(--text-base)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--color-accent)_30%,transparent)]"
          />
          <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] tabular-nums text-[var(--color-ink-muted)]">
            {name.length} / {MAX_NAME_LENGTH}
          </span>
        </label>

        <footer className="flex items-center justify-end gap-[var(--space-3)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-md)] px-[var(--space-4)] py-[var(--space-2)] text-[var(--text-base)] text-[var(--color-ink-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-[var(--radius-md)] bg-[var(--color-ink)] px-[var(--space-5)] py-[var(--space-2)] text-[var(--text-base)] font-medium text-[var(--color-surface)] transition-transform duration-[var(--duration-fast)] hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Save
          </button>
        </footer>
      </form>
    </dialog>
  );
}
