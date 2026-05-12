---
name: StudySphere
description: AI-powered study platform for IB and A-Level students. Curriculum-scoped, source-cited, built for the student who means business.
colors:
  depth-navy: "#080e1a"
  surface-navy: "#0f1824"
  focus-blue: "#4a90e2"
  clarity-violet: "#7b68ee"
  sky-blue: "#0ea5e9"
  go-green: "#10b981"
  signal-white: "#e2e8f0"
  dim-slate: "#94a3b8"
  alert-red: "#f87171"
  border-dim: "#ffffff14"
typography:
  display:
    fontFamily: "'Bricolage Grotesque', sans-serif"
    fontSize: "clamp(2.6rem, 5vw, 4rem)"
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Bricolage Grotesque', sans-serif"
    fontSize: "clamp(1.8rem, 3vw, 2.6rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  body:
    fontFamily: "'Hanken Grotesk', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "'Hanken Grotesk', sans-serif"
    fontSize: "0.72rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.12em"
rounded:
  none: "0px"
  full: "50%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "24px"
  lg: "48px"
  xl: "80px"
  section: "100px"
components:
  button-primary:
    backgroundColor: "{colors.focus-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.none}"
    padding: "12px 26px"
  button-primary-hover:
    backgroundColor: "#357ae8"
    textColor: "#ffffff"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.dim-slate}"
    rounded: "{rounded.none}"
    padding: "9px 20px"
  button-ghost-hover:
    textColor: "{colors.signal-white}"
  input:
    backgroundColor: "#ffffff0f"
    textColor: "{colors.signal-white}"
    rounded: "{rounded.none}"
    padding: "11px 14px"
  input-focus:
    backgroundColor: "#ffffff14"
    textColor: "{colors.signal-white}"
---

# Design System: StudySphere

## 1. Overview

**Creative North Star: "The Instrument Room"**

StudySphere's landing page is a precision instrument for students who already know what they want: an AI tutor that actually knows their curriculum. The design operates like a calibrated workspace — dark surfaces that reduce ambient distraction, deliberate light that marks exactly what matters, and zero ornamentation that doesn't earn its pixel. This is not a consumer app competing for attention. It's a tool you trust because it looks like it was built by someone who understood the problem.

The system is dark by intent: IB and A-Level students study at night, under pressure, in focused sessions. A light-blasting interface would be a lie about the context. Depth Navy (`#080e1a`) is the canvas — not pure black, but a deep navy that reads as "environment" rather than void. Surfaces float above it (Surface Navy, `#0f1824`) through tonal separation, not drop shadows. Color arrives with precision: blue for action, violet for depth, green for status, never for decoration.

Every design choice here is in service of a single claim: StudySphere knows what it's talking about. Generic = untrustworthy. If a student can look at a screen and mistake it for Quizlet, the design has failed.

**Key Characteristics:**
- Dark-by-default: Depth Navy canvas, tonal layering for hierarchy
- Sharp everywhere: 0px radius is the system doctrine; curves appear only on circles (avatars, indicators)
- Typography-led: Syne owns structural display; Outfit handles all conversational copy
- Restrained color: Focus Blue marks action, Go Green marks status, nothing else carries pigment
- Flat at rest: shadows signal interaction state, never serve as decoration

## 2. Colors: The Spatial Palette

Four depth layers and four signal colors. The dark layers create the environment; the signal colors do all communicative work.

### Primary
- **Focus Blue** (`#4a90e2`): The action color. Used on primary buttons, active nav states, section labels, focus rings, and link text. Its presence means "something can happen here." Rarity is load-bearing — when everything is blue, nothing is.

### Secondary
- **Clarity Violet** (`#7b68ee`): Secondary depth accent. Used alongside Focus Blue in gradient contexts (hero CTA button, avatar gradients). Not used solo as a primary action color.
- **Sky Blue** (`#0ea5e9`): Third voice in the three-color gradient. Appears only within Focus Blue + Clarity Violet gradient contexts. Never used as a standalone functional color.

### Tertiary
- **Go Green** (`#10b981`): Status signal only. "Beta live" badges, success confirmation states, active/online indicators. If the element is not communicating a live or confirmed state, Go Green is forbidden.

### Neutral
- **Depth Navy** (`#080e1a`): The canvas. Page background. Not black — a deeply saturated navy that reads as environment.
- **Surface Navy** (`#0f1824`): Elevated surfaces, stat strips, secondary sections. One tonal step above Depth Navy; conveys layer without shadow.
- **Signal White** (`#e2e8f0`): Primary text. All body copy, headings, and interactive text labels.
- **Dim Slate** (`#94a3b8`): Secondary text, placeholders, muted labels, nav links at rest. The quieter voice.
- **Alert Red** (`#f87171`): Form validation errors and destructive states only. Not used for emphasis.
- **Border Dim** (`#ffffff14`): Card edges, dividers, nav bottom border on dark surfaces. At 8% white opacity, it marks boundaries without competing.

