# Corporate Clean — Craft Override

## Distinctive Signals (amplify the taxonomy's)

Corporate Clean is the most-shipped aesthetic in modern SaaS and the easiest to ship badly. Effective when intentional, generic when defaulted. The discipline of this aesthetic is _resistance to the AI baseline_ — the layout, color, and component decisions an LLM produces with no canon are what failure looks like here. Honor the aesthetic by making deliberate moves _within_ its restraint, not by accepting the baseline.

The signals: clean sans-serif typography with strong hierarchy through scale and weight (not decoration). Restrained palette — typically a single brand primary plus generous neutrals plus semantic colors for state. Predictable 8px-grid spacing that reads as _systematic_ rather than _uniform_. Subtle, deliberate motion (150-250ms ease-out fades on scroll, hover transitions on every interactive element). Trust signals via real photography, customer logos, real product screenshots — never stock people-pointing-at-laptops. Card-based sections used judiciously, not as the entire layout. Subtle drop-shadows that feel _intentional_ (low-angle light, soft blur, low opacity), not the default Material elevation. The page reads as polished, professional, trustworthy — and _specific_ to this brand, not generic. (→ source: rules/web/design-quality.md, ui-design:type-system)

**The Stripe / Linear / Vercel / Notion differentiator**: each of these is technically Corporate Clean, but each has _one or two intentional moves_ that elevate it. Stripe's gradient meshes, used sparingly. Linear's monospace technical accents. Vercel's pure-black-on-white minimalism. Notion's warm-grey neutrals and gentle illustrations. Generic SaaS has none of these moves. The override demands at least one. (→ source: rules/web/design-quality.md)

## Typography

