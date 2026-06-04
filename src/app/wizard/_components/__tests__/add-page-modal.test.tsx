// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { __resetDedupedRequestCache } from '@/lib/wizard/deduped-request';

import { AddPageModal } from '../add-page-modal';

// ── jsdom lacks a real <dialog> implementation: showModal/close throw.
// Polyfill them so the modal's open/cleanup effects don't blow up.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

/**
 * Builds a Response-like object whose body streams the given SSE frames.
 * Mirrors the wire shape of /api/site/[siteId]/page exactly:
 *   event: <name>\ndata: <json>\n\n
 */
function sseResponse(frames: Array<{ event: string; data: unknown }>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) {
        controller.enqueue(
          encoder.encode(`event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`),
        );
      }
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText('e.g. About, Services, Contact'), {
    target: { value: 'About' },
  });
  fireEvent.change(screen.getByPlaceholderText('Describe the content and purpose of this page…'), {
    target: { value: 'The about page for our company.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /generate page/i }));
}

const DONE_FRAMES = [
  { event: 'delta', data: { text: '<html><body>About</body></html>' } },
  {
    event: 'done',
    data: {
      artifactId: 'art-about-123',
      slug: '/about',
      cost: 0.12,
      usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0 },
      html: '<html><body>About</body></html>',
    },
  },
];

afterEach(() => {
  cleanup();
  __resetDedupedRequestCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AddPageModal — generated-page result delivery', () => {
  beforeEach(() => {
    __resetDedupedRequestCache();
  });

  it('calls onSuccess with the generated artifact when the subpage stream completes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(DONE_FRAMES)));
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AddPageModal
        open
        onClose={onClose}
        siteId="site-test"
        existingSlugs={[]}
        nextPosition={1}
        onSuccess={onSuccess}
      />,
    );
    fillAndSubmit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledWith({
      slug: '/about',
      title: 'About',
      artifactId: 'art-about-123',
      position: 1,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('fires the subpage request exactly once under StrictMode (no dupes, no misses)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(DONE_FRAMES));
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();

    render(
      <StrictMode>
        <AddPageModal
          open
          onClose={vi.fn()}
          siteId="site-test"
          existingSlugs={[]}
          nextPosition={1}
          onSuccess={onSuccess}
        />
      </StrictMode>,
    );
    fillAndSubmit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still delivers the result when the stream includes an image phase', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            { event: 'images_started', data: { count: 2 } },
            { event: 'images_done', data: { count: 2 } },
            ...DONE_FRAMES,
          ]),
        ),
    );
    const onSuccess = vi.fn();

    render(
      <AddPageModal
        open
        onClose={vi.fn()}
        siteId="site-test"
        existingSlugs={[]}
        nextPosition={1}
        onSuccess={onSuccess}
      />,
    );
    fillAndSubmit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('SILENT-FAILURE PROBE: done event without artifactId — what does the user see?', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { event: 'delta', data: { text: '<html></html>' } },
          // Server reached done but omitted artifactId (e.g. a save-path bug).
          { event: 'done', data: { slug: '/about', html: '<html></html>' } },
        ]),
      ),
    );
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AddPageModal
        open
        onClose={onClose}
        siteId="site-test"
        existingSlugs={[]}
        nextPosition={1}
        onSuccess={onSuccess}
      />,
    );
    fillAndSubmit();

    // Give the stream time to settle.
    await new Promise((r) => setTimeout(r, 50));

    // Document the actual behavior: onSuccess gated out, modal neither closes
    // nor shows an error — a silent dead-end ("fires but no result").
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    // The submit button is re-enabled (not streaming) but nothing happened.
    const btn = screen.getByRole('button', { name: /generate page/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('surfaces a server error event in the modal', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([{ event: 'error', data: { error: 'MARKERS_MISSING: try again' } }]),
        ),
    );
    const onSuccess = vi.fn();

    render(
      <AddPageModal
        open
        onClose={vi.fn()}
        siteId="site-test"
        existingSlugs={[]}
        nextPosition={1}
        onSuccess={onSuccess}
      />,
    );
    fillAndSubmit();

    await waitFor(() => expect(screen.getByText(/MARKERS_MISSING/i)).toBeTruthy());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
