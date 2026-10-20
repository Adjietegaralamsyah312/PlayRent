import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import { rowName, selectCardColumns } from '../lib/table-card';
import { Skeleton } from './Feedback';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
  hideOnMobile?: boolean;
  primary?: boolean;
  /** Plain-text identity of the row — the accessible name of the primary control. */
  text?: (row: T) => string;
  /** Mobile card: this value goes to the top-right slot — the answer the reader needs first. */
  prominentOnMobile?: boolean;
  width?: string;
  sortable?: boolean;
}

export interface SortState { key: string; dir: 'asc' | 'desc' }

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  skeletonRows?: number;
  empty?: ReactNode;
  error?: string | null;
  onRowClick?: (row: T) => void;
  /** Accessible name for a clickable row; defaults to the primary column's `text`. */
  rowLabel?: (row: T) => string;
  rowActions?: (row: T) => ReactNode;
  selectable?: boolean;
  selectedIds?: (string | number)[];
  onSelectedIdsChange?: (ids: (string | number)[]) => void;
  /** Sticky column header inside the table panel. On by default (DESIGN.md §6). */
  stickyHeader?: boolean;
  /** Optional controlled sorting — headers only become buttons when both are set. */
  sort?: SortState;
  onSortChange?: (s: SortState) => void;
}

