'use client';

import { useEffect, useMemo, useState } from 'react';

import { injectNav } from '@/lib/sites/nav-injector';
import { useWizardStore } from '@/lib/wizard/store';

interface PagePreviewFrameProps {
  artifactId: string;
  title?: string;
  className?: string;
}

const DEFAULT_FRAME_CLASS =
  'h-[720px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white';

type FetchState = { phase: 'loading' } | { phase: 'ready'; html: string } | { phase: 'error' };

const LOADING: FetchState = { phase: 'loading' };
const ERROR: FetchState = { phase: 'error' };

/**
 * Operator preview iframe that fetches artifact HTML and injects the current
 * site nav client-side via srcDoc.
 *
 * Nav re-injects on store changes (pages/activeSlug) without a refetch —
 * the raw HTML is cached in state; injectNav is re-computed from [html, pages,
 * activeSlug] on every render. Only a change to `artifactId` triggers a new fetch.
 *
 * Nav uses `hrefFor: () => '#'` so links are visible but inert — the operator
 * navigates via the page switcher, not by clicking preview nav links. This
 * prevents the in-iframe navigation-to-404 that real slug hrefs would cause.
 */
export function PagePreviewFrame({ artifactId, title, className }: PagePreviewFrameProps) {
  const pages = useWizardStore((s) => s.pages);
  const activeSlug = useWizardStore((s) => s.activeSlug);

  const [fetchState, setFetchState] = useState<FetchState>(LOADING);

  useEffect(() => {
    if (!artifactId) return;

    const controller = new AbortController();

    // Kick off immediately; setFetchState is called only from async callbacks
    // (or the abort handler), never synchronously in the effect body.
    fetch(`/api/artifact/${artifactId}/html`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          setFetchState(ERROR);
          return;
        }
        return res.text();
      })
      .then((text) => {
        if (text !== undefined) {
          setFetchState({ phase: 'ready', html: text });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setFetchState(ERROR);
      });

    return () => {
      // Reset to loading on cleanup so the next render shows the placeholder
      // instead of stale HTML from the previous artifact.
      setFetchState(LOADING);
      controller.abort();
    };
  }, [artifactId]);

  // Re-inject nav on every render when pages/activeSlug change.
  // injectNav is pure and returns html unchanged if markers are absent.
  const renderedHtml = useMemo(() => {
    if (fetchState.phase !== 'ready') return null;
    if (pages.length === 0) return fetchState.html;
    return injectNav(
      fetchState.html,
      pages.map((p) => ({ slug: p.slug, title: p.title, position: p.position })),
      activeSlug,
      { hrefFor: () => '#' },
    );
  }, [fetchState, pages, activeSlug]);

  const frameClass = className ?? DEFAULT_FRAME_CLASS;

  if (fetchState.phase === 'error') {
    return (
      <div
        className={frameClass}
        role="status"
        aria-label={title ?? 'Preview'}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <span className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
          Couldn&apos;t load preview
        </span>
      </div>
    );
  }

  if (!renderedHtml) {
    // Loading state — same dimensions, no layout jump
    return (
      <div
        className={frameClass}
        role="status"
        aria-label={title ? `Loading ${title}` : 'Loading preview'}
        aria-busy="true"
      />
    );
  }

  return (
    <iframe
      key={artifactId}
      srcDoc={renderedHtml}
      sandbox="allow-scripts"
      className={frameClass}
      title={title ?? 'Preview'}
    />
  );
}
