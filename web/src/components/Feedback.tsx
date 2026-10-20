import type { CSSProperties, ReactNode } from 'react';
import { ShieldAlert, TriangleAlert } from 'lucide-react';

export { Spinner } from './Button';
export type { SpinnerProps } from './Button';

// ── EmptyState ──────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  variant?: 'default' | 'error' | 'no-permission';
  /**
   * Heading level of the title — use 1 when the state replaces the whole page.
   * Default 2: a page title (h1) must never be followed by an h3 (DS-011 M-C).
   * Lowering a level can never create a new skip, so 2 is safe everywhere.
   */
  headingLevel?: 1 | 2 | 3;
}

export function EmptyState({
  icon, title, description, primaryAction, secondaryAction, variant = 'default', headingLevel = 2,
}: EmptyStateProps) {
  const isError = variant === 'error';
  const isNoPerm = variant === 'no-permission';
  const tone = isError ? 'text-danger' : 'text-text-muted';
  const fallbackIcon = isError
    ? <TriangleAlert className="size-8" aria-hidden="true" />
    : isNoPerm
      ? <ShieldAlert className="size-8" aria-hidden="true" />
      : null;
  const Title = `h${headingLevel}` as 'h1' | 'h2' | 'h3';

  return (
    <div role={isError ? 'alert' : undefined} className="flex flex-col items-center px-4 py-10 text-center">
      <span className={`mb-3 ${tone}`}>{icon ?? fallbackIcon}</span>
      <Title className="text-h3 font-semibold text-text">{title}</Title>
      {description && <p className="mt-1.5 max-w-sm text-body-sm text-text-secondary">{description}</p>}
      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

export interface SkeletonProps {
  variant?: 'text' | 'block' | 'table-row' | 'card';
  lines?: number;
  className?: string;
  /** Only for heights a caller computes (e.g. Chart's responsive plot height). */
  style?: CSSProperties;
}

const SHIMMER = 'animate-pulse bg-surface-hover';
// ponytail: shimmer is animate-pulse; the reduced-motion media query already
// freezes it, so no separate static branch is needed.

export function Skeleton({ variant = 'text', lines = 1, className = '', style }: SkeletonProps) {
  if (variant === 'card') {
    return <div className={`${SHIMMER} h-32 w-full rounded-[var(--radius-lg)] ${className}`} style={style} />;
  }
  if (variant === 'block') {
    return <div className={`${SHIMMER} h-16 w-full rounded-md ${className}`} style={style} />;
  }
  if (variant === 'table-row') {
    return (
      <div className={`flex items-center gap-3 py-3 ${className}`} style={style}>
        <div className={`${SHIMMER} h-4 w-1/4 rounded-[var(--radius-sm)]`} />
        <div className={`${SHIMMER} h-4 w-1/3 rounded-[var(--radius-sm)]`} />
        <div className={`${SHIMMER} ml-auto h-4 w-16 rounded-[var(--radius-sm)]`} />
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-2 ${className}`} style={style} aria-hidden="true">
      {Array.from({ length: Math.max(1, lines) }).map((_, i) => (
        <div key={i} className={`${SHIMMER} h-3.5 rounded-[var(--radius-sm)] ${i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full'}`} />
      ))}
    </div>
  );
}
