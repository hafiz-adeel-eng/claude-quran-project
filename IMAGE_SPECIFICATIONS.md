# Quranly Hub — Homepage Image Specifications

Technical specification for every `.image-placeholder` element in `index.html`. Use this sheet to brief a designer/illustrator or an AI image tool without causing layout shift (CLS) when real assets are dropped in.

**Global rules for every image below**
- Format: export as WebP (primary) with a JPEG fallback; SVG only for `og-cover` is not required (raster preferred for OG).
- `loading="lazy"` on every image except the hero image, which should be `loading="eager"` / `fetchpriority="high"` (LCP element).
- All images must include the `alt` text specified below when the placeholder `<div>` is replaced with a real `<img>`.
- Object-fit: `cover` unless noted.
- Max file size target: 180 KB (hero/banner images), 120 KB (course/blog cards).
- Do not upload stock photography, AI-generated faces resembling real identifiable people, or any asset carrying a third-party watermark/brand.

| ID | Section | Desktop (W×H) | Mobile (W×H) | Aspect | Format | Max Size | Loading | Alt Text |
|---|---|---|---|---|---|---|---|---|
| `hero-tutor-portrait` | Hero | 640×480 | 375×281 | 4:3 | WebP/JPG | 180 KB | eager (LCP) | "Certified Quranly Hub tutor teaching a student in a live online Quran class" |
| `trust-banner-mission` | Trust banner (below stats bar) | 1200×514 | 375×161 | 21:9 | WebP/JPG | 180 KB | lazy | "Quranly Hub — trusted online Quran and Arabic academy" |
| `mission-tutor-student` | Who We Are / mission | 560×420 | 375×281 | 4:3 | WebP/JPG | 150 KB | lazy | "Online Quran tutor guiding a student through a lesson on a laptop" |
| `course-qaida-foundation` | Featured Courses | 400×300 | 335×251 | 4:3 | WebP/JPG | 120 KB | lazy | "Child learning Arabic letters with the Qaida Noorania method" |
| `course-tajweed-reading` | Featured Courses | 400×300 | 335×251 | 4:3 | WebP/JPG | 120 KB | lazy | "Student practising Quran recitation with Tajweed on a video call" |
| `course-hifz-memorization` | Featured Courses | 400×300 | 335×251 | 4:3 | WebP/JPG | 120 KB | lazy | "Student memorising Quran verses during an online Hifz class" |
| `course-tafseer` | Featured Courses | 400×300 | 335×251 | 4:3 | WebP/JPG | 120 KB | lazy | "Tafseer-ul-Quran online class studying verse meaning and context" |
| `course-advanced-tajweed` | Featured Courses | 400×300 | 335×251 | 4:3 | WebP/JPG | 120 KB | lazy | "Advanced Tajweed lesson covering articulation and recitation rules" |
| `course-arabic-language` | Featured Courses | 400×300 | 335×251 | 4:3 | WebP/JPG | 120 KB | lazy | "Student learning conversational and Quranic Arabic online" |
| `kids-early-years-portrait` | Early Years Foundation (kids) | 560×420 | 375×281 | 4:3 | WebP/JPG | 150 KB | lazy | "Young child wearing a headset during an online Quran class" |
| `tajweed-pillar-banner` | Tajweed pillar section | 1200×514 | 375×161 | 21:9 | WebP/JPG | 180 KB | lazy | "Open Quran, notebook and laptop set up for a Tajweed lesson" |
| `blog-daily-habit` | Blog | 400×300 | 335×251 | 4:3 | WebP/JPG | 100 KB | lazy | "Illustration for article: 5 Simple Ways to Build a Daily Quran Habit" |
| `blog-choosing-tutor` | Blog | 400×300 | 335×251 | 4:3 | WebP/JPG | 100 KB | lazy | "Illustration for article: A Parent's Guide to Choosing an Online Quran Tutor" |
| `blog-tajweed-mistakes` | Blog | 400×300 | 335×251 | 4:3 | WebP/JPG | 100 KB | lazy | "Illustration for article: Understanding Tajweed — Common Mistakes Beginners Make" |
| `og-cover` | `<head>` Open Graph / Twitter Card | 1200×630 | — | 1.91:1 | JPG | 300 KB | n/a | "Quranly Hub — Learn Quran Online with Certified Tutors" |

## Shared visual system (applies to every illustration)

- **Illustration style:** flat/semi-flat vector illustration with soft gradients — consistent across all 15 assets so the site reads as one system. (Do not mix flat-vector with photographic style.)
- **Primary color:** `#14B8A6` (teal). **Accent color:** `#EAB308` (gold). **Background tint:** `#F0FDFA`.
- **Composition:** generous negative space around the subject so text/UI never overlaps a face or focal point; subject weighted to the right on hero/hero-like banners (`hero-tutor-portrait`, `trust-banner-mission`, `tajweed-pillar-banner`) to leave room for left-aligned copy on desktop.
- **People:** depict modest dress consistent with Islamic norms (hijab for female figures/students, no exposed hair on adult female subjects); mixed representation of children and adults across the set; no identifiable real individuals.
- **Decorative motifs:** subtle geometric Islamic patterning (8-point star / arabesque line work) permitted as background texture at low opacity — never as the dominant element.
- **Negative space / safe area:** keep a 6% padding margin on all sides free of critical detail so cards can crop slightly on small breakpoints without losing the subject.
- **Border radius on render:** `22px` desktop, `16px` mobile (matches `--radius-lg` / card tokens in `styles.css`) — export images square-cornered; radius is applied via CSS, not baked into the asset.
- **Transparent background:** No (all placeholders sit on solid/tinted card backgrounds) — except icons, which are inline SVG (see `assets/icons/` note below) and are transparent by definition.

## Icons

All UI icons (checkmarks, stars, calendar, etc.) are inline SVG in `index.html` — no icon image files are required. This avoids extra HTTP requests and keeps the Best Practices / Performance score high. If a brand icon set is introduced later, keep strokes at `2px` and the same rounded line-cap style used throughout.

## Outstanding data note

Statistics referenced near some images (rating, student counts, years of operation) are marked `[Add ...]` directly in `index.html` and are **not** part of this image spec — see `SEO_SUMMARY.md` → "Data Requiring Client Input" for the full list.
