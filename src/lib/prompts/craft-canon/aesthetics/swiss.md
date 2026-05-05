# Swiss — Craft Override

## Distinctive Signals (amplify the taxonomy's)

Swiss design is the application of mathematical clarity to visual communication. The grid is sacred — every element aligns to it without exception. Typography is one disciplined sans, used at scale-defined sizes; the type system _is_ the visual hierarchy with no decorative help required. Whitespace is generous and rigorously consistent — it is structural, not atmospheric. Color is overwhelmingly black on white (or near-black on near-white), interrupted by a single high-contrast accent (most often red, after Müller-Brockmann). Decoration is absent: no gradients, no textures, no shadows, no rounded corners, no flourishes. The page reads as objective, rational, and earned through restraint — the visual equivalent of a clearly-stated proof. (→ source: rules/web/design-quality.md, ui-design:type-system)

## Typography

- **Display family**: Helvetica Neue, Neue Haas Grotesk, Akzidenz-Grotesk, Inter (free Helvetica-adjacent), Aktiv Grotesk. Pick one. The display face is the body face; the same family carries the entire hierarchy through size and weight discipline.
- **Body family**: Same as display. Swiss does not pair faces; it disciplines one. (Acceptable exception: a tabular monospace for data — Söhne Mono, JetBrains Mono — used only where information design demands it.)
- **Scale ratio**: Disciplined, not dramatic. Display 2.0–2.4× body; section heading 1.6×; sub-heading 1.3×. The ratio is mathematical and predictable across the page. Do not vary. (→ source: ui-design:type-system, ui-design:visual-hierarchy)
- **Line-height**: Body 1.4–1.5 (utilitarian, not generous). Display 1.05–1.15 (tight). The page should read as efficient, not lavish.
- **Character notes**: One or two weights total — Regular and Bold, or Regular and Medium. No italics for body. No drop-caps. No OpenType decoration. The discipline is the character.

## Color Behavior

