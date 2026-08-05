#!/usr/bin/env node
/**
 * Asserts Lighthouse category scores against fixed budgets and fails the
 * build if any category regresses below its threshold.
 *
 * Usage: node scripts/check-lighthouse.mjs <path-to-lhr.json>
 *
 * Thresholds are set a few points under the scores this page actually
 * achieves locally (performance 100, accessibility 100, best-practices 96
 * outside this sandbox, seo 100) — enough headroom to absorb normal
 * runner-to-runner variance without masking a real regression.
 */

import { readFileSync } from 'node:fs';

const THRESHOLDS = {
  performance: 90,
  accessibility: 95,
  'best-practices': 90,
  seo: 95
};

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/check-lighthouse.mjs <path-to-lhr.json>');
  process.exit(2);
}

const report = JSON.parse(readFileSync(path, 'utf8'));
let failed = false;

console.log('\nLighthouse scores (desktop)\n');

for (const [category, min] of Object.entries(THRESHOLDS)) {
  const result = report.categories[category];
  if (!result) {
    console.error(`  FAIL  ${category.padEnd(16)} category missing from report`);
    failed = true;
    continue;
  }

  const score = Math.round(result.score * 100);
  const ok = score >= min;
  const marker = ok ? 'ok  ' : 'FAIL';
  console.log(`  ${marker}  ${category.padEnd(16)} ${score}  (minimum ${min})`);
  if (!ok) { failed = true; }
}

if (failed) {
  console.error('\nOne or more Lighthouse categories fell below its threshold.\n');
  process.exit(1);
}

console.log('\nAll Lighthouse budgets met.\n');
