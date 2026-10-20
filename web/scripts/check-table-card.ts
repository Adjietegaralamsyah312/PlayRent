/**
 * Self-check for the DataTable mobile-card rules (F06 + F07) and the tab/panel
 * ARIA contract (M-A).
 * Run: node scripts/check-table-card.ts   (Node ≥ 23 strips the types)
 * No dependencies, no test runner: a failed check throws and exits non-zero.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rowName, selectCardColumns, UNIT_CARD_LAYOUT } from '../src/lib/table-card.ts';

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    process.stdout.write(`ok   ${name}\n`);
  } else {
    failures += 1;
    process.stdout.write(`FAIL ${name}\n       expected ${e}\n       actual   ${a}\n`);
  }
}

// ── F07: card slots ─────────────────────────────────────────────────────────
const sessionsCols = [
  { key: 'console', primary: true },
  { key: 'status' },
  { key: 'ends', prominentOnMobile: true },
  { key: 'started', hideOnMobile: true },
  { key: 'duration', hideOnMobile: true },
];
const sessions = selectCardColumns(sessionsCols);
check('F07 primary column is the primary', sessions.primary.key, 'console');
check('F07 prominent value is the "ends" timer', sessions.prominent?.key, 'ends');
check('F07 card body drops primary, prominent and hidden columns', sessions.cardCols.map((c) => c.key), ['status']);

const txCols = [
  { key: 'number', primary: true },
  { key: 'customer' },
  { key: 'at', hideOnMobile: true },
  { key: 'method' },
  { key: 'payment' },
  { key: 'total', prominentOnMobile: true },
];
const tx = selectCardColumns(txCols);
check('F07 transaction total is the prominent value', tx.prominent?.key, 'total');
check('F07 transaction card body = pelanggan, metode, pembayaran', tx.cardCols.map((c) => c.key), ['customer', 'method', 'payment']);

const manyCols = [
  { key: 'a', primary: true },
  { key: 'b' },
  { key: 'c' },
  { key: 'd' },
  { key: 'e' },
];
check('F07 card body is capped at 3 rows', selectCardColumns(manyCols).cardCols.map((c) => c.key), ['b', 'c', 'd']);

const hiddenProminent = selectCardColumns([
  { key: 'a', primary: true },
  { key: 'b', prominentOnMobile: true, hideOnMobile: true },
]);
check('F07 a hidden column is never the prominent value', hiddenProminent.prominent, undefined);

// ── M3: Info Rental unit card (customer area) ───────────────────────────────
// The layout is shared with src/pages/InfoRental.tsx, so dropping the status
// column from the card fails here.
const unit = selectCardColumns(Object.values(UNIT_CARD_LAYOUT));
check('M3 unit card primary is the unit code', unit.primary.key, 'code');
check('M3 unit card prominent value is the hourly rate', unit.prominent?.key, 'rate');
check('M3 unit card body = tipe, ruangan, status', unit.cardCols.map((c) => c.key), ['type', 'room', 'status']);
check('M3 unit status survives the mobile card', unit.cardCols.some((c) => c.key === 'status'), true);

// ── F06: accessible names ───────────────────────────────────────────────────
const session = { consoleCode: 'PS5-01', customerName: 'Budi' };
check('F06 row name falls back to the primary column text', rowName(session, undefined, (s: typeof session) => `Sesi ${s.consoleCode} — ${s.customerName}`), 'Sesi PS5-01 — Budi');
check('F06 rowLabel wins over the primary text', rowName(session, () => 'Budi', () => 'Sesi PS5-01 — Budi'), 'Budi');
check('F06 last resort is the generic label', rowName(session, undefined, undefined), 'Buka detail');

check('F06 Units label', rowName({ code: 'PS5-02' }, undefined, (u: { code: string }) => `Konsol ${u.code}`), 'Konsol PS5-02');
check('F06 Users label', rowName({ fullName: 'Sari' }, undefined, (u: { fullName: string }) => `Pengguna ${u.fullName}`), 'Pengguna Sari');
check('F06 Games label', rowName({ title: 'FIFA' }, undefined, (g: { title: string }) => `Game ${g.title}`), 'Game FIFA');

// ── M-A: `aria-controls` only where a TabPanel really exists ───────────────
// `Tabs` publishes `aria-controls` only when the page passes `idPrefix`.
// A page without panels must not get the attribute at all, or every tab
// promises a panel that is not in the DOM (DS-011 M-A — 28 dangling IDREFs).
// Invariant: a page renders `TabPanel` ⇔ it passes `idPrefix` to `Tabs`.
const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
const pagesDir = join(srcDir, 'pages');

const tabsSrc = readFileSync(join(srcDir, 'components/Tabs.tsx'), 'utf8');
check('M-A Tabs gates aria-controls on idPrefix', /aria-controls=\{idPrefix \?/.test(tabsSrc), true);

const publishers: string[] = [];
const quiet: string[] = [];
for (const file of readdirSync(pagesDir).filter((f) => f.endsWith('.tsx')).sort()) {
  const src = readFileSync(join(pagesDir, file), 'utf8');
  const tabTags = src.match(/<Tabs\b[\s\S]*?\/>/g) ?? [];
  if (tabTags.length === 0) continue;
  const withPrefix = tabTags.filter((t) => /\bidPrefix=/.test(t));
  const hasPanel = /<TabPanel[\s>]/.test(src);
  check(`M-A ${file}: renders TabPanel ⇔ passes idPrefix`, hasPanel === withPrefix.length > 0, true);
  if (withPrefix.length > 0) publishers.push(file);
  else quiet.push(file);
}
check('M-A only the page with panels publishes aria-controls', publishers.join(','), 'InfoRental.tsx');

// The publishing page must really have a panel per tab, or `aria-controls`
// would point at a missing id all over again.
const infoSrc = readFileSync(join(pagesDir, 'InfoRental.tsx'), 'utf8');
const tabValues = [...infoSrc.matchAll(/\{ value: '([^']+)', label:/g)].map((m) => m[1]);
const panelIds = [...infoSrc.matchAll(/<TabPanel id=\{`\$\{TABS_ID\}-panel-([^`]+)`\}/g)].map((m) => m[1]);
check('M-A every InfoRental tab owns a panel', tabValues.join(','), panelIds.join(','));
process.stdout.write(`M-A ${quiet.length} page(s) publish no aria-controls: ${quiet.join(', ')}\n`);

process.stdout.write(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
