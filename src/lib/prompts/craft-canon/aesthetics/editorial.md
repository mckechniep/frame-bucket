# Editorial — Craft Override

## Distinctive Signals (amplify the taxonomy's)

Editorial sites read like considered publications. Serif display typography sets the page's tone before any other decision lands. Whitespace is generous and _varies_ — sections breathe at different rhythms to mark editorial pacing, not to fill a uniform grid. Drop-caps, pull-quotes, marginalia, and asymmetric crashes between text and image are the defining moves; they signal art direction over template assembly. Imagery is editorial-quality — bleeding to the edge, overlapping section boundaries, paired with captions that earn their typeset treatment. The grid is a guide, not a cage; the type system is the visual hierarchy. (→ source: rules/web/design-quality.md, ui-design:type-system)

## Typography

- **Display family**: Serif with editorial weight — Fraunces (variable, free, Google Fonts), Playfair Display, Ogg, Cormorant Garamond. The display face does heavy lifting; it is the page's voice. Not a soft humanist serif (Lora, Merriweather) — those read as default-blog.
- **Body family**: Clean sans for readability — Inter, Söhne, Untitled Sans, IBM Plex Sans. Optical sizing where supported (Inter and Fraunces both have it). One body weight (regular) plus optionally a medium for emphasis; no italic-as-default body.
- **Scale ratio**: ≥ 2.4× between display and body. Hero display sizes can reach 3.0–4.0× of body; section headings sit around 2.4×; sub-headings around 1.6×. The ratio is the _most visible_ editorial signal — bigger than you think feels right is usually correct here. (→ source: ui-design:type-system, ui-design:visual-hierarchy)
- **Line-height**: Body 1.55–1.7 (generous, letting the eye flow through long passages). Display 1.05–1.15 (tight; let the letterforms touch).
- **Character notes**: Embrace OpenType features — discretionary ligatures, old-style figures (`font-variant-numeric: oldstyle-nums`) for body, lining figures for tabular data. Drop-caps via `::first-letter` on opening paragraphs of major sections. Italics for pull-quotes and emphasis, never for entire body sections.

## Color Behavior

- **Palette shape**: Restrained — 2-3 neutrals (warm off-whites, deep ink) plus a single considered accent. Editorial palettes feel like printed paper: a chosen background tint, a chosen ink color, a chosen accent that appears in 4-6 places total on the page.
- **Accent role**: Used sparingly. Pull-quote bars, footnote markers, link hover, a single hero element. Never a button-fill default. The accent is a punctuation mark, not a paragraph.
- **Contrast**: AA throughout. Be careful: warm-on-warm pairings (oxblood on cream, sepia on parchment) often _look_ high-contrast but measure lower; verify with a real contrast checker. Body text on warm neutral usually wants slightly more contrast than the same text on pure white. (→ source: rules/web/performance.md, ui-design:color-system)
- **Mood**: Considered, not loud. Muted in saturation, deep in chroma. Avoid pure-saturated primaries; reach for oxblood, ink, brick, sepia, slate, paper.

## Spacing & Rhythm

Generous and _varying_. The defining move is that section spacing should swing significantly across the page — a hero might use `--space-section * 1.5`, a feature region `--space-section`, a sub-section `--space-section * 0.6`. This variability is what marks the page as edited, not assembled. (→ source: ui-design:spacing-system)

Inside a section, body paragraphs get generous space-between (`--space-4` to `--space-6`); headings get more breathing room above than below ("space the section, not the heading"). Drop-caps and pull-quotes deliberately break the column grid — pull-quotes float left or right in the margin at desktop, full-width on mobile. Captions live below their image with a small accent line above (a 1px rule, not decorative).

## Motion Vocabulary

- **Duration range**: 250–600ms. Slower than UI motion (which sits at 150–250ms). Editorial motion has weight.
- **Easing**: `ease-out` for entrances (`cubic-bezier(0.16, 1, 0.3, 1)` works well — slow start, settled finish). Hero sequences may use longer custom curves. Avoid unstyled `ease` and `linear`.
- **Techniques**: Slow fades on scroll-triggered section reveals (use `IntersectionObserver`, not scroll handlers). Gentle parallax on hero imagery — `transform: translateY(...)` only, capped at 20-30px max travel. Line-by-line reveal of major headlines using `clip-path` or `transform: translateY` with staggered delays. Magnetic hover on linked images (subtle `transform: scale(1.02)` on hover).
- **Restraint**: No bouncy springs. No theatrical zoom-and-explode. No autoplaying carousels. No motion that competes with the typography for attention. (→ source: interaction-design:animation-principles)

## Texture / Atmosphere

Subtle and material. Off-white tinting (`oklch(98% 0.005 80)` is a warm paper neutral). Faint paper-grain noise overlays at 2-4% opacity, applied to large background regions. Soft drop-shadows from low-angle light — short distance, soft blur, low opacity. Optional: a barely-visible film grain over hero imagery (2-3% via `mix-blend-mode: overlay` on a noise layer). Avoid heavy noise, neon glows, or maximalist texture. The atmosphere should feel _printed_, not _generated_.

