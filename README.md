# QuranlyHub — Landing Page

Production-ready homepage for **QuranlyHub**, an online Quran academy offering live
one-to-one classes. Built as three static files with no build step, no framework and
no runtime dependencies, so it drops straight into a WordPress theme, a static host,
or a page builder.

```
index.html     Semantic HTML5, inline SVG icon sprite, JSON-LD @graph
style.css      Token-driven CSS, mobile-first, ~1,100 lines
script.js      Vanilla JS progressive enhancement, ~6 KB unminified
favicon.svg
```

---

## 1 · Before you publish — required replacements

The page is complete and shippable, but these items are **sample data written to
demonstrate structure**. Publishing them as-is would misrepresent the business and,
for the review markup, breaches Google's structured-data policy.

| Location | What to replace | Why it matters |
|---|---|---|
| `.stats` (Trust section) | 5,000+ students · 60+ tutors · 250,000+ classes · 4.9/5 | Must be verifiable claims |
| Testimonials section | All six reviews | Use real, permission-cleared quotes only |
| `aggregateRating` in JSON-LD | `ratingValue` / `reviewCount` | **Unverified review markup risks a manual action.** Delete the property entirely until you have genuine reviews |
| Student Success section | All three case studies | Get written consent before publishing student outcomes |
| Teachers section | Role cards → real names, photos, ijazah/institution | Named experts carry far more E-E-A-T weight than generic cards |
| Pricing section | $39 / $55 / $79 tiers | Confirm final prices, then keep the `Offer` schema in sync |
| `og:image` + `/assets/quranlyhub-logo.png` | Add real 1200×630 share image and logo | Currently 404s |
| `sameAs` in JSON-LD | Facebook / Instagram / YouTube URLs | Remove any profile that doesn't exist |

Also: a **second support email was requested but never supplied**, so `info@quranlyhub.com`
is used site-wide. Add the second address to the footer and `contactPoint` when you have it.

---

## 2 · SEO strategy behind the copy

### Keyword map by section

| Section | Intent | Primary target | Supporting terms |
|---|---|---|---|
| Hero (H1) | Transactional | online Quran classes, certified Quran teacher | one-to-one, live, free trial |
| Trust | Commercial investigation | best online Quran academy | certified, ijazah, verified |
| Why Choose | Commercial | why choose online Quran classes | progress reports, flexible timings |
| Courses | Commercial + informational | Noorani Qaida online, Quran with tajweed, online hifz classes | nazra, tafsir, Arabic reading |
| Process | Informational | how do online Quran classes work | book a trial, time zone |
| Teachers | E-E-A-T | female Quran teacher online, male Quran tutor | ijazah, hafiz, alim |
| Countries | Local/geo | online Quran classes UK / USA / Canada / Australia / UAE | GMT, EST, GST time zones |
| Pricing | Transactional | online Quran classes cost, Quran classes price per month | sibling discount, no registration fee |
| FAQ | Question / voice / AEO | how much do online Quran classes cost, is the trial free | answer-first blocks |
| Blog | Topical authority | how to choose an online Quran academy | cluster entry points |

### Entity coverage

Noorani Qaida · Nazra · Tajweed (makharij, sifat, ghunnah, idgham, ikhfa, iqlab, qalqalah,
madd) · Hifz (sabaq, sabqi, manzil) · Tafsir · Juz Amma · mushaf · ijazah · Hafs an Asim ·
salah · wudu · duas · seerah · Zoom/Google Meet/Skype · eight target countries and their
time zones. These give AI engines concrete, citable nouns rather than generic prose.

### AEO / GEO tactics applied

- **Answer-first FAQs** — every answer opens with a bolded direct sentence that can be
  lifted verbatim into an AI Overview or chat answer.
- **Comparison table** — "Which course should you start with?" is structured for extraction.
- **Explicit numbers** — timelines (3–6 months for Qaida), prices, class lengths and
  class counts give models specific facts to cite.
- **Schema/on-page parity** — all 12 FAQ answers exist in both the visible HTML and the
  `FAQPage` markup, verified programmatically.
