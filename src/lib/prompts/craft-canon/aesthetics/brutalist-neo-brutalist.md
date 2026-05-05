# Brutalist / Neo-Brutalist — Craft Override

## Distinctive Signals (amplify the taxonomy's)

Brutalist sites refuse polish on purpose. Type is oversized — display sizes start at 100px and go larger; headings overlap, crash into images, break out of any column they're given. Color is high-contrast and flat, unafraid of dissonant pairings — yellow on lime, red on cyan, "wrong" combinations chosen deliberately to feel charged. Borders are hard-edged: 2-4px solid lines, never soft drop-shadows. Layout is asymmetric by default; the grid exists to be broken. Material treatment is raw — concrete textures, paper grain, hand-drawn annotations, exposed structural elements (visible borders, undecorated form fields, system-font fallbacks). The page reads as confrontational, expressive, point-of-view first; polish second (or never). (→ source: rules/web/design-quality.md, ui-design:type-system)

Two strands of this aesthetic live under one taxonomy entry. **Web Brutalism** (~2014-2018, archived at brutalistwebsites.com) used system fonts and intentionally raw HTML as a reaction against template polish — Times New Roman, default form controls, flat HTML you could view-source. **Neo-Brutalism** (post-2020) is more _designed_: Helvetica Black or Druk paired with monospace, hard-edged geometric blocks, intentional color crashes that feel curated. The override supports both ends of this spectrum; the recipe's other buckets (system, layout) typically tilt the LLM one direction or the other.

## Typography

- **Display family**: Grotesk with weight — Helvetica Black, Helvetica Now Display Black, Druk, Founders Grotesk Mono Bold, Söhne Breit. Pair with monospace for accent — Space Mono, JetBrains Mono, IBM Plex Mono. Helvetica Black + Space Mono is the classic Neo-Brutalist pairing. (For Web Brutalism: lean on system fonts deliberately — `font-family: -apple-system, ui-sans-serif, sans-serif` or even `Times, serif` as raw default.)
- **Body family**: Sans-serif body — Inter, IBM Plex Sans, Söhne. Or monospace body for technical/raw treatment — Space Mono, JetBrains Mono. Body can crash into display sizes intentionally; the contrast is the point.
- **Scale ratio**: Massive. Display 5.0× body or larger. Hero headlines at 100-200px on desktop are normal; 300px+ is fine. The size is the statement. (→ source: ui-design:type-system, ui-design:visual-hierarchy)
- **Line-height**: Display 0.85–1.0 (tight, letterforms touch or overlap). Body 1.4–1.5 (functional, not generous). Heading and body line-heights deliberately _clash_.
- **Character notes**: Embrace ugly. Forced-uppercase blocks of text. Mid-sentence font swaps. Display headlines that don't fit their container and overflow visibly. No decorative serifs, no italics-as-default, no OpenType polish.

## Color Behavior

- **Palette shape**: High-contrast and flat. 4-6 colors total but used dissonantly — yellow + cyan + red + black, or chartreuse + magenta + ink, or "school construction paper" combinations. Avoid harmonious analogous palettes; reach for the ones color theory says shouldn't work.
- **Accent role**: Multiple accents are fine here, used as _blocks_ (full-color section backgrounds, button fills, big geometric shapes). Avoid the tasteful single-accent approach Swiss/Editorial use.
- **Contrast**: AA throughout, but visually _jarring_ — black-on-yellow at 7:1+ feels electric, not safe. Use the high contrast as a feature.
- **Mood**: Confrontational. Charged. The palette should feel like it has an opinion.

## Spacing & Rhythm

Deliberately broken. Section boundaries crash — a hero might overlap the section below by 100px, a heading might sit at the bottom of one section and the body at the top of the next. Inside a section, spacing is uneven: tight clusters next to vast empty regions, content blocks stacked too close or floated too far apart. (→ source: ui-design:spacing-system)

The discipline is in the _intent_ of the breaking — not random jitter, but composed crashes. A heading that overflows its column was placed there on purpose. A pull-quote that overlaps its image is composed, not accidental.

## Motion Vocabulary

- **Duration range**: 0–800ms. Wide range deliberately. Some elements snap (0ms, hard cuts); others linger longer than expected (600-800ms). The contrast is the rhythm.
- **Easing**: Avoid smooth `ease` and `ease-in-out` defaults — they read as polished, which is wrong here. Use `linear` for utilitarian transitions, sharp `cubic-bezier(0.7, 0, 0.3, 1)` curves for assertive moves, or `steps()` functions for genuinely jarring stepped motion.
- **Techniques**: Hard cuts on section transitions instead of smooth fades. Glitch effects (rapid x-offset jitters) on hover for select elements. Scale-up state changes on buttons that feel mechanical. Cursor-trailing experimental effects for high-energy contexts.
- **Restraint**: Brutalism's restraint is _not_ "less motion" — it's the right _kind_ of motion. Bouncy springs are wrong (too playful). Smooth Apple-style transitions are wrong (too polished). The motion should feel mechanical, raw, or jarring on purpose. (→ source: interaction-design:animation-principles)

## Texture / Atmosphere

