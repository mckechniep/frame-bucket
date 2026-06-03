/** Reduce a site name to a safe Content-Disposition filename fragment.
 *  Lowercases, collapses non-alphanumeric runs to single dashes, trims
 *  leading/trailing dashes. Falls back to 'site' if nothing remains
 *  (e.g. an all-symbol or all-non-ASCII name). */
export function sanitizeName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'site';
}