**The Signal Rule.** Focus Blue, Clarity Violet, and Go Green together occupy less than 15% of any screen surface. Each has one job and stays in its lane. A screen where everything is colored is a screen where nothing is important.

## 3. Typography

**Display Font:** Bricolage Grotesque (Google Fonts, variable, 400–800)
**Body Font:** Hanken Grotesk (Google Fonts, weights 300–700)

**Character:** Bricolage Grotesque is a variable-weight geometric grotesque with optical sizing — it earns authority at large sizes without feeling cold. At 800 weight and -0.03em tracking, it reads as a precision instrument making a confident statement. Hanken Grotesk carries everything else: clean, legible at small sizes, warmer than Inter but without the brand-agency softness of Outfit or DM Sans.

### Hierarchy
- **Display** (Bricolage Grotesque, 800, `clamp(2.6rem, 5vw, 4rem)`, lh 1.06, -0.03em tracking): Hero headline, one per page.
- **Headline** (Bricolage Grotesque, 700, `clamp(1.8rem, 3vw, 2.6rem)`, lh 1.12, -0.03em tracking): Section titles and feature row headings.
- **Title** (Bricolage Grotesque, 700, `1.3–1.4rem`, lh 1.4): Card headers, signup form title, CTA sub-headings.
- **Body** (Hanken Grotesk, 400, `1rem–1.05rem`, lh 1.65–1.72): Descriptive copy, feature descriptions, testimonial text. Line length capped at 65–72ch.
- **Label** (Hanken Grotesk, 700, `0.7–0.78rem`, 0.10–0.12em letter-spacing, uppercase): Section tags, countdown labels, badge text, numbered feature markers. Always uppercase, always tracked.

**The Bricolage Lock.** Bricolage Grotesque appears only at Display, Headline, and Title roles. Hanken Grotesk handles every other typographic job: body, labels, buttons, inputs, nav links. The contrast between the two families is the system's typographic voice — collapsing it makes both fonts less effective.

## 4. Elevation

The system is flat by default. Depth is communicated through tonal surface layering — Surface Navy (`#0f1824`) sits one visible step above Depth Navy (`#080e1a`), creating section hierarchy without any shadow.

