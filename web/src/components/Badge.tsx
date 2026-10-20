import type { ReactNode } from 'react';
import {
  AlertTriangle, Ban, CheckCircle2, Clock, Info, Minus, Radio,
} from 'lucide-react';
import { TONE_CLASS, TONE_OUTLINE } from './types';
import type { Tone } from './types';

export interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  size?: 'sm' | 'md';
  withIcon?: ReactNode;
  variant?: 'soft' | 'outline';
}

export function Badge({ tone = 'neutral', children, size = 'sm', withIcon, variant = 'soft' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-label' : 'px-2.5 py-1 text-body-sm',
        variant === 'soft' ? TONE_CLASS[tone] : `border ${TONE_OUTLINE[tone]}`,
      ].join(' ')}
    >
      {withIcon}
      {children}
    </span>
  );
}

// A status is NEVER colour-only. Tone picks the icon by default; a map may override.
const TONE_ICON: Record<Tone, ReactNode> = {
  neutral: <Minus className="size-3.5" aria-hidden="true" />,
  success: <CheckCircle2 className="size-3.5" aria-hidden="true" />,
  warning: <AlertTriangle className="size-3.5" aria-hidden="true" />,
  danger: <Ban className="size-3.5" aria-hidden="true" />,
  info: <Info className="size-3.5" aria-hidden="true" />,
  accent: <Radio className="size-3.5" aria-hidden="true" />,
  cyan: <Clock className="size-3.5" aria-hidden="true" />,
  muted: <Minus className="size-3.5" aria-hidden="true" />,
};

export interface StatusBadgeProps<T extends string> {
  value: T;
  map: Record<string, { label: string; tone: Tone; icon?: ReactNode }>;
  size?: 'sm' | 'md';
}

export function StatusBadge<T extends string>({ value, map, size = 'sm' }: StatusBadgeProps<T>) {
  const meta = map[value];
  // Unknown status from the API must be visible, not crash the table.
  const label = meta?.label ?? String(value);
  const tone: Tone = meta?.tone ?? 'warning';
  return (
    <Badge tone={tone} size={size} withIcon={meta?.icon ?? TONE_ICON[tone]}>
      {label}
    </Badge>
  );
}
