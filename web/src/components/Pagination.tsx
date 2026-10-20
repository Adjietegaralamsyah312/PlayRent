import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, IconButton } from './Button';
import { formatNumber } from '../lib/format';
import { useMediaQuery } from '../lib/useMediaQuery';

export interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (p: number) => void;
  onLimitChange?: (l: number) => void;
  mode?: 'numbered' | 'load-more';
}

const WIDE_QUERY = '(min-width: 640px)';

export function Pagination({ page, limit, total, onPageChange, onLimitChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);
  const summary = `Menampilkan ${formatNumber(start)}–${formatNumber(end)} dari ${formatNumber(total)}`;
  const wide = useMediaQuery(WIDE_QUERY);

  const numbers: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pageCount, page + 2); p += 1) numbers.push(p);

  // <640px: a 5-number strip plus two labelled buttons does not fit a 360px
  // phone. One tap per page is kept, the number strip is not.
  if (!wide) {
    return (
      <nav className="flex flex-col items-center gap-2" aria-label="Navigasi halaman">
        <p className="text-body-sm text-text-muted tnum">{summary}</p>
        <div className="flex items-center gap-2">
          <IconButton
            icon={<ChevronLeft className="size-5" aria-hidden="true" />}
            label="Halaman sebelumnya"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          />
          <span className="sr-only">Halaman {page} dari {pageCount}</span>
          <span className="tnum text-body text-text" aria-hidden="true">
            {page} / {pageCount}
          </span>
          <IconButton
            icon={<ChevronRight className="size-5" aria-hidden="true" />}
            label="Halaman berikutnya"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
          />
        </div>
      </nav>
    );
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Navigasi halaman">
      <p className="text-body-sm text-text-muted tnum">{summary}</p>
      <div className="flex items-center gap-1">
        {onLimitChange && (
          <label className="mr-2 inline-flex items-center gap-2 text-body-sm text-text-secondary">
            <span className="sr-only sm:not-sr-only">Per halaman</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="h-11 rounded-md border border-border-strong bg-surface-2 px-2 text-body-sm text-text"
              aria-label="Jumlah baris per halaman"
            >
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <Button
          variant="ghost" size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          iconLeft={<ChevronLeft className="size-4" aria-hidden="true" />}
        >
          Sebelumnya
        </Button>
        {numbers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={[
              'tnum size-11 rounded-md text-body-sm transition-colors duration-fast',
              p === page ? 'bg-accent text-white font-medium' : 'text-text-secondary hover:bg-surface-hover hover:text-text',
            ].join(' ')}
          >
            {p}
          </button>
        ))}
        <Button
          variant="ghost" size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          iconRight={<ChevronRight className="size-4" aria-hidden="true" />}
        >
          Berikutnya
        </Button>
      </div>
    </nav>
  );
}
