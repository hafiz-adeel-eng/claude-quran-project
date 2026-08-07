# Quranly Hub — Homepage SEO & Content Summary

## Search intent
Primary intent for the homepage is **commercial investigation / navigational** (a visitor comparing online Quran academies or arriving directly at the brand), with supporting **informational** intent served by the Early Years Foundation and Tajweed pillar content blocks and the FAQ section.

## Rank Math field set
| Field | Value |
|---|---|
| Focus Keyword | `online quran classes` |
| Secondary Keywords | learn quran online, online quran academy, quran lessons online, quran courses online |
| SEO Title | Learn Quran Online with Certified Tutors \| Quranly Hub |
| Meta Title | Learn Quran Online with Certified Tutors \| Quranly Hub |
| Meta Description | Learn Quran online with Quranly Hub. 1-on-1 live classes with certified male and female Quran tutors for kids, adults and reverts. Book your free trial class today. |
| URL Slug | `/` (homepage) |
| H1 | Learn the Quran Online with Certified Quran Tutors |
| Canonical URL | https://www.quranlyhub.com/ |
| Open Graph Title | Learn Quran Online with Certified Tutors \| Quranly Hub |
| Open Graph Description | 1-on-1 live online Quran classes with certified male and female tutors for kids, adults, reverts and families. Book a free trial class today. |
| OG Image Placeholder | `/assets/images/og-cover.jpg` (see IMAGE_PROMPTS.md #15) |
| Twitter Card | summary_large_image |
| Breadcrumb Title | Home |
| Target Rank Math Score | 80+ |

## H2 structure (in page order)
1. Who We Are — Our Mission
2. Our Featured Courses
3. How It Works
4. Why Choose Quranly Hub
5. Pricing Plans
6. When Should Children Start Learning the Quran? (Early Years Foundation)
7. Best Online Quran Classes with Tajweed
8. Latest Quran Learning Articles & Guides
9. Start Your Quranic Journey Today (CTA)
10. Frequently Asked Questions

Single `<h1>` confirmed; all section headings use semantic `<h2>`/`<h3>` in document order (verified in Technical Audit, see `QA_REPORT.md`).

## JSON-LD structured data implemented
- `EducationalOrganization` — name, url, description, `areaServed` (the 8 target countries).
- `FAQPage` — mirrors the 5 visible FAQ accordion items verbatim, so answers stay consistent for AI Overviews / AEO.
- `ItemList` of 6 `Course` entries (one per featured course card) — each with a `CourseInstance` (online, 30-minute sessions, weekly ×16) and an `Offer` at the confirmed flat rate ($40 USD/month), now that real pricing/duration data exists.

**Not yet implemented (needs real data before launch):** `AggregateRating` (no verified rating yet), `LocalBusiness`/`Organization.telephone` (phone number is a placeholder — adding a fabricated number to schema would be a structured-data integrity risk).

## AEO / GEO readiness
- FAQ section gives concise, directly quotable answers (1–2 sentences each) so AI answer engines can cite them without paraphrasing risk.
- Early Years Foundation and Tajweed sections each open with a direct-answer paragraph before expanding — a pattern AI Overviews and Perplexity-style engines favor.
- Content avoids absolute superlatives ("the best," "#1") without evidence, keeping claims verifiable and EEAT-safe.

## EEAT signals present vs. pending
**Present:** clear teaching methodology descriptions, structured course catalogue, transparent free-trial mechanics, FAQ transparency, legal-policy footer links (pages themselves still need to be authored).
**Pending client input (do not fabricate):** tutor qualification/Ijazah details, specific years in operation, verified student/country counts, verified review rating, real contact phone/WhatsApp numbers, real pricing figures.

## Data requiring client input before launch
Every instance below is marked `class="needs-input"` in `index.html` so it's visually flagged in-browser during review:
- Stats bar: rating value, student count, certified-tutor percentage (country count of "8" is safe — it's the client's own stated target-market list).
- Trust banner: founding year / years of operation.
- Mission checklist: years of dedicated Quranic education.
- Course cards: enrollment counts, ratings (×6 cards) — duration (30 min/session) and price ($40/month, 16 classes) are now confirmed and filled in.
- Pricing: confirmed flat rate — $40/month, 16 classes/month, 30 minutes/class, same price across every course.
- Blog cards: publish dates (×3).
- Top bar / footer: phone number, WhatsApp number.
- Footer credit line: agency/developer name.

## Internal linking implemented on this page
- Hero → `#courses` (Explore Our Courses)
- Mission copy → `#courses` (Quran Foundation, inline)
- Mission actions → `#courses`, About Us placeholder
- Why Choose Us → `#courses` (Our courses, inline)
- Kids pillar ↔ Tajweed pillar are adjacent, reinforcing topical relationship for crawlers
- Footer Courses column → anchors into `#courses` (placeholder until individual course pages exist)

## Internal linking recommended once sub-pages exist
Homepage → Adults page, Kids page, Tajweed page, Hifz page, Arabic page, Female Teachers page, Free Trial landing page, Blog index, Contact page, and per-country location pages (UK/US/Canada/Australia/UAE/Qatar/Kuwait/Saudi Arabia). Use descriptive anchor text matching each page's focus keyword (e.g., "online Quran classes for kids," not "click here").

## Content originality note
All homepage copy was written fresh for Quranly Hub. The reference site (quranhost.com) was used only to understand section purpose, order, and approximate word-count so the layout wouldn't break — no sentences, taglines, or statistics were copied. See `QA.md` acceptance criteria in the project brief for the standing rule this follows.
