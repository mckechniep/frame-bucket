/** Matches "/" or "/lowercase-and-digits". Max total length 40. */
export const SLUG_REGEX = /^\/[a-z0-9-]*$/;

/** Slugs that collide with app routes and can never be page slugs. */
export const RESERVED_SLUGS = ['/api', '/s', '/admin', '/shares', '/wizard', '/preview'];

/**
 * Derives a URL slug from a title string.
 * - Lowercase the title
 * - Replace every run of non-alphanumeric characters with a single hyphen
 * - Trim leading/trailing hyphens
 * - Prefix with `/`
 * - Truncate to 40 chars total (removing trailing hyphens after truncation)
 * - If result is just `/` (empty after cleaning) → return `/page`
 * - If result is a reserved slug, append `-page` (e.g., `/shares` → `/shares-page`)
 *
 * Note: All RESERVED_SLUGS are short (max 8 chars), so appending `-page` (5 chars)
 * will never exceed 40 chars total, thus no re-truncation is needed.
 */
export function deriveSlug(title: string): string {
  // 1. Lowercase and replace non-alphanumeric runs with single hyphen
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens

  // 2. If empty after cleaning, return /page
  if (!cleaned) {
    return '/page';
  }

  // 3. Prefix with / and truncate to 40 chars
  let slug = '/' + cleaned;

  if (slug.length > 40) {
    slug = slug.slice(0, 40);
    // Remove trailing hyphen if truncation left one
    slug = slug.replace(/-+$/, '');
  }

  // 4. If result is a reserved slug, append -page to make it valid
  if (RESERVED_SLUGS.includes(slug)) {
    slug = slug + '-page';
  }

  return slug;
}

/**
 * Type guard: validates that the input is a valid page slug.
 * - Must be a string
 * - Must match SLUG_REGEX (starts with /, only [a-z0-9-])
 * - Must be <= 40 chars
 * - Must not be a reserved slug exactly
 * - Must not start with a reserved slug prefix + "/"
 */
export function isValidSlug(s: unknown): s is string {
  // Type check
  if (typeof s !== 'string') {
    return false;
  }

  // Empty string check
  if (s.length === 0) {
    return false;
  }

  // Length check
  if (s.length > 40) {
    return false;
  }

  // Regex check (matches "/" or "/lowercase-and-digits")
  if (!SLUG_REGEX.test(s)) {
    return false;
  }

  // Reserved slug check (exact match)
  if (RESERVED_SLUGS.includes(s)) {
    return false;
  }

  // Reserved prefix check (e.g., /api/something, /s/foo)
  for (const reserved of RESERVED_SLUGS) {
    if (s.startsWith(reserved + '/')) {
      return false;
    }
  }

  return true;
}
