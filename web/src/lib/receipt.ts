import { transactions } from './api';

export interface OpenReceiptResult { ok: boolean; url: string }

/**
 * Opens the server-rendered receipt in a new tab (specs/transactions.md §1.3).
 * The client never rebuilds the document; it only navigates to it.
 * `print` adds `&print=1`, which is what makes the document auto-print.
 */
export function openReceipt(id: string, print = false): OpenReceiptResult {
  const url = transactions.receiptUrl(id, { print });
  const win = window.open(url, '_blank', 'noopener');
  return { ok: win !== null, url };
}