- **Palette shape**: Black + white dominant. A single accent. That's the whole palette. Five colors total is a _failure_; three colors is correct. The neutral can shift slightly off-white (`oklch(98% 0 0)`) for paper-quality; the ink can be near-black (`oklch(15% 0 0)`); the accent is the punctuation.
- **Accent role**: One color, used sparingly and consistently. Most often red (after Müller-Brockmann's Swiss canon — `oklch(55% 0.22 28)` is a workable starting point), but a single saturated yellow, blue, or orange also works. The accent appears 4-8 times per page maximum: a heading underline, a button fill, a numerical callout, a footer mark.
- **Contrast**: AA throughout, easily. Black-on-white is the highest-contrast pairing possible; the discipline is making sure UI elements (buttons, form borders, focus rings) maintain 3:1 against the surface.
- **Mood**: Objective. Precise. The palette should feel chosen by an engineer who happens to also be a designer — every color justifies itself.

## Spacing & Rhythm

Strictly mathematical. A single base unit (8px is canonical for Swiss), and every margin, padding, and gap is a multiple of it. The page rhythm is _consistent_, not varying — the opposite of Editorial's variability. Section spacing is the same value across all sections (or, at most, two values: a "section" rhythm and a "sub-section" rhythm). (→ source: ui-design:spacing-system)

The grid is 12 columns at large screens, 8 at medium, 4 at small — and elements _snap_ to grid lines. A heading that occupies 8 columns starts and ends exactly on grid lines. This rigorous alignment is the Swiss signature.

## Motion Vocabulary

- **Duration range**: 100–250ms. Short and precise. Swiss motion does not linger.
- **Easing**: `ease-out` for most state changes (`cubic-bezier(0.25, 1, 0.5, 1)`). Linear or near-linear for utilitarian transitions (a panel sliding open). Never bouncy; never theatrical.
- **Techniques**: Crisp opacity fades on entrances. Sharp directional translates (`transform: translateX/Y`) for panel-style reveals. Hover state changes are color-only or border-only — no scale, no lift. (→ source: interaction-design:animation-principles)
- **Restraint**: No parallax. No autoplay. No magnetic hover. No theatrical reveal sequences. Motion should feel like a Bauhaus printing machine — precise, mechanical, deliberate.

## Texture / Atmosphere

Flat. No grain, no noise overlays, no soft drop-shadows, no gradients (except utilitarian where unavoidable, e.g., scrollbar tracks). The page should look like a printed Swiss poster — flat ink on white paper, with sharp edges and no atmospheric softening.

This is one of the most explicit _modulations_ in the Swiss canon: the base canon allows texture and atmosphere when the aesthetic supports it; Swiss does not. Skipping atmosphere is a deliberate decision that this aesthetic owns.

## Composition

- **Grid discipline**: Sacred. Twelve-column at desktop, derived columns at smaller breakpoints. Every meaningful element starts and ends on a grid line. No bleeds, no exceptions.
- **Asymmetry**: Permitted within the grid (a heading on columns 1-6, body on columns 7-12), but never _breaking_ the grid. The grid is the law; asymmetric arrangement within it is allowed and often beautiful.
- **Layering**: Through type scale and color, never through `box-shadow` or stacked surfaces. Swiss pages are flat. Hierarchy is made by typographic weight and spacing, not by visual depth. (→ source: ui-design:visual-hierarchy)
- **Captions stack below figures at every viewport.** Swiss does not relocate captions to side columns at wider breakpoints. The caption belongs predictably under the photo (or under the figure container); when extra width is available at large viewports, **cap the figure's `max-width` and center it** rather than splitting figure-and-caption into adjacent grid columns. Side-captions are an Editorial move; Swiss is not Editorial. (→ source: ui-design:layout-grid)
- **Vertical stacking is the wide-viewport default.** When content blocks (operating hours, contact info, location, schedule) sit in a sequence, default to vertical stacking with consistent rhythm. Going side-by-side at wide breakpoints is permitted only when the resulting columns have _equal density_ and _matched heights_ — a 2×2 matrix of identical-shape items, for example, or two equal-row tables. Mismatched columns ("hours block" + "address block" of different visual weights forced into adjacent positions) read as artificial space-filling, not as Swiss discipline. When in doubt, stack vertically and cap container `max-width`.

## Rule Modulations (how base canon bends here)

- **"Grid-breaking composition" → REJECTED.** This is one of the canon's "required qualities" but Swiss explicitly does not include it among its four. The grid is sacred; breaking it is a different aesthetic. Substitute another quality (intentional rhythm, scale-contrast hierarchy, semantic color, designed states) — never drop below four total.
- **"Texture, grain, or atmosphere" → REJECTED.** Same reasoning. Swiss is flat by ideology. Substitute.
- **"Intentional rhythm" → expressed as mathematical consistency.** Swiss rhythm is a fixed cadence, not deliberate variation. The "intent" is in the discipline of staying on grid.
- **"Typography with character" → discipline IS the character.** A single sans-serif used at scale-driven sizes is the Swiss voice. Don't add a serif, don't add a display face. The restraint is the signal.
- **"Designed hover, focus, active states" → utilitarian, not expressive.** Hover state changes are subtle (color shift, border emphasis), not lifts or scales. Focus rings are sharp 2px outlines in the accent color, not soft glows.
- **"Color used semantically" → with maximum restraint.** Three colors (surface, ink, accent) plus state colors (success/danger/warning) when the recipe demands. Five colors total is a ceiling, not a target.

## Anti-patterns (what would feel wrong for THIS aesthetic)

- Any decorative serif as a display face — wrong family. Swiss is grotesque-only.
- Multiple accent colors competing — the accent is singular. Two accents is a different aesthetic.
- Rounded corners (`border-radius` > 0) on cards or buttons — wrong material language. Swiss has hard edges.
- `box-shadow` for layering — wrong depth strategy. Swiss layers through typography.
- Drop-caps, pull-quotes, marginalia — wrong tradition. Save these for Editorial.
- Texture, grain, paper feel — explicitly rejected. The page is flat.
- Bouncy, parallax, or theatrical motion — wrong vocabulary. Swiss motion is short and precise.
- Centered headlines on every section — Swiss is left-aligned by default; centered is reserved for hero or true emphasis.
- Off-grid placement ("just nudge it 5px") is foreign to Swiss discipline — sacrilege in the canon's tradition. Snap to grid. (→ source: ui-design:layout-grid, Swiss design tradition per Müller-Brockmann)
- "Lorem ipsum" or placeholder copy — automatic regeneration. (→ source: rules/web/design-quality.md, designer-toolkit:ux-writing)

## Reference Touchpoints

- **Designers and studios**: Massimo Vignelli (NYC subway map, American Airlines identity), Josef Müller-Brockmann (Grid Systems in Graphic Design), Wim Crouwel, Helmut Schmid, Spin (London), Bureau Borsche, Studio Dumbar.
- **Sites**: Vignelli Foundation, Manual NYC, &Walsh's grid-disciplined work, Swiss Style Color Picker (swisscolor.com), Vercel's earlier marketing pages, Linear's documentation.
- **Typefaces that work**: Helvetica Neue (paid, classic), Neue Haas Grotesk (paid, more refined), Akzidenz-Grotesk (paid, original Swiss face), Inter (free, Helvetica-adjacent), Aktiv Grotesk (paid).
- **Colors that work**: Pure white (`oklch(100% 0 0)`) or near-white paper (`oklch(98% 0 0)`), near-black ink (`oklch(15% 0 0)`), Müller-Brockmann red (`oklch(55% 0.22 28)`), Bauhaus primary yellow (`oklch(80% 0.18 95)`), International Klein Blue (`oklch(40% 0.25 270)`).
- **Posters and prints**: Swiss International Style poster archive, Hoffmann's Graphic Design Manual, the Bauhaus archive.

## Citations

- Single typeface family discipline → source: `ui-design:type-system`
- Mathematical spacing on 8px base → source: `ui-design:spacing-system`
- Single accent color → source: `ui-design:color-system`
- Short, precise motion durations → source: `interaction-design:animation-principles`
- Sacred grid → source: `rules/web/design-quality.md`
- Flat, no-texture rule modulation → source: `rules/web/design-quality.md`
- AA contrast (easy at black-on-white) → source: `rules/web/performance.md`
- No Lorem ipsum (universal) → source: `rules/web/design-quality.md`, `designer-toolkit:ux-writing`
