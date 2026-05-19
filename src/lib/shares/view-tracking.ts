import type { ShareStore } from './share-store';

/**
 * Regex matching common bot / unfurler User-Agents. Slack and iMessage
 * preview-fetch every shared URL — without filtering, view_count would
 * count those instead of real recipients.
 */
const BOT_UA_RE =
  /(slackbot|twitterbot|discordbot|facebookexternalhit|whatsapp|telegrambot|linkedinbot|googlebot|bingbot|duckduckbot)/i;

/**
 * 5-minute window for the throttle. Matches the bucket-aligned algorithm
 * used by both MemoryShareStore and SupabaseShareStore.
 */
const VIEW_WINDOW_MS = 5 * 60 * 1000;

/**
 * Fire-and-forget view tracking. Rule 5 (M5 spec § 7.3) requires that share
 * page rendering NEVER blocks on this — the inner async work runs without
 * being awaited by the caller, and any error is swallowed and logged.
 *
 * Callers (notably the `/s/[token]` page) MUST invoke as `void trackView(...)`
 * to make the unawaited-promise pattern explicit at the call site.
 */
export function trackView(store: ShareStore, token: string, headers: Headers): Promise<void> {
  void doTrack(store, token, headers);
  return Promise.resolve();
}

async function doTrack(store: ShareStore, token: string, headers: Headers): Promise<void> {
  try {
    const ua = headers.get('user-agent') ?? '';
    if (BOT_UA_RE.test(ua)) return;
    // Chrome speculation rules use the `Purpose` header. Firefox uses `Sec-Fetch-Purpose`.
    if (headers.get('purpose') === 'prefetch') return;
    if (headers.get('sec-fetch-purpose') === 'prefetch') return;
    await store.trackViewIfNotRecent(token, VIEW_WINDOW_MS);
  } catch (err) {
    // Rule 5 — failures NEVER propagate. Log to console for now;
    // wire to a real logger in M6 when observability lands.
    console.error('[view-tracking] failed', { token, err });
  }
}

/** Exposed for tests only. */
export const _internals = { BOT_UA_RE, VIEW_WINDOW_MS };