## Composition

- **Grid discipline**: 12-column at large; collapses fluidly. The grid is a guide; breaking it on purpose is an editorial signal.
- **Asymmetry**: Encouraged. Headlines that break out of the column. Images overlapping section edges. Captions floating in the margin. A heading that occupies 6 columns while its body sits in 4. (→ source: rules/web/design-quality.md)
- **Asymmetric crashes stay inside the page container**: editorial moves like overflowing headlines, marginalia, and images-bleeding-past-section-edges happen _within_ the page-level container/gutter. They do not run to the viewport edge. The gutter is the page's frame; asymmetry plays inside that frame. At wide viewports especially (1440px+), generous container padding is what gives editorial layouts breathing room — let the page have shoulders. (→ source: ui-design:layout-grid, rules/web/coding-style.md)
- **Marginalia and floated figcaptions stay readable at every viewport.** Editorial captions positioned with negative `right` / `bottom` to overlap their parent figure are an iconic editorial move — but the moment the parent figure sits flush against the page gutter, the negative offset clips off-screen. **When the figure occupies the rightmost grid column, anchor its caption with `right: 0` or `right: var(--gutter)` rather than negative values.** When the figure sits with sibling space to its right (e.g., 8 columns of figure with 4 columns of text alongside), negative-right marginalia reads correctly. The discipline: ask "does the parent have room to receive the overlap?" — if not, anchor inward. (→ source: ui-design:layout-grid)
- **Layering**: Achieved through typography scale and image overlap, not through stacked cards or `box-shadow`. Editorial pages rarely use card-on-card stacking; depth comes from the type hierarchy and overlapping images.

## Rule Modulations (how base canon bends here)

- **"Intentional rhythm" → deliberate variability.** Section spacing should vary 1.5–2× across the page; sections that breathe equally are sections that read flat.
- **"Depth or layering" → achieved via typography scale and image overlap.** The display-to-body ratio (2.4× and up) is itself a depth move; you don't need shadows to feel layered.
- **"Grid-breaking composition" → default, not occasional.** Drop-caps, pull-quotes, marginalia, asymmetric crashes are the _normal_ state for Editorial layouts.
- **"Designed hover, focus, active states" → restrained.** Hover effects on body links should be a 150ms underline transition, not a pop or color flash. Editorial UI feedback is whispered, not shouted.
- **"Typography with character" → display face is the brand voice.** The serif you choose is the most identity-defining decision on the page; choose deliberately and commit.

## Anti-patterns (what would feel wrong for THIS aesthetic)

- Heavy sans display (Helvetica Black, Druk, Founders Grotesk Mono Bold) — wrong family. Save those for Brutalist.
- Centered headlines on every section — reads as timid. Editorial layouts use left-alignment with deliberate breaks.
- Uniform 8px border-radius across all elements — wrong material language. Editorial doesn't speak in card UI; it speaks in typography.
- Bouncy spring animations or theatrical zoom transitions — wrong motion vocabulary. Slow and considered.
- Stock corporate photography — must use editorial-quality imagery: documentary, high-contrast, intentionally composed. Avoid stock-photo people-pointing-at-laptops.
- Soft pastel gradients as accent — wrong color language. Editorial accents are flat, deep, considered.
- Multiple accent colors competing — Editorial uses one accent. Two accents is a different aesthetic.
- "Lorem ipsum" or placeholder copy — automatic regeneration. (→ source: rules/web/design-quality.md, designer-toolkit:ux-writing)

## Reference Touchpoints

- **Sites/publications**: The Outline (RIP, archived examples are gold), NYT Projects (e.g., "Snow Fall"), McSweeney's, Aeon, The Marginalian, Pentagram studio site, Frieze, Apartamento magazine site, Bloomberg Businessweek long-form features.
- **Typefaces that work**: Fraunces (variable, free), Playfair Display (free), Cormorant Garamond, Ogg (paid), Söhne (paid, body), Inter (free, body), IBM Plex Sans (free, body).
- **Colors that work**: Warm off-white (`oklch(97-98% 0.005-0.01 80)`), deep ink (`oklch(15-20% 0.01 250)`), muted oxblood or brick as accent (`oklch(40-50% 0.12-0.18 25-40)`), considered photography pulled from the brand's industry.
- **Studios that ship this aesthetic**: Pentagram, Output Studio, Sagmeister & Walsh, Order, Mucca, Anagrama.

## Citations

- Display-to-body ratio ≥ 2.4× → source: `ui-design:type-system`
- Section spacing variability → source: `ui-design:spacing-system`
- Restrained palette + single accent → source: `ui-design:color-system`
- Slow, considered motion vocabulary → source: `interaction-design:animation-principles`
- Grid-breaking as default → source: `rules/web/design-quality.md`
- Editorial-quality imagery requirement → source: `rules/web/design-quality.md`
- WCAG AA contrast on warm-on-warm pairings → source: `rules/web/performance.md`
- No Lorem ipsum (universal) → source: `rules/web/design-quality.md`, `designer-toolkit:ux-writing`
