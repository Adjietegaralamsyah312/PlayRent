/**
 * Self-check for the client-side price estimate.
 * Run: node scripts/check-pricing.ts   (Node ≥ 23 strips the types)
 *
 * The estimate the customer sees must equal what the server bills, so the
 * check compares the frontend mirror against the SERVER's own pricing
 * module — not against a copy of it.
 */
import assert from 'node:assert/strict';
import { estimateCost } from '../src/lib/pricing.ts';
import { quote } from '../../server/src/lib/pricing.js';

const RULES = { minDurationMinutes: 30, roundingMinutes: 15, warnMinutes: [10, 5, 1] };
const RATES = [8000, 10000, 15000, 18000, 25000];
const DURATIONS = [30, 45, 60, 90, 100, 120, 150, 180];

let checks = 0;
for (const rounding of [5, 15, 30, 60]) {
  const rules = { ...RULES, roundingMinutes: rounding };
  for (const rate of RATES) {
    for (const duration of DURATIONS) {
      const server = quote({ durationMinutes: duration, actualMinutes: duration, hourlyRate: rate, rules }).total;
      assert.equal(
        estimateCost(duration, rate, rounding),
        server,
        `mismatch: ${duration}m @ ${rate}/jam, rounding ${rounding}`,
      );
      checks += 1;
    }
  }
}

process.stdout.write(`ok   ${checks} estimate(s) match the server's quote()\n`);
process.stdout.write('all checks passed\n');