Shadows exist only as interactive state signals. Feature cards use `0 12px 32px rgba(0,0,0,0.3)` on hover to signal lift. The signup card at rest uses `0 24px 64px rgba(0,0,0,0.4)` to separate it from the hero — this is a structural elevation (it's a modal-weight form element against a full-bleed section), not decoration.

Background radial glows (`rgba(74,144,226,0.18)`, `rgba(123,104,238,0.15)`) serve as subtle environmental depth on the hero section. They are not decorative — they divide the left (copy) and right (form) hemispheres of the hero visually. They should remain below 20% opacity and never sharpen into defined shapes.

### Shadow Vocabulary
- **Hover lift** (`0 12px 32px rgba(0,0,0,0.3)`): Feature cards and interactive surfaces on hover. Signals "this moves."
- **Form elevation** (`0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)`): The hero signup card only. Structural elevation, not state-based.

**The Flat-by-Default Rule.** Surfaces sit flat at rest. A shadow that appears at rest — on a card, a section, a stat block — is decorative and forbidden. Elevation responds to interaction, never announces itself unprompted.

## 5. Components

### Buttons
Sharp and certain. 0px border-radius on all button variants. The instrument room has no rounded corners.

- **Shape:** Square corners (0px radius)
- **Primary:** Focus Blue (`#4a90e2`) background, white text, `12px 26px` padding. The current implementation uses a blue-to-violet gradient (`linear-gradient(135deg, #4a90e2, #7b68ee)`) — acceptable as a transitional state, but a solid Focus Blue primary is the preferred direction as the design matures.
- **Hover:** Slight opacity reduction (0.9) + `translateY(-2px)` lift + `0 12px 32px rgba(74,144,226,0.4)` glow. Lift replaces background shift as the primary signal.
- **Disabled:** 50% opacity, `cursor: not-allowed`. No structural change.
- **Ghost:** Transparent background, `1px solid rgba(255,255,255,0.08)` border, Dim Slate text. Hover shifts border to `rgba(255,255,255,0.2)`, text to Signal White. No fill appears.

### Chips / Badges
- **Status badge** (Go Green variant): `rgba(16,185,129,0.12)` background, `1px solid rgba(16,185,129,0.3)` border, Go Green text, 0px radius, Label typography. Used for "Beta live", active/online states.
- **Section eyebrow** (Focus Blue variant): `rgba(74,144,226,0.09)` background, `1px solid rgba(74,144,226,0.22)` border, Focus Blue text, Label typography. Sits above section headlines as a category marker.

### Cards / Containers
- **Feature cards:** `rgba(255,255,255,0.04)` background (Border Dim opacity level), `1px solid rgba(255,255,255,0.08)` border, 0px radius, `28px 24px` padding. Hover: border shifts to `rgba(74,144,226,0.3)`, `translateY(-3px)` lift, `0 12px 32px rgba(0,0,0,0.3)` shadow.
- **Stat/counter containers:** `rgba(74,144,226,0.08)` background, `1px solid rgba(74,144,226,0.2)` border, 0px radius. Focus-Blue-tinted surfaces for data display.
- **Countdown units:** `rgba(255,255,255,0.04)` background, `1px solid rgba(255,255,255,0.08)` border, 0px radius, `10px 16px` padding, `font-variant-numeric: tabular-nums`.
- **No nested cards.** If a container is already inside a section with a surface background, its children are not cards — they are list items or text blocks.

### Inputs / Fields
- **Style:** `rgba(255,255,255,0.06)` background, `1px solid rgba(255,255,255,0.1)` border, 0px radius, `11px 14px` padding, Outfit 400 `0.9rem`, Signal White text, Dim Slate placeholder.
- **Focus:** border-color shifts to `rgba(74,144,226,0.5)`, background lifts to `rgba(255,255,255,0.08)`. No glow ring — the border shift is sufficient.
- **Error:** `rgba(248,113,113,0.08)` background, `1px solid rgba(248,113,113,0.2)` border, Alert Red inline message below the field in Label typography.

### Navigation
- **Style:** Fixed, `rgba(8,14,26,0.85)` background, `backdrop-filter: blur(16px)`, `1px solid rgba(255,255,255,0.08)` bottom border, 60px height.
- **Links at rest:** Dim Slate, Outfit 500 `0.9rem`. Hover: Signal White. No underline, no colored active state in the nav itself.
- **Actions:** Ghost button (sign in) + Primary button (join waitlist) at right edge.
- **Mobile:** Nav links collapse below 900px. Only logo and action buttons persist.

### Signup Form Card (Signature Component)
The hero signup card is the most important element on the landing page. It must feel like a professional form, not a floating panel.

- **Current state:** `rgba(255,255,255,0.04)` background, `1px solid rgba(255,255,255,0.1)` border, `border-radius: 20px`, `backdrop-filter: blur(20px)`, form elevation shadow. This is the one instance of glassmorphism in the system and is flagged for removal in the next design pass (see Do's and Don'ts).
- **Target state:** Solid Surface Navy (`#0f1824`) background, `1px solid rgba(255,255,255,0.1)` border, 0px radius (Sharp Edge Doctrine), form elevation shadow. No backdrop-filter.

## 6. Do's and Don'ts

### Do:
- **Do** use Syne at Display and Headline roles only. Every other typographic role — body, labels, buttons, form elements — is Outfit.
- **Do** apply 0px border-radius to all interactive and container elements: buttons, inputs, badges, countdown units, feature cards. Curves appear only on circles (avatar initials, status dot).
- **Do** use Go Green (`#10b981`) exclusively for live/active/confirmed status. If the element isn't communicating a state, the color is wrong.
- **Do** keep background hero glows at or below 18% opacity and ensure they remain soft (blur radius ≥ 80px). Their job is to divide the hero layout, not to decorate it.
- **Do** make Focus Blue appear on ≤15% of any screen surface. When everything is blue, nothing is actionable.
- **Do** use tonal surface layering (Depth Navy → Surface Navy) to indicate section depth. Shadows respond to interaction state only.
- **Do** cite sources visually. Past paper references, chunk sources, and citations are first-class UI elements — use Label typography with Dim Slate text and a Border Dim container. They are the proof of honesty.

### Don't:
- **Don't** use glassmorphism — `backdrop-filter: blur()` combined with translucent card backgrounds. Per the anti-references in PRODUCT.md, this is an AI product cliché. The current signup card (`backdrop-filter: blur(20px)`, `rgba(255,255,255,0.04)` bg) is a known violation flagged for removal. Replace with a solid Surface Navy container.
- **Don't** use gradient text — `background-clip: text` with a gradient fill. The current `.wl-grad` class is a known violation. Use a single solid color for emphasis. Syne at 800 weight on a dark background provides sufficient visual authority without gradients.
- **Don't** use bright primary colors, quiz-game aesthetics, progress bars, or confetti-style animations. StudySphere does not look like Quizlet or Khan Academy.
- **Don't** place a hero chatbox ("Ask me anything") as the primary landing element. The AI capability is real and curriculum-scoped — demonstrate it through feature copy and cited examples, not a generic open-ended prompt box.
- **Don't** add floating neural-net orbs, glowing neon accents, or purple-to-black gradient hero sections. These are the visual vocabulary of generic AI products, not a precision instrument.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards or list items. Use a full border, background tint, or nothing.
- **Don't** nest cards. If a feature card contains content items, those items are typography blocks — not sub-cards with their own borders and radii.
- **Don't** animate layout properties (height, top, left, width). Transitions use `transform` and `opacity` only. Easing is always ease-out; no bounce, no elastic.
