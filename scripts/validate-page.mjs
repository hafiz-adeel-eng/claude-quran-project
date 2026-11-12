#!/usr/bin/env node
/**
 * Structural, SEO and accessibility invariants for the QuranlyHub landing page.
 *
 * Complements html-validate (which checks markup correctness) by asserting the
 * things specific to this page that silently rot when the HTML is edited:
 * schema/on-page FAQ parity, resolvable anchors, present assets, defined icon
 * references, one H1, and labelled form controls.
 *
 * Zero dependencies — runs on any Node 18+ with `node scripts/validate-page.mjs`.
 * Exits non-zero on the first failing invariant so CI goes red.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const failures = [];
const notes = [];

/** Record a failed invariant. */
function check(label, ok, detail = '') {
  if (ok) {
    notes.push(`  ok    ${label}`);
  } else {
    failures.push(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

const all = (re, source = html) => [...source.matchAll(re)];

/* ------------------------------------------------------------------ *
 * 1 · JSON-LD parses and carries the entity types the page relies on
 * ------------------------------------------------------------------ */
const ldBlocks = all(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
  .map((m) => m[1]);

check('exactly one JSON-LD block', ldBlocks.length === 1, `found ${ldBlocks.length}`);

let graph = [];
try {
  graph = JSON.parse(ldBlocks[0])['@graph'] ?? [];
  check('JSON-LD parses', true);
} catch (error) {
  check('JSON-LD parses', false, error.message);
}

const typesOf = (node) => [node['@type']].flat();
const hasType = (type) => graph.some((node) => typesOf(node).includes(type));

for (const type of [
  'EducationalOrganization', 'Organization', 'LocalBusiness',
  'WebSite', 'WebPage', 'BreadcrumbList', 'Service',
  'OfferCatalog', 'FAQPage'
]) {
  check(`schema declares ${type}`, hasType(type));
}

const catalog = graph.find((node) => typesOf(node).includes('OfferCatalog'));
const courses = catalog?.itemListElement ?? [];
check('OfferCatalog holds Course entities', courses.length > 0, `found ${courses.length}`);
check(
  'every Course has name, url, provider and offers',
  courses.every((c) => c.name && c.url && c.provider && c.offers),
  'a Course entity is missing a required property'
);

/* ------------------------------------------------------------------ *
 * 2 · FAQ schema matches the visible page, question for question
 *     Mismatched FAQ markup is a structured-data policy violation.
 * ------------------------------------------------------------------ */
const faqNode = graph.find((node) => typesOf(node).includes('FAQPage'));
const schemaQuestions = (faqNode?.mainEntity ?? []).map((q) => q.name);
const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const pageQuestions = all(/<summary><span>([\s\S]*?)<\/span>/g).map((m) => decode(m[1].trim()));

check(
  'FAQ count matches between schema and page',
  schemaQuestions.length === pageQuestions.length && schemaQuestions.length > 0,
  `schema ${schemaQuestions.length}, page ${pageQuestions.length}`
);

const missingOnPage = schemaQuestions.filter((q) => !pageQuestions.includes(q));
const missingInSchema = pageQuestions.filter((q) => !schemaQuestions.includes(q));
check('every schema question appears on the page', missingOnPage.length === 0, missingOnPage.join(' | '));
check('every page question appears in schema', missingInSchema.length === 0, missingInSchema.join(' | '));

/* ------------------------------------------------------------------ *
 * 3 · Exactly one H1
 * ------------------------------------------------------------------ */
const h1Count = all(/<h1[\s>]/g).length;
check('page has exactly one <h1>', h1Count === 1, `found ${h1Count}`);

/* ------------------------------------------------------------------ *
 * 4 · Every in-page anchor resolves to a real id
 * ------------------------------------------------------------------ */
const ids = new Set(all(/\sid="([^"]+)"/g).map((m) => m[1]));
const anchors = [...new Set(all(/href="#([^"]+)"/g).map((m) => m[1]))];
const brokenAnchors = anchors.filter((a) => !ids.has(a));
check('all in-page anchors resolve', brokenAnchors.length === 0, brokenAnchors.join(', '));

/* ------------------------------------------------------------------ *
 * 5 · Every <use> points at a defined <symbol>
 * ------------------------------------------------------------------ */
const symbols = new Set(all(/<symbol id="([^"]+)"/g).map((m) => m[1]));
const used = new Set(all(/<use href="#([^"]+)"/g).map((m) => m[1]));
const undefinedIcons = [...used].filter((i) => !symbols.has(i));
const unusedIcons = [...symbols].filter((i) => !used.has(i));
check('no icon references a missing symbol', undefinedIcons.length === 0, undefinedIcons.join(', '));
check('no unused icon symbols ship', unusedIcons.length === 0, unusedIcons.join(', '));

/* ------------------------------------------------------------------ *
 * 6 · Local assets referenced by the page exist on disk
 * ------------------------------------------------------------------ */
const localAssets = [...new Set(
  all(/(?:href|src)="(?!https?:|mailto:|tel:|#|\/\/)([^"]+)"/g)
    .map((m) => m[1])
    .filter((p) => /\.(css|js|svg|png|jpe?g|webp|avif|ico)$/i.test(p))
)];
const missingAssets = localAssets.filter((p) => !existsSync(join(root, p.replace(/^\//, ''))));
check('all referenced local assets exist', missingAssets.length === 0, missingAssets.join(', '));

/* ------------------------------------------------------------------ *
 * 7 · Every form control carries a matching <label for>
 * ------------------------------------------------------------------ */
const controlIds = all(/<(?:input|select|textarea)[^>]*\sid="([^"]+)"/g).map((m) => m[1]);
const labelFor = new Set(all(/<label for="([^"]+)"/g).map((m) => m[1]));
const unlabelled = controlIds.filter((id) => !labelFor.has(id));
check('every form control has a label', unlabelled.length === 0, unlabelled.join(', '));

/* ------------------------------------------------------------------ *
 * 8 · Canonical, title and meta description are present and sane
 * ------------------------------------------------------------------ */
const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? '';
const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
check('has a canonical link', /<link rel="canonical" href="https?:\/\/[^"]+"/.test(html));
check('title is 15-70 characters', title.length >= 15 && title.length <= 70, `${title.length} chars`);
check('meta description is 70-165 characters', description.length >= 70 && description.length <= 165, `${description.length} chars`);

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */
console.log('\nQuranlyHub page invariants\n');
console.log(notes.join('\n'));

if (failures.length) {
  console.error(`\n${failures.join('\n')}\n`);
  console.error(`${failures.length} invariant(s) failed.\n`);
  process.exit(1);
}

console.log(`\nAll ${notes.length} invariants passed.\n`);
