# Quranly Hub — Website Reconstruction Prototype

Original, non-copied HTML/CSS/JS reconstruction of the Quranly Hub homepage, built using `quranhost.com` only as a structural/UX reference (layout hierarchy, spacing rhythm, section order) per the project brief. No branding, copy, images, or code were copied from the reference site.

## What's in this phase
This delivers **Output 4 (Local HTML Code Package)** plus the supporting documentation outputs from the project brief, scoped to the **homepage only**:

| File | Purpose |
|---|---|
| `index.html` | Homepage markup — semantic HTML5, Elementor-mappable sections |
| `assets/css/styles.css` | All styling — CSS custom properties, mobile-first Flexbox/Grid |
| `assets/js/main.js` | Mobile nav drawer, FAQ accordion, pricing/currency toggles, newsletter form stub |
| `STRUCTURE_ANALYSIS.md` | Output 1–3: reference structure audit, desktop layout map, mobile layout map |
| `SEO_SUMMARY.md` | Output 5: meta fields, schema, keyword mapping, internal linking, EEAT/AEO notes |
| `IMAGE_SPECIFICATIONS.md` | Output 6: technical spec for every image placeholder (no layout shift on swap-in) |
| `IMAGE_PROMPTS.md` | Output 7: one unique AI-image / illustrator prompt per placeholder |
| `QA_REPORT.md` | Output 10: final QA — automated browser checks actually run, plus code-level accessibility/performance/SEO review |
| `README.md` | Output 8–9: this file — local testing instructions and folder structure overview |

## Local testing instructions
No build step or dependencies required.

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

Or simply double-click `index.html` to open it directly in a browser (all asset paths are relative).

**What to check while reviewing:**
- Resize the browser window (or use device toolbar) through mobile → tablet → desktop and confirm no horizontal scrollbar appears at any width.
- Click the hamburger icon on mobile widths to confirm the nav drawer opens/closes (backdrop click, close button, and `Esc` all work).
- Click through the FAQ accordion — only one answer should stay open at a time.
- Toggle Monthly/Yearly and the currency buttons in the Pricing section.
- Anything with a dashed amber outline (`.needs-input` class) is a placeholder for real business data — see `SEO_SUMMARY.md` → "Data requiring client input" for the complete list before this goes live.
- Anything inside a dashed teal box labeled "Placeholder: ..." is an image placeholder — see `IMAGE_SPECIFICATIONS.md` / `IMAGE_PROMPTS.md`.

## Folder structure
```
claude-quran-project/
├── index.html
├── assets/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   └── main.js
│   └── icons/            (reserved — all current icons are inline SVG, no files needed yet)
├── STRUCTURE_ANALYSIS.md
├── SEO_SUMMARY.md
├── IMAGE_SPECIFICATIONS.md
├── IMAGE_PROMPTS.md
├── QA_REPORT.md
└── README.md
```

## Brand tokens (for Elementor / design-system handoff)
Defined as CSS custom properties at the top of `assets/css/styles.css`:
- Primary: `#14B8A6` (teal) — never the competitor's green.
- Accent: `#EAB308` (gold)
- Background: white / soft teal tints (`#F0FDFA`, `#ECFDF5`)
- Text: `#1F2937` (dark gray)
- Headings: Playfair Display · Body: Inter

## Next phases (not built yet — flag if you want these started)
1. Swap in real images per `IMAGE_SPECIFICATIONS.md` and fill every `[Add ...]` data placeholder.
2. Build remaining pages using the same design system: Adults, Kids, Female Teachers, Tajweed, Hifz, Arabic, Free Trial landing, About, Contact, Blog index + articles.
3. Build the 8 location landing pages (UK, USA, Canada, Australia, UAE, Qatar, Kuwait, Saudi Arabia) per the keyword map in the project brief.
4. Wire the booking CTA, newsletter form, and Live Chat to real backends.
5. Convert sections into Elementor containers/widgets for the WordPress build once this HTML prototype is approved.
6. Run a live Lighthouse/PageSpeed pass and a manual screen-reader QA pass once hosted.
