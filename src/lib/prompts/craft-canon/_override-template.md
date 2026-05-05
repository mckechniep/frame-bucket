# [Aesthetic Name] — Craft Override

> **Authoring notes (delete before shipping):**
>
> - The leading underscore in this filename keeps it out of `listAestheticOverrides()` (see `src/lib/prompts/loader.ts`).
> - Each `[bracketed placeholder]` below is a fill-in. Replace with concrete, opinionated content.
> - "Distinctive Signals" should _amplify_ the Notion taxonomy entry's signals — read them first, then write here in the LLM's voice.
> - Every section that overlaps the base canon (typography, color, motion) is here to _modulate_ — say what's specific to this aesthetic and what bends from the canon's defaults.
> - Citations follow the same `(→ source: <path>)` convention as `base.md` and `output-contract.md`.

## Distinctive Signals (amplify the taxonomy's)

[3–6 sentences expanding the Notion entry's signals into specific, designable signals. Name typefaces, name colors, name compositional moves. The LLM should be able to read this section and know exactly what visual language to commit to.]

## Typography

- **Display family**: [Specific recommendations — e.g., "Fraunces, Playfair Display, Ogg, Cormorant Garamond. Serif with editorial weight."]
- **Body family**: [Specific recommendations — e.g., "Inter, Söhne, Söhne Mono, Untitled Sans. Clean sans with optical sizing where supported."]
- **Scale ratio**: [Numeric range, e.g., "≥ 2.4× between display and body. 3.0× for hero sections; 2.4× for sections; 1.6× for sub-headings."]
- **Line-height**: [Range for body, e.g., "1.55–1.7 for body. Display 1.05–1.15 (tight)."]
- **Character notes**: [Anything aesthetic-specific — italics, drop-caps, ligatures, optical sizing, OpenType features.]

## Color Behavior

- **Palette shape**: [Describe the palette — e.g., "Restrained: 2-3 neutrals + 1 considered accent. Warm or cool, not both."]
- **Accent role**: [What does the accent do? — e.g., "Used sparingly: pull-quote bars, footnote markers, link hover, single hero element. Not a button-fill default."]
- **Contrast**: [Targets and notes — e.g., "AA throughout. Body text on warm neutral often looks higher-contrast than it measures; verify."]
- **Mood**: [How does color feel? — e.g., "Considered, not loud. Muted in saturation, deep in chroma."]

## Spacing & Rhythm

[Describe how this aesthetic breathes. Generous, tight, disciplined, broken? Where does the spacing vary? — e.g., "Generous and varying. Section spacing can swing 2× between regions to mark editorial pacing. Drop-caps and pull-quotes break the column grid intentionally."]

## Motion Vocabulary

- **Duration range**: [e.g., "250–600ms. Slower than UI defaults; this aesthetic has weight."]
- **Easing**: [e.g., "ease-out for entrances; long custom curves for hero sequences. Avoid `ease` defaults."]
- **Techniques**: [e.g., "Slow fades, gentle parallax on hero imagery, line-by-line reveal of headlines, magnetic hover on linked images."]
- **Restraint**: [What this aesthetic does NOT do — e.g., "No bouncy springs. No theatrical zoom-and-explode. No autoplaying carousels."]

## Texture / Atmosphere

[Describe surface treatments. — e.g., "Subtle paper grain, off-white tinting, soft drop-shadows from low-angle light. Avoid heavy noise overlays. Optional: faint film grain at 2-4% opacity over hero images."]

## Composition

- **Grid discipline**: [e.g., "12-column on large; varies fluidly on smaller. Grid is a guide, not a cage."]
- **Asymmetry**: [How much, where? — e.g., "Encouraged. Headlines breaking out of the column, images overlapping section edges, captions floating in the margin."]
- **Layering**: [e.g., "Through typography scale primarily; through subtle photographic depth secondarily. No card-on-card stacking."]

## Rule Modulations (how base canon bends here)

- "Intentional rhythm" → [How does this aesthetic interpret it? — e.g., "Deliberate variability. Section spacing should vary 2× across the page."]
- "Depth or layering" → [e.g., "Achieved through typography scale and image overlap, not through stacked cards or shadows."]
- "Grid-breaking composition" → [e.g., "Default. Drop-caps, pull-quotes, marginalia, asymmetric crashes."]
- [Other modulations as needed]

## Anti-patterns (what would feel wrong for THIS aesthetic)

- [List 4-6 specific things. The more concrete and visual, the better. — e.g., "Heavy sans display (Helvetica Black, Druk) — wrong family."]
- [e.g., "Centered headlines on every section — reads as timid."]
- [e.g., "Generic 8px border-radius across all elements — wrong material language."]
- [e.g., "Bouncy spring animations — wrong motion vocabulary."]
- [e.g., "Stock corporate photography — must use editorial-quality imagery."]
- [Always include] "Lorem ipsum" — automatic regeneration. (→ source: rules/web/design-quality.md)

## Reference Touchpoints

- **Sites/publications**: [e.g., "The Outline (RIP), NYT Projects, McSweeney's, Aeon, The Marginalian, Pentagram studio site"]
- **Typefaces that work**: [e.g., "Fraunces (variable, free), Playfair Display, Cormorant, Söhne (paid), Inter, Ogg"]
- **Colors that work**: [e.g., "Warm off-whites, deep ink, muted brick or oxblood as accent, considered photography pulled from the brand's industry"]
- **Studios that ship this aesthetic**: [e.g., "Pentagram, Sagmeister & Walsh, Output Studio"]

## Citations

- [Specific lines you want to ground in sources, e.g., "Display ratio ≥ 2.4×" → source: `ui-design:type-system`]
- [And so on]
