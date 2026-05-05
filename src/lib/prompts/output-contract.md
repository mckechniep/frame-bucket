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

Images use a placeholder pattern. The pipeline post-processes your output, generating real images via OpenRouter (Gemini 2.5 Flash Image) for each `<img>` tag whose `src` begins with `OPENROUTER:`. Your job is to specify what each image _should depict_, with proper dimensions and alt text.

- **Image src is `OPENROUTER:<descriptive prompt>`**. The prompt should be a concise but specific scene description — what the image depicts, the mood, the lighting, the composition. Examples:
  - `src="OPENROUTER:A row of dark-crusted country sourdough loaves cooling on a wooden rack, dusted with flour, lit by morning window light"`
  - `src="OPENROUTER:Aerial overhead shot of an architect's drafting desk with technical pens, ruler, and a half-finished elevation drawing in soft afternoon light"`
- **Never use external image URLs** — no Unsplash, no Picsum, no Pexels, no stock-photo services. Always emit `OPENROUTER:` placeholders. (The post-processor replaces them with real generated images.)
- Every `<img>` carries explicit `width` and `height` attributes — they drive the aspect-ratio selection sent to the image model. Common useful ratios: 1600×900 (16:9 hero), 1200×900 (4:3), 1024×1024 (1:1), 900×1200 (3:4 portrait). (→ source: rules/web/performance.md)
- Hero/above-the-fold image: `loading="eager"` and `fetchpriority="high"`. Exactly one. (→ source: rules/web/performance.md)
- All other images: `loading="lazy"`. (→ source: rules/web/performance.md)
- Descriptive `alt` text — what the image _is_, not "image of...". The alt text is for accessibility; the `OPENROUTER:` src is for image generation. They serve different purposes; both should be specific. (→ source: rules/web/performance.md)
- **Background images** in CSS (`background-image: url(...)`) are not supported by the post-processor. If a section needs a background image, place an `<img>` element with `OPENROUTER:` src and use CSS to position it (`position: absolute; inset: 0; object-fit: cover;`). (→ source: rules/web/performance.md)

## Semantic HTML

- Use `header`, `nav`, `main`, `section[aria-labelledby]`, `article`, `footer` for structural regions. Never generic `<div>` stacks for structure. (→ source: rules/web/coding-style.md)
- One `<h1>` per page. Heading hierarchy descends without skipping levels. (→ source: ui-design:visual-hierarchy)
- Form controls have `<label htmlFor="...">` linked to `id`. Buttons are `<button type="...">`. Links go to URLs; buttons trigger actions. (→ source: rules/web/coding-style.md)

## Navigation

- Navigation must be usable at every viewport width. (→ source: rules/web/design-quality.md, interaction-design:feedback-patterns)
- When primary nav links don't fit at narrow viewports, **provide an alternative pattern**: hamburger menu (button → overlay or off-canvas drawer), dropdown, or condensed icon row. **Never apply `display: none` to nav links without a working replacement** — hiding navigation breaks the page. (→ source: rules/web/design-quality.md)
- Hamburger button must be a real `<button type="button">` with `aria-label` and `aria-expanded`. Toggling logic uses vanilla JS; the menu opens via class toggle plus `transform`/`opacity` animation only. (→ source: rules/web/coding-style.md)
- Skip-to-main link is the first focusable element regardless of viewport. (→ source: rules/web/performance.md)
- **Decorative nav metadata (issue numbers, founding dates, locations, taglines) needs an explicit responsive strategy.** Items like "Vol. 47", "Established 1978 · Northfield", "Issue 03 / Spring" are editorial flourishes that occupy precious nav real estate. **Never let them wrap to multiple lines** — a nav bar that becomes 2–3 lines tall at any width is a layout collision, not responsive design. The discipline by breakpoint:
  - At ≥ 1024px: full form ("Established 1978 · Northfield")
  - At 640–1024px: abbreviated form ("Est. 1978") OR hidden via `@media`
  - At < 640px: hidden entirely; the mobile nav is brand + hamburger only
    Author the abbreviation rule in CSS or with a `<span class="nav-meta-full">…</span><span class="nav-meta-short">…</span>` swap controlled by media queries. The principle: if the metadata would wrap or squeeze the brand or menu trigger at any width, the metadata loses — abbreviate or hide. (→ source: rules/web/coding-style.md, ui-design:layout-grid)
- **Nav layout must hold composed structure across every breakpoint, not just at mobile and wide-desktop.** A nav using `flex; justify-content: space-between` with three regions (brand-left, meta-center, menu-right) often looks correct at 1440px and at 320px (where it collapses to brand + hamburger), but **breaks at intermediate widths** — the meta-center pushes the menu trigger toward the middle, the brand crashes against the meta, items wrap onto a second line. **Verify nav layout at 320, 640, 768, 1024, 1280, 1440** — every width should look composed, not squeezed. The fix when it breaks at a mid-width: hide the offending element at that width (`@media (max-width: 1023px) { .nav-meta { display: none } }`), don't try to compress it. (→ source: rules/web/coding-style.md)

## Responsive