- **Definitional opener** — "QuranlyHub is an online Quran academy that…" matches the
  phrasing LLMs prefer when answering "what is X".

### Structured data shipped

`EducationalOrganization` + `Organization` + `LocalBusiness` (single node) · `WebSite`
(with `SearchAction`) · `WebPage` · `BreadcrumbList` · `Service` · `OfferCatalog`
containing **8 `Course` entities** · `FAQPage` with **12 questions**.

Validate at [validator.schema.org](https://validator.schema.org/) and Google's
Rich Results Test after your replacements.

---

## 3 · Performance

| Decision | Effect |
|---|---|
| Icons as an inline SVG `<symbol>` sprite | Zero icon requests; no Font Awesome/Lucide CDN payload |
| Fonts loaded non-blocking (`media="print"` swap) with `<noscript>` fallback | Fonts never block first render |
| `content-visibility: auto` on below-fold sections | Cuts initial layout and paint cost |
| Animations restricted to `transform` / `opacity` | Compositor-only, no layout thrash |
| Scroll handlers batched into `requestAnimationFrame`, listeners `passive` | Protects INP |
| Reveal animations skip anything already on screen | LCP element never starts at `opacity: 0` |
| No images, no framework, no jQuery | Nothing to lazy-load or hydrate |
| Explicit min-heights on placeholders | CLS stays at 0 |

Swap the placeholder blocks for real images using `loading="lazy"`, `decoding="async"`,
explicit `width`/`height`, and AVIF/WebP.

## 4 · Accessibility

Skip link · one `<h1>` with an ordered heading tree · landmark elements · visible
`:focus-visible` rings · 46 px+ touch targets · every input labelled · errors linked via
`aria-describedby` · `role="status"` live regions on both forms · focus trap and Escape
handling in the mobile drawer · `prefers-reduced-motion` and `forced-colors` support ·
wide tables scroll in their own container, never the page.

## 5 · Conversion features

Sticky header with a permanent CTA · announcement bar with urgency · **hero lead form
above the fold** · second full form in the closing CTA band · floating WhatsApp button
(pre-filled message) · mobile sticky action bar · trust badges, stats and social proof ·
featured middle pricing tier for anchoring · risk reversal repeated at every CTA
("no card, no registration fee, cancel anytime").

## 6 · Wiring up the forms

Both forms are handled by `leadForms()` in `script.js`. Replace the placeholder
`sendLead()` transport with your real endpoint:

```js
return fetch('/wp-json/quranlyhub/v1/lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': window.qhNonce },
  body: JSON.stringify(payload)
}).then(function (r) { if (!r.ok) { throw new Error('Request failed'); } });
```

Field names are already CRM-ready: `name`, `email`, `whatsapp`, `country`, `course`,
`student_type`, `teacher_preference`, `message`. A honeypot field named `website` is
included and stripped from the payload. A `free_trial_lead` event is pushed to
`window.dataLayer` when a tag manager is present.

Prefer a plugin? Swap either `<form>` for a Contact Form 7 or WPForms shortcode —
nothing else depends on it.

## 7 · WordPress notes

- Every section is self-contained and maps cleanly to a block pattern or ACF flexible layout.
- All colour, spacing, radius and shadow values come from CSS custom properties in `:root`
  — mirror them in `theme.json` to drive the block editor from the same tokens.
- Class names are BEM-ish and prefixed by component, so they won't collide with theme CSS.
- Internal links already point at the future URL structure below; create the pages and
  the link graph works immediately.

```
/about/                              /kids-quran-classes/
/courses/                            /adult-quran-classes/
/courses/noorani-qaida/              /female-quran-teachers/
/courses/quran-reading-nazra/        /male-quran-teachers/
/courses/quran-with-tajweed/         /pricing/
/courses/hifz-quran-memorization/    /blog/
/courses/quran-translation-tafsir/   /contact/
/courses/islamic-studies/            /privacy-policy/
/courses/arabic-reading/             /terms-and-conditions/
```

## 8 · Local preview

```bash
python3 -m http.server 8000
# → http://localhost:8000
```
