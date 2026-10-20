// Shared primitive types — the contract from specs/components.md.

// 'muted' exists because DESIGN.md §7 gives void/cancelled text-muted on a
// neutral-soft fill — the only label/tone pair the original set could not express.
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'cyan' | 'muted';
export type Size = 'sm' | 'md' | 'lg';
export type StatusTone = Tone;
export interface Option<T extends string = string> { value: T; label: string; disabled?: boolean }
export interface ApiError { code: string; message: string; details?: unknown[] }

/** Soft-fill + matching foreground for a tone. Used by Badge and friends. */
export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-text-secondary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger-text',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent-soft text-accent-text',
  cyan: 'bg-cyan-soft text-cyan',
  muted: 'bg-neutral-soft text-text-muted',
};

export const TONE_OUTLINE: Record<Tone, string> = {
  neutral: 'border-border-strong text-text-secondary',
  success: 'border-success/50 text-success',
  warning: 'border-warning/50 text-warning',
  danger: 'border-danger/50 text-danger-text',
  info: 'border-info/50 text-info',
  accent: 'border-accent/50 text-accent-text',
  cyan: 'border-cyan/50 text-cyan',
  muted: 'border-border-strong text-text-muted',
};
