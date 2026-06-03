'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

const MAX_NAME_LENGTH = 120;

interface CreateShareModalProps {
  open: boolean;
  onClose: () => void;
  /** The site to create a share for. Required for create mode; unused in rename mode. */
  siteId: string | null;
  defaultName: string;
  editingToken?: string;
  onSuccess?: () => void;
}

interface CreateResponse {
  token: string;
  url: string;
  name: string;
  createdAt: string;
}

interface ErrorBody {
  ok?: false;
  error?: { code: string; message: string };
}

export function CreateShareModal(props: CreateShareModalProps) {
  // Gate at the outer boundary so the inner component's mount-effect (with
  // empty deps) runs exactly once per open cycle. See checkpoint-name-modal
  // for the M4 Finding 2 background.
  if (!props.open) return null;
  return <CreateShareModalInner {...props} />;
}

function CreateShareModalInner({
  onClose,
  siteId,
  defaultName,
  editingToken,
  onSuccess,
}: Omit<CreateShareModalProps, 'open'>) {
  const isRename = Boolean(editingToken);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  // Latest onClose without including it in the open/close effect's deps —
  // see checkpoint-name-modal.tsx for the StrictMode flicker background.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // Listen for 'cancel' (Esc only), never 'close' — see M4 Finding 2.
    const handleCancel = () => onCloseRef.current();
    dialog.addEventListener('cancel', handleCancel);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      if (dialog.open) dialog.close();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
      setError(`Name must be between 1 and ${MAX_NAME_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (isRename && editingToken) {
        const res = await fetch(`/api/share/${editingToken}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as ErrorBody;
          throw new Error(body.error?.message ?? `Request failed (${res.status})`);
        }
        onSuccess?.();
        onClose();
      } else {
        // Belt-and-suspenders: the submit button is already disabled when
        // siteId is null, but guard here too for a friendlier error than
        // a raw Zod 400 from the API.
        if (!siteId) {
          setError('No site yet — generate a page first.');
          return;
        }
        const res = await fetch('/api/share', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ siteId, name: trimmed }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as ErrorBody;
          throw new Error(body.error?.message ?? `Request failed (${res.status})`);
        }
        const data = (await res.json()) as CreateResponse;
        setCreatedUrl(data.url);
        onSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setError('Could not copy to clipboard. Select and copy manually.');
    }
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="m-auto w-[min(480px,90vw)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-ink)] backdrop:bg-[color-mix(in_oklch,var(--color-ink)_40%,transparent)]"
    >
      {createdUrl ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col gap-[var(--space-5)] p-[var(--space-6)]"
        >
          <header className="flex flex-col gap-[var(--space-2)]">
            <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              Created
            </span>
            <h2 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)] font-medium tracking-tight">
              Share link created
            </h2>
            <p className="text-[var(--text-base)] leading-relaxed text-[var(--color-ink-muted)]">
              Anyone with this link can view the artifact. Revoke it any time from /shares.
            </p>
          </header>

          <div className="flex items-stretch gap-[var(--space-2)]">
            <input
              type="text"
              readOnly
              value={createdUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-[var(--space-3)] py-[var(--space-2)] font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[var(--color-ink)]"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-transparent px-[var(--space-4)] py-[var(--space-2)] text-[var(--text-base)] font-medium text-[var(--color-ink)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-ink-muted)] hover:bg-[var(--color-surface-alt)]"
            >
              {copyState === 'copied' ? 'Copied' : 'Copy'}
            </button>
          </div>

          {error ? <ModalError message={error} /> : null}

          <footer className="flex items-center justify-end gap-[var(--space-2)] border-t border-[var(--color-border)] pt-[var(--space-4)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-[var(--space-5)] py-[var(--space-2)] text-[var(--text-base)] font-medium text-[var(--color-surface)] transition-transform duration-[var(--duration-fast)] hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
            >
              Done
            </button>
          </footer>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col gap-[var(--space-5)] p-[var(--space-6)]"
        >
          <header className="flex flex-col gap-[var(--space-2)]">
            <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              {isRename ? 'Rename' : 'New share'}
            </span>
            <h2 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)] font-medium tracking-tight">
              {isRename ? 'Rename share' : 'Create share link'}
            </h2>
            <p className="text-[var(--text-base)] leading-relaxed text-[var(--color-ink-muted)]">
              {isRename
                ? 'Update the name shown in /shares. The URL does not change.'
                : 'A private link that anyone you send it to can view. You can revoke it later.'}
            </p>
          </header>

          <label className="flex flex-col gap-[var(--space-2)]">
            <span className="text-[var(--text-base)] font-medium text-[var(--color-ink)]">
              Name
            </span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              disabled={submitting}
              placeholder="e.g. Hex Records — round 3"
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-4)] py-[var(--space-3)] text-[var(--text-base)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)] disabled:opacity-60"
            />
            <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] tabular-nums text-[var(--color-ink-muted)]">
              {name.length} / {MAX_NAME_LENGTH}
            </span>
          </label>

          {error ? <ModalError message={error} /> : null}

          <footer className="flex items-center justify-end gap-[var(--space-2)] border-t border-[var(--color-border)] pt-[var(--space-4)]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-transparent px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-base)] text-[var(--color-ink-muted)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || name.trim().length === 0}
              className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-[var(--space-5)] py-[var(--space-2)] text-[var(--text-base)] font-medium text-[var(--color-surface)] transition-transform duration-[var(--duration-fast)] hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? isRename
                  ? 'Saving…'
                  : 'Creating…'
                : isRename
                  ? 'Save'
                  : 'Create share'}
            </button>
          </footer>
        </form>
      )}
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
