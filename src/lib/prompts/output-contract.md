# Generation Output Contract

You are producing a single self-contained HTML file. Every rule below is mandatory unless explicitly overridden by the aesthetic-specific canon. When a rule below conflicts with an aesthetic override, the override wins for that aesthetic; otherwise these rules are absolute.

## File Shape

- Emit one complete HTML document, beginning `<!DOCTYPE html>` and ending `</html>`. (→ source: spec §7.3)
- No external JavaScript dependencies. No build step. No CDN imports for behavior. (→ source: spec §7.3)
- No markdown fences, no commentary, no caveats — the response body, beginning to end, is valid HTML. (→ source: spec §7.3)

## CSS Architecture

- All styles live in a single inline `<style>` block in `<head>`. (→ source: spec §7.3)
- Define design tokens as CSS custom properties under `:root`. Token categories: color, typography (sizes, weights, line-heights, families), spacing scale, radii, motion (durations, easings). No hard-coded values outside `:root`. (→ source: rules/web/coding-style.md, design-systems:design-token)
- Modular sizing via `clamp()` for type and section spacing. Mobile-first; `clamp(min, fluid, max)` form. (→ source: rules/web/coding-style.md)
- Spacing scale derives from a 4px or 8px base unit. Consistent rhythm; no ad-hoc values. (→ source: ui-design:spacing-system)

## JavaScript

- Inline `<script>` only when interactivity is demanded by the recipe (e.g., a tab component, a scroll-triggered reveal). (→ source: spec §7.3)
- Vanilla JS only. No frameworks, no CDN imports, no module bundlers. Use modern browser APIs (`IntersectionObserver`, `matchMedia`, native form controls, etc.). (→ source: spec §7.3)
- If no interactivity is required, omit the `<script>` tag entirely.

## Fonts

- Google Fonts via `<link rel="stylesheet">` in `<head>`, with `display=swap`. (→ source: rules/web/performance.md)
- Load only the weights and styles actually used in the document. Each unused weight is wasted bytes and a slower paint. (→ source: rules/web/performance.md)
- Maximum two font families unless an aesthetic explicitly calls for a third (e.g., monospace for technical aesthetics). (→ source: rules/web/performance.md)
- Pair display + body deliberately; no two-sans defaults unless the aesthetic is Swiss/grotesk. (→ source: ui-design:type-system)

## Images

- Use `https://source.unsplash.com/...` URLs (e.g., `https://source.unsplash.com/random/1600x900/?bakery`). (→ source: spec §7.3)
- Every `<img>` carries explicit `width` and `height` attributes. No exceptions. (→ source: rules/web/performance.md)
- Hero/above-the-fold image: `loading="eager"` and `fetchpriority="high"`. Exactly one. (→ source: rules/web/performance.md)
- All other images: `loading="lazy"`. (→ source: rules/web/performance.md)
- Descriptive `alt` text — what the image _is_, not "image of...". Decorative-only images use `alt=""`. (→ source: rules/web/performance.md)

## Semantic HTML

- Use `header`, `nav`, `main`, `section[aria-labelledby]`, `article`, `footer` for structural regions. Never generic `<div>` stacks for structure. (→ source: rules/web/coding-style.md)
- One `<h1>` per page. Heading hierarchy descends without skipping levels. (→ source: ui-design:visual-hierarchy)
- Form controls have `<label htmlFor="...">` linked to `id`. Buttons are `<button type="...">`. Links go to URLs; buttons trigger actions. (→ source: rules/web/coding-style.md)

## Responsive

- Mobile-first. Author the small-viewport layout first; layer up enhancements at breakpoints. (→ source: rules/web/coding-style.md)
- Breakpoints: 640px, 1024px, 1440px. Use `min-width` media queries. (→ source: spec §7.3)
- No fixed pixel widths on layout containers; use `max-width` with a `clamp()`-fluid inner. (→ source: rules/web/coding-style.md)

## Accessibility (WCAG AA floor)

- Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and non-text UI. Verify against the chosen palette. (→ source: rules/web/performance.md, ui-design:color-system)
- Visible `:focus-visible` rings on every interactive element. Never `outline: none` without a styled replacement. (→ source: interaction-design:feedback-patterns)
- Skip-to-main link as first focusable element. (→ source: rules/web/performance.md)
- `prefers-reduced-motion: reduce` media query disables all non-essential motion (parallax, autoplay, decorative loops, scroll-triggered reveals). Keep micro-feedback (focus, hover) since those are functional, not decorative. (→ source: interaction-design:animation-principles)
- All images have `alt`. All form fields have labels. All buttons have accessible names.

## Motion

- Animate `transform`, `opacity`, `clip-path`, `filter` only. Never `width`, `height`, `top`, `left`, `margin`, `padding`, `border`, `font-size`. (→ source: rules/web/coding-style.md, rules/web/performance.md)
- Durations: 150–450ms for UI interactions; longer only for hero or scroll-driven sequences. (→ source: interaction-design:animation-principles)
- Use `cubic-bezier()` easing curves with intent. `ease-out` for entrances, `ease-in` for exits, custom curves for character. Avoid `linear` and unstyled `ease`. (→ source: interaction-design:animation-principles)
- `will-change` only on elements about to animate; remove it after. Never blanket-apply. (→ source: rules/web/performance.md)

## Content Realism

- Use the brief's project name and infer plausible product, service, person, and place names from the brief's industry. (→ source: spec §7.3, designer-toolkit:ux-writing)
- Write 2–3 sentences of real-feeling body copy per section. Specific, not generic. (→ source: designer-toolkit:ux-writing)
- Never use "Lorem ipsum" or placeholder copy of any kind. The output is a portfolio-grade artifact, not a wireframe. (→ source: spec §7.3, rules/web/design-quality.md)
- Headlines are headlines, not labels. Body copy reads as if written by a human who works in that industry. (→ source: designer-toolkit:ux-writing)

## Required Qualities

The site must demonstrate at least four of these (per `rules/web/design-quality.md`):

1. Clear hierarchy through scale contrast
2. Intentional rhythm in spacing (not uniform padding everywhere)
3. Depth or layering — overlap, surfaces, or motion
4. Typography with character and a real pairing strategy
5. Color used semantically, not just decoratively
6. Designed hover, focus, and active states
7. Grid-breaking editorial or bento composition where appropriate
8. Texture, grain, or atmosphere when it fits the visual direction
9. Motion that clarifies flow rather than distracting
10. Data visualization treated as part of the design system, not an afterthought

If the recipe specifies an aesthetic that bans one of these (e.g., Swiss bans grid-breaking, Brutalist bans uniform rhythm), substitute another from the list — never drop below four total.

## Banned Defaults

The output must not look like:

- Default card grids with uniform spacing and no hierarchy. (→ source: rules/web/design-quality.md)
- A stock hero with centered headline, gradient blob, and generic CTA. (→ source: rules/web/design-quality.md)
- Unmodified library defaults (shadcn, Material UI, Bootstrap) passed off as finished design. (→ source: rules/web/design-quality.md)
- Flat layouts with no layering, depth, or motion. (→ source: rules/web/design-quality.md)
- Uniform radius, spacing, and shadows across every component. (→ source: rules/web/design-quality.md)
- Safe gray-on-white styling with one decorative accent color. (→ source: rules/web/design-quality.md)

## Output Discipline

Emit the complete HTML document and nothing else. No markdown fences, no commentary before or after, no explanations, no caveats. The response body, beginning to end, is valid HTML.
