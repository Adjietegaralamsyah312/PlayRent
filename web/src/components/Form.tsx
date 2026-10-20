import { forwardRef, useId } from 'react';
import type {
  InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
} from 'react';
import type { Option, Size } from './types';

// ── shared bits ─────────────────────────────────────────────────────────────

// Touch targets: 44 px on phones AND tablets (DESIGN.md §6 — a 640–1023 px
// screen is still finger-driven). Only ≥1024 px, where a precise pointer is the
// norm, drops to 40 px. `lg` stays 48 px.
const FIELD_SIZE: Record<Size, string> = {
  sm: 'h-9 text-body-sm',
  md: 'h-11 text-body lg:h-10',
  lg: 'h-12 text-body-lg',
};

const CONTROL_BASE =
  'w-full rounded-md bg-surface-2 text-text placeholder:text-text-muted ' +
  'border transition-colors duration-fast ease-standard ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface';

function RequiredMark() {
  return <span className="ml-0.5 text-danger" aria-hidden="true">*</span>;
}

interface FieldShellProps {
  id: string; label: string; requiredMark?: boolean; helpText?: string; error?: string;
  helpId: string; errorId: string; children: ReactNode;
}

function FieldShell({ id, label, requiredMark, helpText, error, helpId, errorId, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label font-medium text-text-secondary">
        {label}
        {requiredMark && <RequiredMark />}
      </label>
      {children}
      {helpText && !error && <p id={helpId} className="text-caption text-text-muted">{helpText}</p>}
      {error && <p id={errorId} role="alert" className="text-caption text-danger">{error}</p>}
    </div>
  );
}

// ── Input ───────────────────────────────────────────────────────────────────

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label: string;
  size?: Size;
  helpText?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  requiredMark?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, size = 'md', helpText, error, prefix, suffix, requiredMark, id, className = '', ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  // Only point at an id that is actually rendered: the help text is hidden
  // while the error is shown, so both can never be referenced at once (FE-014).
  const describedBy = error ? errorId : helpText ? helpId : '';

  return (
    <FieldShell id={fieldId} label={label} requiredMark={requiredMark} helpText={helpText} error={error} helpId={helpId} errorId={errorId}>
      <div className="relative flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-3 text-body-sm text-text-muted">{prefix}</span>
        )}
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          aria-required={requiredMark || undefined}
          className={[
            CONTROL_BASE,
            FIELD_SIZE[size],
            prefix ? 'pl-11' : 'pl-3',
            suffix ? 'pr-14' : 'pr-3',
            error ? 'border-danger' : 'border-border-strong hover:border-border-strong',
            className,
          ].filter(Boolean).join(' ')}
          {...rest}
        />
        {suffix && <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-body-sm text-text-muted">{suffix}</span>}
      </div>
    </FieldShell>
  );
});

// ── Textarea ────────────────────────────────────────────────────────────────

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  rows?: number;
  maxLength?: number;
  helpText?: string;
  error?: string;
  requiredMark?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, rows = 3, maxLength, helpText, error, requiredMark, id, className = '', value, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  // Only point at an id that is actually rendered: the help text is hidden
  // while the error is shown, so both can never be referenced at once (FE-014).
  const describedBy = error ? errorId : helpText ? helpId : '';
  const len = typeof value === 'string' ? value.length : 0;

  return (
    <FieldShell id={fieldId} label={label} requiredMark={requiredMark} helpText={helpText} error={error} helpId={helpId} errorId={errorId}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        aria-required={requiredMark || undefined}
        className={[
          CONTROL_BASE, 'min-h-20 resize-y px-3 py-2 leading-normal',
          error ? 'border-danger' : 'border-border-strong',
          className,
        ].filter(Boolean).join(' ')}
        {...rest}
      />
      {maxLength && (
        <p className="text-right text-caption text-text-muted tnum">{len}/{maxLength}</p>
      )}
    </FieldShell>
  );
});

// ── Select ──────────────────────────────────────────────────────────────────

export interface SelectProps<T extends string = string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: string;
  options: Option<T>[];
  size?: Size;
  placeholder?: string;
  helpText?: string;
  error?: string;
  requiredMark?: boolean;
}