Concrete, raw, material. Heavy paper grain or noise overlays (8-15% opacity, much louder than Editorial's 2-4%). Exposed image artifacts — visible JPEG compression, low-resolution pixelation, intentional dithering. Hand-drawn annotations, scribbles, marker strokes. Visible borders everywhere — every block, button, image carries a 2-4px solid border. The atmosphere should feel made-of-something, not rendered.

This is the _opposite_ of the Swiss flat-ideology. Brutalist embraces every texture and atmospheric layer the canon allows, and pushes them louder.

## Composition

- **Grid discipline**: A grid exists, but it's the platform from which to break. Twelve-column at desktop, but elements regularly span 13 columns (overflow), 1 column (extreme indent), or float at non-grid positions for composition reasons. (→ source: rules/web/design-quality.md)
- **Asymmetry**: Default. Symmetric layouts are wrong here. Headlines crash diagonally, images overlap section edges, content blocks at unequal sizes are the norm.
- **Layering**: Hard-edged. Stacked blocks with visible borders. Overlapping elements without `box-shadow` softening. Clip-path geometric cuts. Z-index used aggressively. Layering through _placement_, not through _atmosphere_.

## Rule Modulations (how base canon bends here)

- **"Intentional rhythm" → deliberately broken rhythm.** Swiss's mathematical consistency is exactly wrong here. Sections should feel composed but uneven; spacing should clash; the page should read as edited-and-shoved-together, not balanced.
- **"Depth or layering" → hard-edged, not soft.** Layering happens through stacked blocks with solid borders, not through `box-shadow` or atmospheric depth. The canon's depth quality is honored but the technique is reframed.
- **"Grid-breaking composition" → default, escalated.** Editorial breaks the grid sometimes; Brutalist treats the grid as a platform to actively reject. Headlines spilling across columns, images bleeding past section edges, content blocks at intentionally wrong sizes.
- **"Designed hover, focus, active states" → assertive, not subtle.** Hover transitions are scale-ups (`transform: scale(1.05)`), color flips (yellow background → black background), or glitch effects. Focus rings are 4px solid blocks in the accent color, not soft glows. (→ source: interaction-design:feedback-patterns)
- **"Typography with character" → maximally so.** The display face _is_ the brand voice. Helvetica Black at 200px is a statement. Don't soften it.
- **"Color used semantically" → expressed as charged contrast.** The semantic role is "this is loud," "this is louder." High-contrast pairings serve as the structure.

## Anti-patterns (what would feel wrong for THIS aesthetic)

- Soft drop-shadows or `box-shadow: 0 4px 12px rgba(0,0,0,0.1)`-style depth — wrong depth strategy. Brutalist depth is hard-edged. (→ source: rules/web/design-quality.md)
- Smooth gradient backgrounds or accent fills — wrong color treatment. Brutalist colors are flat blocks.
- Pastel palettes, harmonious analogous colors, "tasteful" muted tones — wrong mood. Reach for charged, dissonant, electric.
- `border-radius: 8px` on every component — wrong material language. Brutalist edges are sharp (`border-radius: 0` is the default, with rare 2-4px exceptions for visual rhythm).
- Bouncy spring animations or smooth Apple-style ease curves — wrong motion vocabulary. Brutalist motion is mechanical or jarring.
- Centered hero with subtitle and CTA — wrong composition. Brutalist heroes break out of the column, overflow vertically, or sit asymmetrically. (→ source: rules/web/design-quality.md)
- Stock-photo people-pointing-at-laptops — wrong imagery tradition. Brutalist imagery is documentary, raw, or absent altogether.
- Refined polish ("just one more iteration") — wrong design philosophy. The first or third version, kept rough, is often correct. Polish is the failure mode here.
- "Lorem ipsum" or placeholder copy — automatic regeneration. (→ source: rules/web/design-quality.md, designer-toolkit:ux-writing)

## Reference Touchpoints

- **Sites and archives**: Brutalist Websites archive (brutalistwebsites.com), Are.na (interface itself), Awwwards "Anti-Aesthetic" winners, Balenciaga.com, Gucci's experimental drops, Bloomberg Businessweek covers (Richard Turley era), Pentagram's Bloomberg Businessweek redesign, Type Directors Club archive.
- **Designers and studios**: David Carson (Ray Gun era, foundational), Richard Turley (Bloomberg Businessweek, Wieden+Kennedy), Erik Brandt (Geometry of Pasta), Mihai Mihu Selearu, Ezra Stoller (architectural Brutalism reference), Studio Output, Pentagram's experimental work.
- **Typefaces that work**: Helvetica Black (paid), Druk (paid, Commercial Type), Founders Grotesk Mono Bold (paid), Söhne Breit (paid), Space Mono (free, Google Fonts), JetBrains Mono (free), IBM Plex Mono (free), system-font stack (`-apple-system, ui-sans-serif`) for Web Brutalism authenticity.
- **Colors that work**: High-saturation primaries (`oklch(75% 0.22 95)` chartreuse, `oklch(60% 0.25 25)` red, `oklch(70% 0.22 195)` cyan), construction-paper yellows, deep blacks, "wrong" combinations. Avoid muted earth tones; those belong to Scandinavian Minimal.
- **Architectural references** (the name comes from architecture): Le Corbusier's Cité Radieuse, Boston City Hall, Trellick Tower, Geisel Library — concrete, exposed, hard-edged, point-of-view first. (→ source: Brutalist architecture tradition per Reyner Banham's _The New Brutalism_)

## Citations

- Massive display scale (5.0× body+) → source: `ui-design:type-system`, `ui-design:visual-hierarchy`
- Dissonant color pairings → source: `ui-design:color-system`, Brutalist tradition
- Hard cuts and mechanical motion → source: `interaction-design:animation-principles`
- Hard-edged layering, no soft shadows → source: `rules/web/design-quality.md`
- Grid-breaking as default → source: `rules/web/design-quality.md`
- Heavy texture and material treatment → source: `rules/web/design-quality.md`
- "Anti-polish" philosophy → source: `rules/web/design-quality.md` ("Neo-brutalism" listed as worthwhile direction), Brutalist Websites archive curatorial intent
- AA contrast on charged pairings → source: `rules/web/performance.md`
- No Lorem ipsum (universal) → source: `rules/web/design-quality.md`, `designer-toolkit:ux-writing`
