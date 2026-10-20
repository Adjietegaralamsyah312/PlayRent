import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Size, Tone } from './types';

// ── Button ──────────────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
  size?: Size;
  loading?: boolean;
  loadingText?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
}

// `sm` keeps its 32px visual but grows an invisible 44px hit area (§10.5) —
// text buttons are already wider than 44, so only the vertical axis needs padding.
const HIT_AREA = "relative before:absolute before:content-[''] before:inset-x-0 before:-inset-y-1.5";

const SIZE_CLASS: Record<Size, string> = {
  sm: `h-8 px-3 text-body-sm gap-1.5 ${HIT_AREA}`,
  md: 'h-10 px-4 text-body-sm gap-2',
  lg: 'h-12 px-5 text-body-lg gap-2',
};

const VARIANT_CLASS: Record<NonNullable<ButtonProps['variant']>, string> = {
  // White on accent = 5.70:1 (DESIGN.md §3.3). `text-text-inverse` is 3.40:1
  // here — it only belongs on the cyan fill.
  primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-active',
  secondary: 'bg-surface-2 text-text border border-border-strong hover:bg-surface-hover',
  ghost: 'bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text',
  danger: 'bg-danger-strong text-white hover:brightness-110 active:brightness-95',
  link: 'bg-transparent text-accent-text underline-offset-2 hover:underline px-1',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary', size = 'md', loading = false, loadingText,
    iconLeft, iconRight, fullWidth, type = 'button',
    disabled, className = '', children, ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap',
        'transition-colors duration-fast ease-standard select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 'md' : 'sm'} /> : iconLeft}
      <span>{loading && loadingText ? loadingText : children}</span>
      {!loading && iconRight}
    </button>
  );
});

// ── IconButton ──────────────────────────────────────────────────────────────

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: 'ghost' | 'solid';
  size?: Size;
  loading?: boolean;
  tone?: Tone;
}

// 44px is the floor for icon-only targets (§9) — sm is not an exception to it.
const ICON_SIZE_CLASS: Record<Size, string> = {
  sm: 'size-11',
  md: 'size-11',
  lg: 'size-12',
};

const ICON_TONE_CLASS: Record<Tone, string> = {
  neutral: 'hover:text-text',
  success: 'hover:text-success',
  warning: 'hover:text-warning',
  danger: 'hover:text-danger-text',
  info: 'hover:text-info',
  accent: 'hover:text-accent-text',
  cyan: 'hover:text-cyan',
  muted: 'hover:text-text',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', loading = false, tone = 'neutral', disabled, className = '', ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-label={label}
      title={label}
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-fast',
        ICON_SIZE_CLASS[size],
        variant === 'solid'
          ? 'bg-surface-2 text-text border border-border-strong hover:bg-surface-hover'
          : `bg-transparent text-text-secondary hover:bg-surface-hover ${ICON_TONE_CLASS[tone]}`,
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : icon}
      <span className="sr-only">{label}</span>
    </button>
  );
});

// ── Spinner (shared by both, no dependency cycle) ───────────────────────────

export interface SpinnerProps { size?: Size; label?: string }

export function Spinner({ size = 'md', label = 'Memuat…' }: SpinnerProps) {
  const box = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-7' : 'size-5';
  const stroke = size === 'lg' ? 3 : 2;
  return (
    <span role="status" className="inline-flex items-center justify-center">
      <svg className={`${box} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth={stroke} />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
