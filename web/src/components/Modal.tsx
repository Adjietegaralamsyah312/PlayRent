import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button, IconButton } from './Button';
import { Input, Textarea } from './Form';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Lock body scroll while an overlay is open. Restores the previous value. */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}

interface OverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labelledBy: string;
  describedBy?: string;
  dismissible: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  shellClassName: string;
  children: ReactNode;
}

/** Shared dialog shell: portal, focus trap, Esc, focus restore, scroll lock. */
function Overlay({
  open, onOpenChange, labelledBy, describedBy, dismissible, initialFocusRef, shellClassName, children,
}: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const target = initialFocusRef?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissible) { e.stopPropagation(); onOpenChange(false); return; }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) { e.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      restoreRef.current?.focus?.();
    };
  }, [open, dismissible, onOpenChange, initialFocusRef]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center sm:items-center sm:p-4 print:hidden">
      <div
        className="absolute inset-0 bg-overlay"
        style={{ animation: 'pr-fade var(--duration-base) var(--ease-out)' }}
        onClick={() => dismissible && onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={[
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface-2 shadow-e3 outline-none',
          'rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)]',
          shellClassName,
        ].join(' ')}
        style={{ animation: 'pr-slide-up var(--duration-slow) var(--ease-out)' }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function DragHandle() {
  return <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden="true" />;
}

// ── Modal ───────────────────────────────────────────────────────────────────

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const MODAL_WIDTH: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
};

export function Modal({
  open, onOpenChange, title, description, size = 'md', children, footer,
  dismissible = true, initialFocusRef,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  return (
    <Overlay
      open={open}
      onOpenChange={onOpenChange}
      labelledBy={titleId}
      describedBy={description ? descId : undefined}
      dismissible={dismissible}
      initialFocusRef={initialFocusRef}
      shellClassName={MODAL_WIDTH[size]}
    >
      <DragHandle />
      <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-4 sm:pt-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-h2 font-semibold text-text">{title}</h2>
          {description && <p id={descId} className="mt-1 text-body-sm text-text-secondary">{description}</p>}
        </div>
        {dismissible && (
          <IconButton
            icon={<X className="size-5" aria-hidden="true" />}
            label="Tutup"
            onClick={() => onOpenChange(false)}
            className="-mr-1 -mt-1"
          />
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
      {footer && (
        <footer
          className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end"
          style={{ paddingBottom: 'calc(1rem + var(--spacing-safe-bottom))' }}
        >
          {footer}
        </footer>
      )}
    </Overlay>
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────────

export interface DrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  side?: 'right' | 'bottom';
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Drawer({ open, onOpenChange, side = 'right', title, children, footer, width = 'min(480px, 100vw)' }: DrawerProps) {
  const titleId = useId();
  const isBottom = side === 'bottom';
  return (
    <Overlay
      open={open}
      onOpenChange={onOpenChange}
      labelledBy={titleId}
      dismissible
      shellClassName=""
    >
      {isBottom && <DragHandle />}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4">
        <h2 id={titleId} className="truncate text-h3 font-semibold text-text">{title}</h2>
        <IconButton icon={<X className="size-5" aria-hidden="true" />} label="Tutup" onClick={() => onOpenChange(false)} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      {footer && <footer className="shrink-0 border-t border-border p-4">{footer}</footer>}
      {/* The Overlay centres a fixed-width dialog; a Drawer must pin to its edge instead. */}
      <style>{`[role="dialog"][aria-labelledby="${titleId}"]{${isBottom ? '' : `margin-inline-start:auto;height:100dvh;max-height:100dvh;width:${width};max-width:100vw;`}}`}</style>
    </Overlay>
  );
}

// ── ConfirmDialog ───────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'destructive';
  /** Called with the collected reason ('' when no reason field is configured). */
  onConfirm: (reason: string) => void | Promise<void>;
  submitting?: boolean;
  error?: string | null;
  requireText?: string;
  /** When set, a reason textarea is rendered inside the dialog. */
  reason?: { label: string; placeholder?: string; optional?: boolean };
}

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, cancelLabel = 'Batal',
  tone = 'default', onConfirm, submitting = false, error, requireText, reason,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => { setTyped(''); setReasonText(''); }, []);
  useEffect(() => { if (!open) reset(); }, [open, reset]);

  const reasonMissing = Boolean(reason) && reason?.optional !== true && reasonText.trim().length < 3;
  const textMatches = !requireText || typed.trim() === requireText;
  const disabled = busy || submitting || !textMatches || reasonMissing;

  async function handleConfirm() {
    if (disabled) return;
    setBusy(true);
    try { await onConfirm(reasonText.trim()); } finally { setBusy(false); }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      dismissible={!busy && !submitting}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy || submitting}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'destructive' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={busy || submitting}
            loadingText="Memproses…"
            disabled={disabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {reason && (
          <Textarea
            label={reason.label}
            placeholder={reason.placeholder}
            requiredMark={!reason.optional}
            rows={3}
            maxLength={200}
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            error={!reason.optional && reasonText.length > 0 && reasonMissing ? 'Alasan minimal 3 karakter.' : undefined}
          />
        )}
        {requireText && (
          <Input
            label={`Ketik "${requireText}" untuk konfirmasi`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            requiredMark
          />
        )}
        {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
