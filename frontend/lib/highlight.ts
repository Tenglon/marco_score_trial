/**
 * Sanitize a highlight fragment: allow only <mark> tags, escape the rest.
 * The backend wraps matches in <mark>...</mark>; all other characters must be
 * neutralized to prevent injection from archive metadata.
 */
export function sanitizeHighlight(fragment: string): string {
  return fragment
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}
