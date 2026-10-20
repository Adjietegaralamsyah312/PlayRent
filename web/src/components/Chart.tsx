import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { abbrevIDR, formatDurationShort, formatIDR, formatNumber } from '../lib/format';
import { useMediaQuery } from '../lib/useMediaQuery';
import { Skeleton } from './Feedback';

export interface ChartPoint { label: string; value: number; secondary?: number }

export interface ChartProps {
  type: 'bar' | 'line';
  data: ChartPoint[];
  valueKind: 'currency' | 'count' | 'minutes';
  height?: number;
  loading?: boolean;
  error?: string | null;
  emptyLabel?: string;
  ariaLabel: string;
  ariaSummary?: string;
  onPointClick?: (index: number) => void;
}

function formatValue(v: number, kind: ChartProps['valueKind']): string {
  if (kind === 'currency') return formatIDR(v);
  if (kind === 'minutes') return formatDurationShort(v);
  return formatNumber(v);
}

function formatAxis(v: number, kind: ChartProps['valueKind']): string {
  if (kind === 'currency') return abbrevIDR(v);
  return formatNumber(v);
}

/** §8 — 4 value ticks including 0, list ordered top-down. */
function valueTicks(max: number): number[] {
  return [0, 1, 2, 3].map((i) => (max * (3 - i)) / 3);
}

const WIDE_QUERY = '(min-width: 768px)';

interface PlotProps {
  type: ChartProps['type'];
  data: ChartPoint[];
  valueKind: ChartProps['valueKind'];
  max: number;
  height: number;
  ariaLabel: string;
  ariaSummary?: string;
  onPointClick?: (index: number) => void;
}

function Plot({ type, data, valueKind, max, height, ariaLabel, ariaSummary, onPointClick }: PlotProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const n = data.length;
  const ticks = valueTicks(max);

  // 1:1 pixel units — the viewBox IS the measured box, so nothing is stretched
  // (§8: `preserveAspectRatio="none"` off).
  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      setBox((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const atX = (i: number) => (box ? (n > 1 ? (i / (n - 1)) * box.w : box.w / 2) : 0);
  const atY = (v: number) => (box ? box.h - (v / max) * box.h * 0.96 : 0);
  const linePoints = box ? data.map((d, i) => `${atX(i)},${atY(d.value)}`).join(' ') : '';

  return (
    <div ref={plot} className="relative min-w-0 flex-1" style={{ height }}>
      {/* horizontal grid only; the 0 tick doubles as the axis baseline */}
      {ticks.map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`absolute inset-x-0 border-t ${i === ticks.length - 1 ? 'border-border-strong' : 'border-border'}`}
          style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
        />
      ))}

      {box && (
        <svg className="absolute inset-0 size-full" viewBox={`0 0 ${box.w} ${box.h}`} role="img" aria-label={ariaLabel}>
          <title>{ariaSummary ?? ariaLabel}</title>
          {type === 'line' ? (
            <>
              <polygon points={`0,${box.h} ${linePoints} ${box.w},${box.h}`} fill="var(--color-cyan)" opacity="0.12" />
              <polyline
                points={linePoints}
                fill="none"
                stroke="var(--color-cyan)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          ) : (
            data.map((d, i) => {
              // ponytail: 2px gap + 6px floor, so the values below the floor
              // (very many buckets) overlap rather than vanish (§8).
              const slot = box.w / n;
              const barW = Math.max(slot - 2, 6);
              const x = i * slot + (slot - barW) / 2;
              const barH = Math.max((d.value / max) * box.h * 0.96, d.value > 0 ? 2 : 0);
              const y = box.h - barH;
              const r = Math.min(4, barW / 2, barH);
              return (
                <path
                  key={i}
                  d={`M${x},${box.h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${box.h} Z`}
                  fill={hover === i ? 'var(--color-cyan)' : 'var(--color-accent)'}
                />
              );
            })
          )}
        </svg>
      )}

      {/* point hit targets — HTML so focus/click behave natively */}
      <div className="absolute inset-0 flex">
        {data.map((d, i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => onPointClick?.(i)}
            aria-label={`${d.label}: ${formatValue(d.value, valueKind)}`}
            className="group relative flex-1 cursor-pointer rounded-[var(--radius-sm)] focus-visible:outline-offset-[-2px]"
          >
            {type === 'line' && hover === i && (
              <span
                className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan ring-2 ring-[var(--color-surface)]"
                style={{ left: `${(atX(i) / (box?.w || 1)) * 100}%`, top: `${(atY(d.value) / (box?.h || 1)) * 100}%` }}
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>

      {/* tooltip — §5 elevation: e2 carries no border */}
      {hover !== null && (
        <div
          className="pointer-events-none absolute z-[var(--z-tooltip)] -translate-x-1/2 rounded-md bg-surface-2 p-2 shadow-e2"
          style={{ left: `${((hover + 0.5) / n) * 100}%`, top: 0 }}
        >
          <p className="whitespace-nowrap text-caption font-semibold text-text tnum">{data[hover].label}</p>
          <p className="whitespace-nowrap text-body-sm text-text tnum">{formatValue(data[hover].value, valueKind)}</p>
          {data[hover].secondary !== undefined && (
            <p className="whitespace-nowrap text-caption text-text-secondary tnum">{formatNumber(data[hover].secondary as number)} transaksi</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Chart({
  type, data, valueKind, height = 180, loading, error,
  emptyLabel = 'Belum ada data pada rentang ini.', ariaLabel, ariaSummary, onPointClick,
}: ChartProps) {
  const wide = useMediaQuery(WIDE_QUERY);
  const chartHeight = wide ? Math.max(height, 240) : height;

  if (loading) return <Skeleton variant="block" className="w-full" style={{ height: chartHeight }} />;
  if (error) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger-soft px-3 py-3 text-body-sm text-danger-text">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        {error}
      </div>
    );
  }
  if (data.length === 0) {
    return <p className="py-10 text-center text-body-sm text-text-muted">{emptyLabel}</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const ticks = valueTicks(max);
  // §8 — at most 7 x labels, never rotated.
  const labelEvery = Math.ceil(data.length / 7);

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex gap-3">
        {/* y axis */}
        <div className="flex shrink-0 flex-col justify-between py-0.5 text-right text-caption text-text-muted tnum" style={{ height: chartHeight }}>
          {ticks.map((t, i) => <span key={i}>{formatAxis(t, valueKind)}</span>)}
        </div>

        <Plot
          type={type}
          data={data}
          valueKind={valueKind}
          max={max}
          height={chartHeight}
          ariaLabel={ariaLabel}
          ariaSummary={ariaSummary}
          onPointClick={onPointClick}
        />
      </div>

      {/* x axis */}
      <div className="flex pl-[calc(3rem+0.75rem)]">
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center text-caption text-text-muted tnum">
            {i % labelEvery === 0 ? d.label : ''}
          </span>
        ))}
      </div>

      {ariaSummary && <figcaption className="sr-only">{ariaSummary}</figcaption>}
    </figure>
  );
}
