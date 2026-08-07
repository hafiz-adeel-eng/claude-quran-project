# Quranly Hub — Reference Structure Analysis (Homepage)

Analysis basis: full-page mobile screenshots (top to bottom) plus the reference site's own page source (saved MHTML of `https://quranhost.com/`, section `id` attributes, heading order and nav markup) — not visual inspection alone. This is Output 1–3 of the build workflow: structure analysis, desktop layout map, mobile layout map.

## Confirmed section order (verified against source, not just screenshots)
1. Top utility bar (phone/WhatsApp, promo message, trust line, socials)
2. Sticky header (hamburger, logo, nav, Live Chat, primary CTA)
3. Hero (`id="hero"` equivalent) — eyebrow, H1, checklist, dual CTA, hero image
4. Stats bar — 4 stat tiles, dark brand-color background
5. Trust/promo banner — single wide image
6. `id="about"` — Who We Are / mission, checklist, dual CTA, supporting image
7. `id="courses"` — Featured Courses, 6-card grid, "View All Courses"
8. `id="how-it-works"` — 3-step process, CTA
9. `id="why-choose-us"` — 6 feature cards, CTA
10. `id="pricing"` — billing toggle, currency toggle, 4-tier pricing grid
11. Early Years Foundation (kids pillar content) — text block + 4 feature cards + quote + callout + image
12. Tajweed pillar content — banner image + text block + 4 feature cards + quote + callout + CTA
13. `id="testimonials"` — video testimonial + carousel **(removed in this build; see note below)**
14. Our Blog — 3-card grid, "View All Posts"
15. Final CTA banner — dark brand-color, 3 trust chips, dual CTA
16. FAQ — 5-item accordion, "See All FAQs"
17. Footer — brand block, Courses/Company/Legal/Contact columns, newsletter form, payment + security badges, copyright bar

## Testimonials section — removal note
The reference page includes `<section id="testimonials">` containing a YouTube video-testimonial player and a 6-item scrollable carousel of student quotes. Per standing project policy (see `BUILD.md` → "Review & Testimonial Section Rule"), this section was **not** recreated, copied, or replaced with invented reviews. It is represented in `index.html` by an empty, commented placeholder between the Tajweed pillar section and the Blog section, with spacing recalculated so no gap or CLS is introduced. Real testimonials can be inserted there once Quranly Hub has verified customer reviews.

## Desktop layout map (≥1024px)
- Container max-width ~1220px, centered, 20px inline padding.
- Header: single row — hamburger hidden, horizontal nav visible (7 links) + Live Chat + primary CTA button, height ~76px, sticky.
- Hero: 2-column grid (copy ~55% / image ~45%), vertically centered.
- Stats bar: 4-column grid, equal width.
- Mission section: 2-column grid (text ~45% / image ~55%, text first).
- Course grid: 3 columns on large desktop (reference), reduced to a robust 2-column grid at our 1024–1440 range with room to extend to 3 via one CSS rule if desired.
- Steps: 3-column grid.
- Feature cards: 2-column grid at tablet, holds to 2 at our target widths (reference uses 3 on very large screens).
- Pricing: 4-column grid, center two cards emphasized (Standard has a raised/featured treatment).
- Pillar sections (kids, Tajweed): 2-column grid, text column + supporting card grid column.
- Blog: 3-column grid.
- Footer: 4-column grid (brand, Courses, Company+Legal, Contact+Newsletter).

## Mobile layout map (<640px)
- Header collapses to hamburger + centered logo + Live Chat icon only (nav moves into a full-height slide-in drawer from the left, closable via backdrop tap, close button, or Escape key).
- Top utility bar wraps to 2 lines (contacts row, then promo message, then socials) — content order preserved, no items dropped.
- Hero stacks image below copy; CTAs stack full-width on very small screens, sit side-by-side from ~360px+.
- Stats bar: 2×2 grid.
- All card grids (courses, features, pricing, pillar cards, blog) collapse to a single column, full-width cards.
- Pricing toggle/currency controls wrap and center.
- A sticky bottom "Book Free Trial" bar appears only on mobile/tablet (hidden ≥1024px, since the header CTA is visible at that point) — mirrors the reference site's persistent mobile conversion pattern.
- Footer stacks to a single column; trust badges (payment/security) wrap onto multiple rows.

## Grid / spacing system carried into this build
- Section vertical rhythm: 56px top/bottom padding on mobile, 88px on desktop (`--section` padding in `styles.css`).
- Card radius: 14–22px depending on component, consistent pill-shaped buttons and badges throughout (matches the reference's consistently rounded, soft visual language).
- Two alternating background tints (`--color-bg-soft`, `--color-bg-soft-2`) are used to separate sections visually without hard borders, matching the reference's light-tint section banding.

## What was intentionally simplified for the HTML/CSS/JS prototype
- Header "Courses" and "Explore"/"Resources" dropdown mega-menus are represented as flat links (`#`) rather than full mega-menu components — flagged for a future JS enhancement or Elementor mega-menu widget once real sub-pages exist.
- Currency toggle switches the pressed state only; it does not yet recalculate displayed prices (no real pricing data exists yet to convert — see `SEO_SUMMARY.md` → "Data requiring client input").
