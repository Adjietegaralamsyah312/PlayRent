/**
 * Client-side price estimate.
 *
 * The booking list endpoint does not return the server-computed
 * `estimated_cost`, so the customer sees this estimate. It mirrors the
 * server's `quote()` (server/src/lib/pricing.js) — rounding up to the
 * billing step, then the hourly rate. The server stays the source of truth:
 * it recomputes and stores the real figure on every write.
 *
 * Checked against the server module by web/scripts/check-pricing.ts.
 */
export function estimateCost(durationMinutes: number, hourlyRate: number, roundingMinutes: number): number {
  const step = roundingMinutes > 0 ? roundingMinutes : 1;
  const billable = Math.ceil(durationMinutes / step) * step;
  return Math.ceil((billable * hourlyRate) / 60);
}