- **Mobile-first means base styles target the narrowest viewport.** Layer enhancements at `min-width` breakpoints. **Never** use `max-width`-only media queries to retrofit mobile onto a desktop-first design — that's desktop-first authoring, which inverts the discipline. (→ source: rules/web/coding-style.md)
- Breakpoints: 640px, 1024px, 1440px. Use `min-width` media queries. (→ source: spec §7.3)
- **Every page region's content sits inside a container** with horizontal padding ≥ 1rem at all viewport widths. This applies to **the nav, the hero, every `<section>`, and the footer** — not just to elements with the `<section>` tag. **Brand text, menu links, page metadata, body copy — none of it touches the viewport edge at any width.** Even when a region's background bleeds full-width (via negative `margin-inline`), the content within still sits inside the gutter. Test at 320px, 375px, 1024px, 1440px, 1920px: from the leftmost rendered character to the left viewport edge must be ≥ 1rem at every width. The same on the right. (→ source: rules/web/coding-style.md, ui-design:layout-grid)
- **Body text columns clamp to readable width** within sections. Apply `max-width: 65ch` (or similar) to prose blocks; without it, body text spans the entire grid column at wide viewports and becomes hard to read. (→ source: ui-design:type-system)
- **Don't use `&nbsp;` between regular words in display headlines.** A non-breaking space is the right tool for genuinely-unbreakable phrases — proper nouns ("Mr. Smith"), dates ("May 5"), units ("100 km"), brand names ("Apple Inc.") — where breaking the phrase across lines reads wrong. **It is the wrong tool for typographic widow/orphan prevention** between ordinary words like "Tuesday morning" or "a small house". The combined word becomes unbreakable, and at narrow viewports the merged token overflows past the container — a layout failure that's invisible at the desktop width where the headline was authored. **Use `text-wrap: balance` (or `text-wrap: pretty`) on the headline element instead** — the browser balances line lengths automatically and still respects natural word breaks at every width. The two tools serve different goals: `&nbsp;` is for semantic unbreakability; `text-wrap: balance` is for typographic refinement. Reaching for `&nbsp;` to fix a "this word looks lonely on its own line" problem at desktop creates a 320px overflow bug. (→ source: rules/web/coding-style.md, ui-design:type-system)
- No fixed pixel widths on layout containers; use `max-width` with a `clamp()`-fluid inner. (→ source: rules/web/coding-style.md)
- **Grid alignment caution**: `align-items: end` on a grid row with variable-height content makes shorter columns appear orphaned (their content sits at the bottom of the row with empty space above). Default to `align-items: start` unless deliberately bottom-aligning content of similar height. (→ source: ui-design:layout-grid)
- **Verify each breakpoint visually** — a layout that "compiles" doesn't guarantee it composes. Specifically check: nav usable, no horizontal scroll, body text within readable column width, footer columns aligned, hero composition holds, images fit their cells.
- **Absolute-positioned editorial overlays** (figcaptions floated into the margin, pull-quotes overlapping their figure, decorative cards offset from their parent with negative `right` / `bottom`) **must remain inside the viewport**. A `figcaption` with `right: -1rem` reads as elegant when the parent figure has page gutter to its right; it clips off-screen the moment the figure sits flush against the viewport edge. **Default to `right: var(--gutter)` or `right: 0` when the parent could land in the rightmost column.** Test at 320px, 640px, and 1440px specifically: any element whose right edge extends past the viewport at any of those widths is broken, regardless of how clever the overlap looks at the breakpoint where it was authored. (→ source: ui-design:layout-grid, rules/web/coding-style.md)
- **Drawer and modal close buttons follow the same edge rule.** A close (×) button inside an off-canvas nav drawer, modal, or any overlay is itself an absolute-positioned element. Anchor it with `right: 1rem` and `top: 1rem` minimum — never `right: 0` (the icon glyph clips against the panel edge) and never with a negative offset. Apply the same floor inside drawers as you would inside the page: 1rem from any edge. The close button is the most-tapped element in a drawer; clipping it is a regression on the most important affordance. (→ source: rules/web/coding-style.md, interaction-design:feedback-patterns)
- **Wide-viewport reflows must serve content, not consume horizontal space.** When a wider breakpoint provides extra width, the question is not _"what can I fit side-by-side?"_ but _"does this content read better split, or does it just spread thinner?"_ Three specific failure modes to avoid: **(1)** A caption that sits below its photo at narrow widths and _moves beside the photo_ at wide widths via grid-column reflow. The default at wide widths is to cap the photo's `max-width` and center it (or constrain the figure container) — keep the caption stacked below. Side-captions are an explicit aesthetic move (Editorial signals it deliberately); they're not a free reflow. **(2)** Two distinct content blocks (e.g., hours table + contact info) forced into adjacent columns when their content density and visual weight differ. Side-by-side reads as deliberate composition only when both columns are visually balanced; otherwise stack vertically with `max-width` on the container. **(3)** A tall element (portrait image, long figure) placed adjacent to a short element (a 2–3 sentence paragraph). At desktop widths the tall column dominates and orphans the short column above vertical dead space. Fix: cap the tall element with `max-height: 60vh` (or similar) so its rendered height matches the text column, _or_ stack vertically with the image at constrained `max-width`. **Quantitative threshold: if the column-height ratio at the 1024px breakpoint exceeds ~1.2:1, stack vertically.** This is not a "balanced columns" judgment call — it's a measurement. Author the side-by-side, then ask: at 1024px, are these columns within 1.2× of each other in rendered height? If no, the layout is broken regardless of how the markup compiles. **Specific case: portrait aspect-ratio images (4:5, 3:4, 2:3) sitting in a side-by-side column with a text block almost always exceed 1.2:1 — default to stacking vertically, or use a landscape ratio (16:9, 4:3, 3:2) for the side-by-side case.** Portrait images belong in standalone hero/feature placements where they own the column, not next to text content. (→ source: ui-design:layout-grid, ui-design:spacing-system)

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