const ALIGN: Record<NonNullable<Column<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function DataTable<T>({
  columns, rows, rowKey, loading = false, skeletonRows = 5, empty, error,
  onRowClick, rowLabel, rowActions, selectable, selectedIds = [], onSelectedIdsChange,
  stickyHeader = true, sort, onSortChange,
}: DataTableProps<T>) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(rowKey(r)));

  function toggleAll() {
    if (!onSelectedIdsChange) return;
    onSelectedIdsChange(allSelected ? [] : rows.map(rowKey));
  }

  function toggleOne(id: string | number) {
    if (!onSelectedIdsChange) return;
    onSelectedIdsChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  function cycleSort(col: Column<T>) {
    if (!col.sortable || !onSortChange) return;
    const dir: SortState['dir'] = sort?.key === col.key && sort.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ key: col.key, dir });
  }

  const { primary: primaryCol, prominent: prominentCol, cardCols } = selectCardColumns(columns);

  const header = (
    <thead className={stickyHeader ? 'sticky top-0 z-[var(--z-sticky)] bg-surface-2 shadow-e1' : 'bg-surface-2'}>
      <tr className="border-b border-border">
        {selectable && (
          <th scope="col" className="w-12 px-3 py-2.5">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Pilih semua baris"
              className="size-5 rounded-[var(--radius-sm)] accent-[var(--color-accent)]"
            />
          </th>
        )}
        {columns.map((col) => {
          const isSorted = sort?.key === col.key;
          const canSort = col.sortable && onSortChange;
          return (
            <th
              key={col.key}
              scope="col"
              // aria-sort belongs on the column header, not on the button inside it (FE-015).
              aria-sort={canSort ? (isSorted ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
              style={col.width ? { width: col.width } : undefined}
              className={[
                'px-3 py-2.5 text-label font-medium text-text-secondary',
                ALIGN[col.align ?? (col.numeric ? 'right' : 'left')],
              ].join(' ')}
            >
              {canSort ? (
                <button
                  type="button"
                  onClick={() => cycleSort(col)}
                  aria-label={`Urutkan berdasarkan ${col.header}`}
                  className={[
                    'inline-flex items-center gap-1 rounded-[var(--radius-sm)] hover:text-text',
                    col.align === 'right' || col.numeric ? 'flex-row-reverse' : '',
                  ].join(' ')}
                >
                  {col.header}
                  {isSorted
                    ? (sort?.dir === 'asc' ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" />)
                    : <ChevronsUpDown className="size-3.5 text-text-muted" aria-hidden="true" />}
                </button>
              ) : col.header}
            </th>
          );
        })}
        {rowActions && <th scope="col" className="w-px px-3 py-2.5"><span className="sr-only">Aksi</span></th>}
      </tr>
    </thead>
  );

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-soft px-3 py-2.5 text-body-sm text-danger-text">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* ── desktop / tablet table ── */}
      {/* ≥1024 the panel scrolls on its own, so a sticky header actually sticks. */}
      <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-border sm:block lg:max-h-[70dvh] lg:overflow-auto">
        <table className="w-full border-collapse text-body-sm">
          {header}
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-border last:border-0">
                  {selectable && <td className="px-3 py-3"><Skeleton variant="text" className="w-5" /></td>}
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-3">
                      <Skeleton variant="text" className={col.primary ? 'w-2/3' : 'w-1/2'} />
                    </td>
                  ))}
                  {rowActions && <td className="px-3 py-3"><Skeleton variant="text" className="ml-auto w-16" /></td>}
                </tr>
              ))
              : rows.map((row) => {
                const id = rowKey(row);
                const selected = selectedIds.includes(id);
                return (
                  <tr
                    key={id}
                    className={[
                      'border-b border-border last:border-0 transition-colors duration-fast',
                      onRowClick ? 'cursor-pointer hover:bg-surface-hover' : '',
                      selected ? 'bg-accent-soft/40' : '',
                    ].join(' ')}
                    {...(onRowClick ? {
                      tabIndex: 0,
                      'aria-label': rowName(row, rowLabel, primaryCol.text),
                      onClick: () => onRowClick(row),
                      onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                        // Keys from row-action buttons bubble here; only activate on the row itself.
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); }
                      },
                    } : {})}
                  >
                    {selectable && (
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleOne(id)}
                          aria-label={`Pilih baris ${id}`}
                          className="size-5 rounded-[var(--radius-sm)] accent-[var(--color-accent)]"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={[
                          'px-3 py-3 text-text align-middle',
                          ALIGN[col.align ?? (col.numeric ? 'right' : 'left')],
                          col.numeric ? 'tnum' : '',
                          col.primary ? 'font-medium' : '',
                        ].join(' ')}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">{rowActions(row)}</div>
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>

        {!loading && rows.length === 0 && <div className="p-6">{empty}</div>}
      </div>

      {/* ── mobile cards (<640): no horizontal scroll, ever ── */}
      <div className="flex flex-col gap-2 sm:hidden">
        {loading
          ? Array.from({ length: Math.min(skeletonRows, 4) }).map((_, i) => (
            <div key={`msk-${i}`} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
              <Skeleton variant="text" className="w-1/2" />
              <Skeleton variant="text" lines={2} className="mt-3" />
            </div>
          ))
          : rows.map((row) => {
            const id = rowKey(row);
            const selected = selectedIds.includes(id);
            return (
              // A plain div: the card itself is not a control, so the action
              // buttons inside it are no longer nested in a button-role element.
              <div
                key={id}
                className={[
                  'rounded-[var(--radius-lg)] border bg-surface p-4',
                  selected ? 'border-border-strong' : 'border-border',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleOne(id)}
                        aria-label={`Pilih baris ${id}`}
                        className="mt-1 size-5 shrink-0 rounded-[var(--radius-sm)] accent-[var(--color-accent)]"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      {onRowClick ? (
                        <button
                          type="button"
                          onClick={() => onRowClick(row)}
                          aria-label={rowName(row, rowLabel, primaryCol.text)}
                          className="inline-flex min-h-11 w-full items-center text-left font-semibold text-text"
                        >
                          {primaryCol.render(row)}
                        </button>
                      ) : (
                        <span className="text-body font-semibold text-text">{primaryCol.render(row)}</span>
                      )}
                    </div>
                  </div>
                  {prominentCol && (
                    <div className="shrink-0 text-right text-h2 font-bold tnum text-text">
                      {prominentCol.render(row)}
                    </div>
                  )}
                </div>
                {cardCols.length > 0 && (
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                    {cardCols.map((col) => (
                      <div key={col.key} className="contents">
                        <dt className="text-caption text-text-muted">{col.header}</dt>
                        <dd className={['text-body-sm text-text-secondary', col.numeric ? 'tnum text-right' : ''].join(' ')}>
                          {col.render(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {rowActions && (
                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                    {rowActions(row)}
                  </div>
                )}
              </div>
            );
          })}
        {!loading && rows.length === 0 && (
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">{empty}</div>
        )}
      </div>
    </div>
  );
}
