import type { ElementType, ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
  interactive?: boolean;
  selected?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  as?: ElementType;
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({
  children, title, description, actions,
  interactive, selected, padding = 'md', as,
}: CardProps) {
  const Tag = (as ?? 'div') as ElementType;
  const hasHeader = Boolean(title || description || actions);
  return (
    <Tag
      className={[
        'rounded-[var(--radius-lg)] border bg-surface',
        selected ? 'border-border-strong ring-1 ring-[var(--color-border-strong)]' : 'border-border',
        interactive ? 'transition-colors duration-fast hover:bg-surface-hover' : '',
        PADDING[padding],
      ].filter(Boolean).join(' ')}
    >
      {hasHeader && (
        <div className={`flex items-start justify-between gap-3 ${padding === 'none' ? 'px-4 pt-4' : ''} ${children ? 'mb-3' : ''}`}>
          <div className="min-w-0">
            {title && <h2 className="truncate text-h3 font-semibold text-text">{title}</h2>}
            {description && <p className="mt-0.5 text-body-sm text-text-secondary">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