- **Display family**: Clean sans with optical sizing where supported — Inter (free, optical sizing), Söhne (paid), SF Pro (system), IBM Plex Sans (free), Geist (free, Vercel's open-source choice). Should feel competent and readable; doesn't need to feel adventurous.
- **Body family**: Same family as display, or a paired clean sans. The Stripe-style approach is one family across the hierarchy with weight discipline; the Linear-style approach pairs with a tabular monospace (Söhne Mono, JetBrains Mono) for technical accents. Either works. (→ source: ui-design:type-system)
- **Scale ratio**: 1.6×–2.0× between display and body. Conservative compared to Editorial (≥2.4×) or Brutalist (≥5.0×). Hero display can reach 2.5× if the brief has a single hero focal point worth that emphasis; section headings sit around 1.6×; sub-headings around 1.3×. (→ source: ui-design:type-system, ui-design:visual-hierarchy)
- **Line-height**: Body 1.5–1.6 (comfortable for marketing copy, slightly tighter for product UI). Display 1.1–1.2 (clean, not dramatic).
- **Character notes**: Tabular numerics (`font-variant-numeric: tabular-nums`) for any numeric data — pricing tables, dashboards, stats. Optical sizing (`font-optical-sizing: auto`) on Inter/Söhne for crisp rendering at small sizes. Two weights maximum per role (Regular + Bold for body, Medium + Bold for display). No italics for body.

## Color Behavior

- **Palette shape**: A brand primary, generous neutrals (4-6 grey tints from `oklch(98% 0 0)` near-white through `oklch(15% 0 0)` near-black), and semantic roles (success/warning/danger/info). The brand primary is the differentiator — Stripe purple, Linear electric blue, Vercel pure black-as-brand, Notion's warm grey-on-warm. Pick _one_ primary and commit; don't add a "secondary brand color" without strong reason. (→ source: ui-design:color-system)
- **Accent role**: Brand primary appears as button fills (primary action), link colors, focal accents on hero elements, and semantic markers (a status indicator, a verified checkmark). Restrained — a button-fill ratio of 4-8 instances per page is correct. Generic SaaS over-uses the brand primary; intentional Corporate Clean uses it sparingly.
- **Contrast**: AA throughout, easily — neutral palette + brand primary almost guarantees 4.5:1 on body text. The discipline is in _non-text_ contrast: form borders against surfaces (3:1 minimum), focus rings (3:1), disabled state visibility. (→ source: rules/web/performance.md)
- **Mood**: Polished, trustworthy, neutral-but-specific. The palette should feel like it belongs to _this_ company, not "generic B2B SaaS template."

## Spacing & Rhythm

8px base unit. Strict, predictable, _systematic_. Section spacing is consistent (or two-tier: section-major and section-minor). Inside a section, body paragraphs get tight space-between (`--space-3` to `--space-4`); content blocks slightly more (`--space-6` to `--space-8`); section transitions get the most (`--space-12` and up). (→ source: ui-design:spacing-system)

Predictability is the goal — the page should feel _built_, not improvised. This is the opposite of Editorial's intentional variability. But predictable does not mean uniform: the gradient between paragraph-spacing and section-spacing is what makes the page read as composed.

## Motion Vocabulary

- **Duration range**: 150–250ms for UI motion (hover, focus, click feedback). 300–500ms for scroll-triggered reveals. Anything longer is theatrical and wrong here. (→ source: interaction-design:animation-principles)
- **Easing**: `ease-out` for entrances (`cubic-bezier(0.16, 1, 0.3, 1)` is the safe default). `ease` is acceptable for utility transitions but never for entrance reveals. Avoid `linear`, avoid `ease-in-out` for state changes (looks indecisive).
- **Techniques**: Subtle fade-up reveals on scroll using `IntersectionObserver` (translate 8-16px up + opacity 0→1, 300-400ms). Hover transitions on every interactive element (color, opacity, or transform). Smooth state changes on form fields (border color shifts on focus). No parallax. No autoplay. No theatrical hero sequences.
- **Restraint**: This is Corporate Clean's most distinguishing motion property. _Less is more_ but not _none_. Sites with no motion feel static; sites with too much motion feel desperate. The 150-250ms band on every interactive transition is the sweet spot. (→ source: interaction-design:animation-principles)

## Texture / Atmosphere

Flat to very lightly textured. Soft drop-shadows on cards (low-angle, soft blur, low opacity — `box-shadow: 0 4px 12px oklch(0% 0 0 / 0.06)` is a workable starting point). Subtle gradients are acceptable on hero backgrounds but used sparingly (Stripe's gradient meshes are a high bar; "linear-gradient(45deg, blue, purple)" is the failure mode). No grain, no paper texture, no atmospheric depth.

This is one of Corporate Clean's most nuanced rule modulations: the canon allows texture and atmosphere; Corporate Clean _minimizes_ both but doesn't reject them outright. Soft shadows are acceptable; heavy grain is not.

## Composition

- **Grid discipline**: 12-column at desktop, snapping to grid by default. The grid is respected; deviations are rare and reserved for hero or single-focus sections. (→ source: rules/web/design-quality.md)
- **Asymmetry**: Permitted in hero sections (text on the left, hero illustration on the right) but the rest of the page is largely symmetric or balanced-asymmetric (alternating image-left / image-right feature rows).
- **Layering**: Through cards with subtle shadows, surface tinting (a section with a slightly different neutral background), and z-index for navigation overlays. Editorial-style image overlap is wrong here; card-on-card stacking is the dominant layering technique.

## Rule Modulations (how base canon bends here)

- **"Texture, grain, or atmosphere" → MINIMIZED.** Soft shadows acceptable; heavy texture is not. Substitute another required quality (color semantics, designed states, type with character) to maintain the floor of four.
- **"Grid-breaking composition" → reserved for hero only.** Most of the page sits on the grid. Hero may break out for emphasis (a headline that exceeds the column width, an illustration that overflows the section edge), but feature rows and content blocks stay within the grid. (→ source: rules/web/design-quality.md)
- **"Intentional rhythm" → expressed as predictable hierarchy.** Spacing varies by hierarchy level (paragraph < block < section), not by editorial intent. The rhythm is _systematic_, not _editorial_.
- **"Designed hover, focus, active states" → required, restrained.** Hover transitions on every interactive element — color shift on links, opacity bump on buttons, border-color change on form fields. Focus-visible outlines in the brand primary. No theatrical state changes (no scale-ups, no glitch effects).
- **"Typography with character" → expressed through pairing strategy and weight discipline.** Inter alone is generic. Inter + Söhne Mono is intentional. Inter with deliberate use of optical sizing and tabular numerics is intentional. Default-Inter-everywhere is the failure mode this rule is fighting.
- **"Color used semantically" → strictly.** Brand primary, neutrals, semantic state colors (success/danger/warning). No decorative color. No "this section needs a pop of color so let's add teal." Colors earn their presence.

## Anti-patterns (what would feel wrong for THIS aesthetic)

- Cargo-culted shadcn defaults — a `border-radius: 0.5rem` button with a slate background and no styling beyond the library default. **Style the components.** Shadcn is a primitive; Corporate Clean treats it as a starting point, not a finished design. (→ source: rules/web/design-quality.md)
- The "centered hero with gradient blob behind the headline + Get Started CTA" — the most-replicated AI-generated site pattern. Avoid. Either use Stripe-quality gradient meshes (rare, intentional, brand-specific) or no gradient at all. (→ source: rules/web/design-quality.md)
- Three-feature-card-grid below the hero — the second-most-replicated pattern. If you use cards, design them: vary content layout per card, use real screenshots inside, avoid uniform 1-emoji-1-headline-1-paragraph templates. (→ source: rules/web/design-quality.md)
- Stock-photo people-pointing-at-laptops, smiling-team-photos, abstract-business-handshakes — wrong imagery. Use real product screenshots, real customer photos, or no photography at all. The Notion taxonomy entry calls "stock-style but high-quality photography" a signal — the modulation here is _high-quality_ matters more than _stock-style_. Default to real-product imagery first. (→ source: designer-toolkit:ux-writing)
- Logo-soup section ("Trusted by these companies you've heard of") that appears identical on every B2B site — this can be done well (Stripe's logo display is intentionally art-directed) or as visual filler (most other sites). If you include it, design it.
- Soft pastel hero gradients (Stripe-knockoffs that don't have Stripe's craft) — wrong color treatment. Either commit to the brand primary alone or attempt the gradient at portfolio quality.
- Multiple "secondary" brand colors competing for attention — wrong color discipline. Brand primary + neutrals + semantic; not "primary blue + secondary teal + tertiary orange + accent yellow."
- Rounded corners larger than 12px on cards — wrong material language. Corporate Clean cards typically sit at 6-12px border-radius; larger reads as consumer/playful.
- Bouncy spring animations or theatrical scroll sequences — wrong motion vocabulary. Subtle and short.
- "Lorem ipsum" or placeholder copy — automatic regeneration. (→ source: rules/web/design-quality.md, designer-toolkit:ux-writing)

## Reference Touchpoints

- **The benchmark sites**: Stripe (stripe.com — gradient mesh discipline, doc-quality typography, generous spacing), Linear (linear.app — dark-by-default option, monospace accents, smooth motion), Vercel (vercel.com — pure black-on-white minimalism, big confident typography, restraint), Notion (notion.so — warm-grey neutrals, gentle illustration system, friendly-not-playful), Resend (resend.com), Mintlify (mintlify.com), Plaid (plaid.com), Atlassian's redesign era.
- **Designers and studios**: Stripe's design team (publicly written about their craft principles), Linear's design team (Karri Saarinen's work specifically), Vercel/v0 design language. Pentagram's enterprise rebrands occasionally land here.
- **Typefaces that work**: Inter (free, the default — make it intentional via optical sizing and pairing), Söhne (paid, more refined), SF Pro (system, Apple-leaning), IBM Plex Sans (free, technical-leaning), Geist (free, Vercel-leaning), Söhne Mono / JetBrains Mono (free) for technical accents.
- **Colors that work**: Stripe purple (`oklch(60% 0.18 290)` ish), Linear electric blue (`oklch(65% 0.20 250)` ish), Vercel black-on-white (`oklch(0% 0 0)` + `oklch(100% 0 0)`), Notion warm-grey neutrals (`oklch(95-98% 0.005 80)`). Pick a brand primary that's _specific_; don't reach for generic blue.
- **Restraint references**: When in doubt, look at how Stripe handles a single section — typography, spacing, single accent, considered photography. The discipline is in the editing, not the addition.

## Citations

- Conservative scale ratio (1.6×-2.0×) → source: `ui-design:type-system`, `ui-design:visual-hierarchy`
- 8px grid + predictable rhythm → source: `ui-design:spacing-system`
- Brand primary + neutrals + semantic colors → source: `ui-design:color-system`, `design-systems:design-token`
- 150-250ms motion durations → source: `interaction-design:animation-principles`
- Soft shadows acceptable, heavy texture not → source: `rules/web/design-quality.md` (rule modulation)
- "Resist the AI baseline" framing → source: `rules/web/design-quality.md` (Anti-Template Policy)
- Designed hover/focus/active required → source: `interaction-design:feedback-patterns`
- AA contrast on neutral palettes → source: `rules/web/performance.md`
- "Don't cargo-cult shadcn" anti-pattern → source: `rules/web/design-quality.md`
- No Lorem ipsum (universal) → source: `rules/web/design-quality.md`, `designer-toolkit:ux-writing`
