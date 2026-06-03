'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ShareRecord } from '@/lib/shares/share-store';
import { CreateShareModal } from '@/app/wizard/_components/create-share-modal';

import { RevokeConfirm } from './revoke-confirm';

interface ShareRowProps {
  share: ShareRecord;
  siteName: string;
}

export function ShareRow({ share, siteName }: ShareRowProps) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const isRevoked = Boolean(share.revokedAt);
  const tokenFragment = share.token.slice(-4);

  async function handleCopy() {
    // Build URL on click instead of at render — avoids any SSR/client URL
    // mismatch and lets the copied link follow whatever host the author is
    // currently on (localhost, preview deploy, prod).
    const url = `${window.location.origin}/s/${share.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2500);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    setRevokeError(null);
    try {
      const res = await fetch(`/api/share/${share.token}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `Request failed (${res.status})`);
      }
      setConfirmingRevoke(false);
      router.refresh();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : 'Could not revoke share.');
    } finally {
      setRevoking(false);
    }
  }

  return (
    <li
      className={[
        'rounded-[var(--radius-md)] border bg-[var(--color-surface)] transition-colors duration-[var(--duration-fast)]',
        isRevoked
          ? 'border-[var(--color-border)] bg-[var(--color-surface-alt)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-ink-muted)]',
      ].join(' ')}
    >
      <div className="grid grid-cols-[1fr_auto] gap-x-[var(--space-6)] gap-y-[var(--space-2)] p-[var(--space-4)] sm:grid-cols-[2fr_auto_auto_auto_auto] sm:items-center">
        {/* Name + token fragment + copy */}
        <div className="flex min-w-0 flex-col gap-[var(--space-1)]">
          <span
            className={[
              'truncate font-[family-name:var(--font-display)] text-[var(--text-lg)] tracking-tight',
              isRevoked ? 'text-[var(--color-ink-muted)]' : 'text-[var(--color-ink)]',
            ].join(' ')}
          >
            {share.name}
          </span>
          <p className="font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
            {siteName} &middot;{' '}
            {share.pages.length === 1 ? '1 page' : `${share.pages.length} pages`}
          </p>
          <div className="flex items-center gap-[var(--space-2)] font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
            <span aria-label={`Share token ending in ${tokenFragment}`}>…{tokenFragment}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-[var(--space-2)] py-[2px] text-[var(--text-base)] tabular-nums text-[var(--color-ink-muted)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
            >
              {copyState === 'copied'
                ? 'Copied'
                : copyState === 'error'
                  ? 'Copy failed'
                  : 'Copy link'}
            </button>
          </div>
        </div>

        {/* Created (relative) */}
        <Field label="Created">
          <RelativeTime iso={share.createdAt} />
        </Field>

        {/* View count */}
        <Field label="Views">
          <span className="font-[family-name:var(--font-mono)] tabular-nums">
            {share.viewCount}
          </span>
        </Field>

        {/* Last viewed / Revoked timestamp */}
        <Field label={isRevoked ? 'Revoked' : 'Last viewed'}>
          {isRevoked && share.revokedAt ? (
            <RelativeTime iso={share.revokedAt} />
          ) : share.lastViewedAt ? (
            <RelativeTime iso={share.lastViewedAt} />
          ) : (
            <span className="font-[family-name:var(--font-mono)] tabular-nums text-[var(--color-ink-muted)]">
              —
            </span>
          )}
        </Field>

        {/* Actions */}
        <div className="col-span-2 flex items-center justify-end gap-[var(--space-3)] sm:col-span-1">
          {confirmingRevoke ? (
            <RevokeConfirm
              busy={revoking}
              error={revokeError}
              onConfirm={handleRevoke}
              onCancel={() => {
                setConfirmingRevoke(false);
                setRevokeError(null);
              }}
            />
          ) : isRevoked ? null : (
            <>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="text-[var(--text-base)] text-[var(--color-ink-muted)] underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-ink)] hover:underline"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRevoke(true)}
                className="text-[var(--text-base)] text-[var(--color-ink-muted)] underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-ink)] hover:underline"
              >
                Revoke
              </button>
            </>
          )}
        </div>
      </div>

      <CreateShareModal
        open={renaming}
        onClose={() => setRenaming(false)}
        siteId={share.siteId}
        defaultName={share.name}
        editingToken={share.token}
        onSuccess={() => router.refresh()}
      />
    </li>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[var(--text-base)] text-[var(--color-ink-muted)] sm:hidden">
        {label}
      </span>
      <span className="text-[var(--text-base)] text-[var(--color-ink)]">{children}</span>
    </div>
  );
}

interface RelativeTimeProps {
  iso: string;
}

function RelativeTime({ iso }: RelativeTimeProps) {
  // suppressHydrationWarning: server renders with server's `Date.now()`,
  // client hydrates with client's. They differ by sub-second; at our
  // displayed granularity (minutes+) they almost always agree, but React
  // would still warn on the rare boundary case.
  return (
    <time
      dateTime={iso}
      title={new Date(iso).toLocaleString()}
      suppressHydrationWarning
      className="font-[family-name:var(--font-mono)] tabular-nums"
    >
      {formatRelativeTime(iso)}
    </time>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
