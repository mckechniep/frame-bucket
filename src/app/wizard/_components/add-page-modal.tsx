'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { deriveSlug, isValidSlug } from '@/lib/sites/slug';
import type { WizardPage } from '@/lib/wizard/store';

import { useGenerationStream } from '../_hooks/use-generation-stream';

const MIN_BRIEF_LENGTH = 10;
const MAX_BRIEF_LENGTH = 2000;

interface AddPageModalProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  existingSlugs: string[];
  onSuccess: (page: WizardPage) => void;
}

// Outer gate: ensures the inner component mounts exactly once per open cycle.
// This is the M4 Finding 2 flicker fix — replicate exactly from create-share-modal.
export function AddPageModal(props: AddPageModalProps) {
  if (!props.open) return null;
  return <AddPageModalInner {...props} />;
}

function AddPageModalInner({
  onClose,
  siteId,
  existingSlugs,
  onSuccess,
}: Omit<AddPageModalProps, 'open'>) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [brief, setBrief] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [runKey, setRunKey] = useState('');

  // Latest onClose ref — same pattern as create-share-modal (M4 Finding 2).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Open the dialog and wire Esc → onClose (via 'cancel', never 'close').
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

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugEdited) {
      setSlug(deriveSlug(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlug(value);
    setSlugEdited(true);
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  // Derive the stream request. runKey drives when the hook fires.
  const streamRequest =
    runKey && title.trim() && slug && brief.trim()
      ? { kind: 'subpage' as const, siteId, slug, title: title.trim(), brief: brief.trim() }
      : null;

  // NOTE on billable-stream abort: the outer `if(!open) return null` gate
  // unmounts this inner component when the modal closes. That unmount triggers
  // useGenerationStream's cleanup (cancelled = true + release()), which calls
  // AbortController.abort() on the in-flight fetch. The subpage endpoint
  // detects the disconnect via its own abort signal and stops billing tokens.
  const stream = useGenerationStream(streamRequest, runKey);

  const isStreaming = stream.phase === 'streaming' || stream.phase === 'images';
  const isDone = stream.phase === 'done';
  const isError = stream.phase === 'error';

  // On stream completion, call onSuccess and close.
  useEffect(() => {
    if (!isDone || !stream.artifactId) return;
    const position = existingSlugs.length;
    onSuccess({
      slug,
      title: title.trim(),
      artifactId: stream.artifactId,
      position,
    });
    onClose();
    // Intentionally not including onSuccess/onClose/slug/title in deps —
    // they're captured at effect-run time; runKey gates re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, stream.artifactId]);

  // Slug validation
  const slugIsValid = isValidSlug(slug);
  const slugIsDuplicate = slugIsValid && existingSlugs.includes(slug);
  const slugError = !slugIsValid
    ? 'Slug must start with / and use only lowercase letters, digits, and hyphens (max 40 chars).'
    : slugIsDuplicate
      ? `A page with slug "${slug}" already exists.`
      : null;

  const briefTooShort = brief.trim().length > 0 && brief.trim().length < MIN_BRIEF_LENGTH;
  const briefTooLong = brief.length > MAX_BRIEF_LENGTH;

  const canSubmit =
    title.trim().length > 0 &&
    slugIsValid &&
    !slugIsDuplicate &&
    brief.trim().length >= MIN_BRIEF_LENGTH &&
    !briefTooLong &&
    !isStreaming;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setRunKey(`subpage:${siteId}:${slug}:${Date.now()}`);
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="m-auto w-[min(540px,90vw)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-ink)] backdrop:bg-[color-mix(in_oklch,var(--color-ink)_40%,transparent)]"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-[var(--space-5)] p-[var(--space-6)]"
      >
        <header className="flex flex-col gap-[var(--space-2)]">
          <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            New page
          </span>
          <h2 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)] font-medium tracking-tight">
            Add a page
          </h2>
          <p className="text-[var(--text-base)] leading-relaxed text-[var(--color-ink-muted)]">
            Describe the new page and Claude will generate it in the same visual style as your
            landing page.
          </p>
        </header>

        {/* Title */}
        <label className="flex flex-col gap-[var(--space-2)]">
          <span className="text-[var(--text-base)] font-medium text-[var(--color-ink)]">
            Page title
          </span>
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            disabled={isStreaming}
            placeholder="e.g. About, Services, Contact"
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-4)] py-[var(--space-3)] text-[var(--text-base)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)] disabled:opacity-60"
          />
        </label>

        {/* Slug */}
        <label className="flex flex-col gap-[var(--space-2)]">
          <span className="text-[var(--text-base)] font-medium text-[var(--color-ink)]">
            URL slug
          </span>
          <input
            type="text"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            disabled={isStreaming}
            placeholder="/about"
            className={[
              'w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-[var(--space-4)] py-[var(--space-3)] font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:ring-2 disabled:opacity-60',
              slugError
                ? 'border-[color-mix(in_oklch,oklch(55%_0.18_25)_60%,var(--color-border))] focus:border-[color-mix(in_oklch,oklch(55%_0.18_25)_60%,var(--color-border))] focus:ring-[color-mix(in_oklch,oklch(55%_0.18_25)_20%,transparent)]'
                : 'border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-[var(--color-accent-ring)]',
            ].join(' ')}
          />
          {slugError ? (
            <span
              role="alert"
              className="font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[color-mix(in_oklch,oklch(55%_0.18_25)_80%,var(--color-ink))]"
            >
              {slugError}
            </span>
          ) : null}
        </label>

        {/* Brief */}
        <label className="flex flex-col gap-[var(--space-2)]">
          <span className="text-[var(--text-base)] font-medium text-[var(--color-ink)]">
            Page brief
          </span>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            disabled={isStreaming}
            placeholder="Describe the content and purpose of this page…"
            rows={4}
            className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-4)] py-[var(--space-3)] text-[var(--text-base)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)] disabled:opacity-60"
          />
          <span
            className={[
              'font-[family-name:var(--font-mono)] text-[var(--text-base)] tabular-nums',
              briefTooLong
                ? 'text-[color-mix(in_oklch,oklch(55%_0.18_25)_80%,var(--color-ink))]'
                : 'text-[var(--color-ink-muted)]',
            ].join(' ')}
          >
            {brief.length} / {MAX_BRIEF_LENGTH}
            {briefTooShort ? ' (minimum 10 characters)' : ''}
          </span>
        </label>

        {/* Streaming status */}
        {isStreaming ? (
          <div className="flex items-center gap-[var(--space-3)]">
            <span
              aria-hidden
              className="block h-[6px] w-[6px] animate-pulse rounded-full bg-[var(--color-accent)]"
            />
            <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
              {stream.phase === 'images'
                ? `Adding images (${stream.imageCount})…`
                : 'Generating page…'}
            </p>
          </div>
        ) : null}

        {/* Error */}
        {isError && stream.error ? <ModalError message={stream.error} /> : null}

        <footer className="flex items-center justify-end gap-[var(--space-2)] border-t border-[var(--color-border)] pt-[var(--space-4)]">
          <button
            type="button"
            onClick={onClose}
            disabled={isStreaming}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-transparent px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-base)] text-[var(--color-ink-muted)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-[var(--space-5)] py-[var(--space-2)] text-[var(--text-base)] font-medium text-[var(--color-surface)] transition-transform duration-[var(--duration-fast)] hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isStreaming ? 'Generating…' : 'Generate page'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function ModalError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-sm)] border border-[color-mix(in_oklch,oklch(55%_0.18_25)_50%,var(--color-border))] bg-[color-mix(in_oklch,oklch(55%_0.18_25)_5%,transparent)] px-[var(--space-3)] py-[var(--space-2)] font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[var(--color-ink)]"
    >
      {message}
    </p>
  );
}
