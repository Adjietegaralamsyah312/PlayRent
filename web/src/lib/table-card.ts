/**
 * Mobile-card layout rules for DataTable. Pure functions so the card can be
 * checked without a browser (see scripts/check-table-card.ts).
 */

export interface CardColumn {
  key: string;
  primary?: boolean;
  prominentOnMobile?: boolean;
  hideOnMobile?: boolean;
}

export interface CardColumns<T> {
  /** The column that names the row — the card's only "open detail" control. */
  primary: T;
  /** The value that goes to the card's top-right slot, if any. */
  prominent?: T;
  /** Body rows of the card: the rest, capped at 3 so the card stays scannable. */
  cardCols: T[];
}

export function selectCardColumns<T extends CardColumn>(columns: T[]): CardColumns<T> {
  const mobile = columns.filter((c) => !c.hideOnMobile);
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const prominent = mobile.find((c) => c.prominentOnMobile);
  const cardCols = mobile
    .filter((c) => c.key !== primary.key && c.key !== prominent?.key)
    .slice(0, 3);
  return { primary, prominent, cardCols };
}

/**
 * Info Rental unit card layout. The customer picks a unit by its availability,
 * so `status` has to survive the three-row card cut on a phone — `controllers`
 * is the column that gets dropped. Shared by the page and by
 * `scripts/check-table-card.ts` so the UI and the check cannot drift.
 */
export const UNIT_CARD_LAYOUT: Record<string, CardColumn> = {
  code: { key: 'code', primary: true },
  type: { key: 'type' },
  room: { key: 'room' },
  controllers: { key: 'controllers', hideOnMobile: true },
  rate: { key: 'rate', prominentOnMobile: true },
  status: { key: 'status' },
};

/**
 * Accessible name of a row: the explicit label first, then the primary
 * column's plain text, then a generic fallback. Never "Buka detail" for a
 * row that can name itself.
 */
export function rowName<T>(
  row: T,
  rowLabel: ((row: T) => string) | undefined,
  primaryText: ((row: T) => string) | undefined,
): string {
  return rowLabel?.(row) ?? primaryText?.(row) ?? 'Buka detail';
}