export function Select<T extends string = string>({
  label, options, size = 'md', placeholder, helpText, error, requiredMark, id, className = '', ...rest
}: SelectProps<T>) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  // Only point at an id that is actually rendered: the help text is hidden
  // while the error is shown, so both can never be referenced at once (FE-014).
  const describedBy = error ? errorId : helpText ? helpId : '';

  return (
    <FieldShell id={fieldId} label={label} requiredMark={requiredMark} helpText={helpText} error={error} helpId={helpId} errorId={errorId}>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        aria-required={requiredMark || undefined}
        className={[
          CONTROL_BASE, FIELD_SIZE[size], 'px-3 pr-9 appearance-none',
          'bg-[url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%238590A8\' stroke-width=\'2\' stroke-linecap=\'round\'><path d=\'M6 9l6 6 6-6\'/></svg>")] bg-[length:18px] bg-[right_0.6rem_center] bg-no-repeat',
          error ? 'border-danger' : 'border-border-strong',
          className,
        ].filter(Boolean).join(' ')}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>{placeholder}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
    </FieldShell>
  );
}

// ── Checkbox ────────────────────────────────────────────────────────────────

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: string;
  description?: string;
  size?: 'sm' | 'md';
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, size = 'md', id, className = '', ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const box = size === 'sm' ? 'size-5' : 'size-6';
  return (
    <div className={['flex items-start gap-3', className].filter(Boolean).join(' ')}>
      <input
        ref={ref}
        id={fieldId}
        type="checkbox"
        className={`${box} mt-0.5 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50`}
        {...rest}
      />
      <div className="flex flex-col">
        <label htmlFor={fieldId} className="cursor-pointer text-body-sm text-text">{label}</label>
        {description && <span className="text-caption text-text-muted">{description}</span>}
      </div>
    </div>
  );
});

// ── Switch ──────────────────────────────────────────────────────────────────

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onCheckedChange, label, description, disabled, id }: SwitchProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const labelId = `${fieldId}-label`;
  const descId = description ? `${fieldId}-desc` : undefined;
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex flex-col">
        {/* A <label for> cannot name a button — the switch needs aria-labelledby (FE-013). */}
        <span id={labelId} className={`text-body-sm ${disabled ? 'text-text-disabled' : 'text-text cursor-pointer'}`}>{label}</span>
        {description && <span id={descId} className="text-caption text-text-muted">{description}</span>}
      </span>
      <button
        type="button"
        id={fieldId}
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-base ease-standard',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-border-strong',
        ].join(' ')}
      >
        <span
          className={[
            'pointer-events-none inline-block size-5 rounded-full bg-white shadow-e1 transition-transform duration-base ease-standard',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

// ── RadioGroup ──────────────────────────────────────────────────────────────

export interface RadioGroupProps<T extends string = string> {
  name: string;
  value: T | null;
  onChange: (v: T) => void;
  options: Option<T>[];
  legend: string;
  orientation?: 'inline' | 'stacked';
  disabled?: boolean;
  error?: string;
}

export function RadioGroup<T extends string = string>({
  name, value, onChange, options, legend, orientation = 'inline', disabled, error,
}: RadioGroupProps<T>) {
  const errorId = `${name}-error`;
  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1 text-label font-medium text-text-secondary">{legend}</legend>
      <div className={orientation === 'inline' ? 'flex flex-wrap gap-4' : 'flex flex-col gap-2'}>
        {options.map((o) => {
          const oid = `${name}-${o.value}`;
          const isDisabled = disabled || o.disabled;
          return (
            <label
              key={o.value}
              htmlFor={oid}
              className={`inline-flex cursor-pointer items-center gap-2.5 rounded-md py-1.5 pr-3 text-body-sm ${isDisabled ? 'cursor-not-allowed text-text-disabled' : 'text-text'}`}
            >
              <input
                type="radio"
                id={oid}
                name={name}
                value={o.value}
                checked={value === o.value}
                disabled={isDisabled}
                onChange={() => onChange(o.value)}
                className="size-5 accent-[var(--color-accent)]"
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {error && <p id={errorId} role="alert" className="text-caption text-danger">{error}</p>}
    </fieldset>
  );
}
