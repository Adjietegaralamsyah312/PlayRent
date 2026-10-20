import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Printer, ReceiptText, TimerReset } from 'lucide-react';
import { Button } from './Button';
import { Input, Textarea } from './Form';
import { Modal } from './Modal';
import { Timer } from './Timer';
import { PaymentMethodPicker } from './PaymentMethodPicker';
import { sessions } from '../lib/api';
import { formatIDR, formatJakarta } from '../lib/format';
import { errorMessage } from '../lib/useAsync';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings-context';
import { useToast } from '../lib/toast';
import { openReceipt } from '../lib/receipt';
import type { PaymentMethod, Quote, RentalSession, Transaction } from '../lib/types';

const EXTEND_CHIPS = [30, 60, 90, 120];
const CASH_CHIPS = [50_000, 100_000, 150_000, 200_000];

/** Whole rupiah only — the API rejects fractional money. */
function toInt(v: string): number {
  const n = Number(v.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function roundUpTo(amount: number, step: number): number {
  return Math.ceil(amount / step) * step;
}

export interface ExtendTarget {
  id: number;
  consoleId: number;
  consoleCode: string | null;
  plannedMinutes: number;
  endsAt: string;
}

/** Dashboard / board / detail all hold a different subset; this is the one shape the dialog wants. */
export function toExtendTarget(s: RentalSession): ExtendTarget {
  return { id: s.id, consoleId: s.consoleId, consoleCode: s.consoleCode, plannedMinutes: s.plannedMinutes, endsAt: s.endsAt };
}

export interface ExtendDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: ExtendTarget | null;
  warnMinutes?: number[];
  onDone: (s: RentalSession) => void;
}

/**
 * specs/sessions.md §3 — quick chips, custom minutes, live price of the extra
 * time and the new endsAt before confirming.
 */
export function ExtendDialog({ open, onOpenChange, session, warnMinutes, onDone }: ExtendDialogProps) {
  const { success } = useToast();
  const [extra, setExtra] = useState(60);
  const [custom, setCustom] = useState('');
  const [extraCost, setExtraCost] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveExtra = custom ? toInt(custom) : extra;

  useEffect(() => {
    if (!open || !session) return;
    setExtra(60);
    setCustom('');
    setFormError(null);
  }, [open, session]);

  // The addition is the difference between the extended quote and the base
  // quote. Both are priced by the server against the RUNNING session, so the
  // session's rate snapshot is used — not the console's current tariff (FE-010).
  useEffect(() => {
    if (!open || !session || effectiveExtra <= 0) { setExtraCost(null); return; }
    let alive = true;
    setQuoteLoading(true);
    Promise.all([
      sessions.quote({ sessionId: session.id }),
      sessions.quote({ sessionId: session.id, extraMinutes: effectiveExtra }),
    ])
      .then(([base, next]) => { if (alive) setExtraCost(Math.max(0, next.total - base.total)); })
      .catch(() => { if (alive) setExtraCost(null); })
      .finally(() => { if (alive) setQuoteLoading(false); });
    return () => { alive = false; };
  }, [open, session, effectiveExtra]);

  const newEndsAt = new Date(new Date(session?.endsAt ?? Date.now()).getTime() + effectiveExtra * 60_000);

  async function handleSubmit() {
    if (!session) return;
    if (effectiveExtra < 1) { setFormError('Durasi tambahan minimal 1 menit.'); return; }
    setSubmitting(true);
    setFormError(null);
    try {
      const { session: updated } = await sessions.extend(session.id, effectiveExtra);
      success(`Sesi ${updated.consoleCode ?? ''} ditambah ${effectiveExtra} menit.`.trim());
      onDone(updated);
      onOpenChange(false);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Perpanjang sesi"
      description={session ? `Konsol ${session.consoleCode ?? '—'}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Batal</Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            loadingText="Memproses…"
            iconLeft={<TimerReset className="size-4" aria-hidden="true" />}
            disabled={effectiveExtra < 1}
          >
            Perpanjang {effectiveExtra > 0 ? `${effectiveExtra} menit` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {session && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
            <span className="flex items-center gap-2 text-body-sm text-text-secondary">
              <Clock className="size-4 shrink-0" aria-hidden="true" />
              Sisa waktu
            </span>
            <Timer endsAt={session.endsAt} warnMinutes={warnMinutes} size="md" />
          </div>
        )}

        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-label font-medium text-text-secondary">Tambahan durasi</legend>
          <div className="flex flex-wrap gap-2">
            {EXTEND_CHIPS.map((m) => (
              <Button
                key={m}
                type="button"
                variant={!custom && extra === m ? 'primary' : 'secondary'}
                size="sm"
                aria-pressed={!custom && extra === m}
                onClick={() => { setExtra(m); setCustom(''); }}
              >
                +{m} menit
              </Button>
            ))}
          </div>
          <Input
            label="Atau isi manual (menit)"
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="mis. 45"
          />
        </fieldset>

        <dl className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 text-body-sm">
          <div className="flex items-center justify-between">
            <dt className="text-text-secondary">Tambahan biaya</dt>
            <dd className="tnum font-semibold text-text">
              {quoteLoading ? 'Menghitung…' : extraCost !== null ? formatIDR(extraCost) : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-secondary">Berakhir</dt>
            <dd className="font-medium text-text">
              {newEndsAt ? formatJakarta(newEndsAt.toISOString(), 'time') : '—'}
            </dd>
          </div>
        </dl>

        {/* The session is already past its end: the extra minutes are minutes
            that were already billed, so the extension does not add to the bill. */}
        {extraCost === 0 && !quoteLoading && effectiveExtra > 0 && (
          <p className="text-caption text-text-muted">
            Perpanjangan ini tidak menambah tagihan — waktu tersebut sudah ditagih.
          </p>
        )}

        {formError && <p role="alert" className="text-body-sm text-danger">{formError}</p>}
      </div>
    </Modal>
  );
}

// ── Finish ──────────────────────────────────────────────────────────────────

export interface FinishTarget {
  id: number;
  consoleId: number;
  consoleCode: string | null;
  customerName: string;
  plannedMinutes: number;
  endsAt: string;
  rateSnapshot: number;
}

export function toFinishTarget(s: RentalSession): FinishTarget {
  return {
    id: s.id, consoleId: s.consoleId, consoleCode: s.consoleCode, customerName: s.customerName,
    plannedMinutes: s.plannedMinutes, endsAt: s.endsAt, rateSnapshot: s.rateSnapshot,
  };
}

export interface FinishDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: FinishTarget | null;
  onPaid?: (tx: Transaction) => void;
}

export function FinishDialog({ open, onOpenChange, session, onPaid }: FinishDialogProps) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { success, error: toastError } = useToast();
  const [estimate, setEstimate] = useState<Quote | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [extraCharge, setExtraCharge] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [paid, setPaid] = useState<Transaction | null>(null);

  const isAdmin = user?.role === 'superadmin';
  const methods = settings?.payments?.methods ?? ['cash', 'transfer', 'qris'];

  useEffect(() => {
    if (!open || !session) return;
    setPaid(null);
    setMethod(null);
    setAmountPaid('');
    setDiscount('');
    setDiscountReason('');
    setExtraCharge('');
    setNotes('');
    setFormError(null);
    setQuoteError(null);
    setEstimate(null);

    // The server prices the running session: its rate snapshot, the real
    // clock and the overtime tariff. The client never estimates overtime
    // itself — the preview IS the server's number (FE-004/FE-010).
    let alive = true;
    sessions.quote({ sessionId: session.id })
      .then((q) => { if (alive) setEstimate(q); })
      .catch((e) => { if (alive) { setEstimate(null); setQuoteError(errorMessage(e)); } });
    return () => { alive = false; };
  }, [open, session]);

  const subtotal = estimate?.subtotal ?? 0;
  const overtimeAmount = estimate?.overtimeAmount ?? 0;
  const discountValue = toInt(discount);
  const chargeValue = toInt(extraCharge);
  // Same cap as the server: the discount can never exceed the gross amount.
  const gross = subtotal + overtimeAmount + chargeValue;
  const total = Math.max(0, gross - Math.min(discountValue, gross));
  const paidValue = method === 'cash' ? toInt(amountPaid) : total;
  const changeDue = Math.max(0, paidValue - total);
  const shortPaid = method === 'cash' && paidValue < total;

  useEffect(() => {
    if (method && method !== 'cash') setAmountPaid(String(total));
  }, [method, total]);

  async function handleSubmit() {
    if (!session || !method) { setFormError('Pilih metode pembayaran.'); return; }
    if (!estimate) { setFormError('Tagihan belum selesai dihitung. Tutup dan buka lagi dialog ini.'); return; }
    if (shortPaid) { setFormError('Jumlah dibayar kurang dari total tagihan.'); return; }
    if (discountValue > 0 && discountReason.trim().length < 3) {
      setFormError('Alasan diskon wajib diisi (minimal 3 karakter).');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const { transaction } = await sessions.finish(session.id, {
        paymentMethod: method,
        amountPaid: paidValue,
        discount: discountValue || undefined,
        discountReason: discountReason.trim() || undefined,
        extraCharge: chargeValue || undefined,
        notes: notes.trim() || undefined,
      });
      setPaid(transaction);
      success(`Sesi ${session.consoleCode ?? ''} selesai.`.trim());
      onPaid?.(transaction);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function printReceipt() {
    if (!paid) return;
    const res = openReceipt(paid.id, true);
    if (!res.ok) toastError('Popup diblokir peramban. Izinkan popup lalu coba lagi.');
  }

  if (paid) {
    return (
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title="Pembayaran berhasil"
        size="sm"
        dismissible={false}
        footer={
          <>
            <Button variant="secondary" onClick={printReceipt} iconLeft={<Printer className="size-4" aria-hidden="true" />}>
              Cetak struk
            </Button>
            <Button onClick={() => onOpenChange(false)}>Selesai</Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
          <div>
            <p className="text-body-sm text-text-secondary">Total dibayar</p>
            <p className="text-h1 font-bold tnum text-text">{formatIDR(paid.total)}</p>
          </div>
          {paid.changeDue > 0 && (
            <p className="text-body-sm text-text-secondary">
              Kembalian <span className="tnum font-semibold text-success">{formatIDR(paid.changeDue)}</span>
            </p>
          )}
          <p className="text-caption text-text-muted">No. {paid.number}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Selesaikan & bayar"
      description={session ? `${session.consoleCode ?? '—'} · ${session.customerName}` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Batal</Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            loadingText="Memproses…"
            iconLeft={<ReceiptText className="size-4" aria-hidden="true" />}
            disabled={!method || shortPaid || !estimate}
          >
            {method && method !== 'cash' ? 'Bayar' : 'Bayar tunai'} · {estimate ? formatIDR(total) : '…'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {session && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
            <span className="flex items-center gap-2 text-body-sm text-text-secondary">
              <Clock className="size-4 shrink-0" aria-hidden="true" />
              Waktu tersisa
            </span>
            <Timer endsAt={session.endsAt} size="md" />
          </div>
        )}

        <dl className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 text-body-sm">
          <div className="flex items-center justify-between">
            <dt className="text-text-secondary">Sewa {session ? `${session.plannedMinutes}` : ''} menit</dt>
            <dd className="tnum text-text">{formatIDR(subtotal)}</dd>
          </div>
          {overtimeAmount > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-warning">
                Kelebihan {estimate?.overtimeMinutes ?? 0} menit
              </dt>
              <dd className="tnum text-warning">{formatIDR(overtimeAmount)}</dd>
            </div>
          )}
          {chargeValue > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Biaya tambahan</dt>
              <dd className="tnum text-text">{formatIDR(chargeValue)}</dd>
            </div>
          )}
          {discountValue > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-success">Diskon</dt>
              <dd className="tnum text-success">−{formatIDR(discountValue)}</dd>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-body">
            <dt className="font-medium text-text">Total</dt>
            <dd className="tnum font-bold text-text">{formatIDR(total)}</dd>
          </div>
          {quoteError ? (
            <p role="alert" className="text-caption text-danger">
              Gagal menghitung tagihan: {quoteError}
            </p>
          ) : (
            <p className="text-caption text-text-muted">
              {estimate
                ? 'Harga dihitung server dari tarif sesi dan waktu berjalan. Total akhir dihitung server saat sesi ditutup.'
                : 'Menghitung tagihan…'}
            </p>
          )}
        </dl>

        <PaymentMethodPicker
          value={method}
          onChange={setMethod}
          available={methods as PaymentMethod[]}
          error={!method && formError === 'Pilih metode pembayaran.' ? formError : undefined}
        />

        {method === 'cash' && (
          <div className="flex flex-col gap-2">
            <Input
              label="Jumlah dibayar"
              inputMode="numeric"
              prefix="Rp"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value.replace(/[^\d]/g, ''))}
              error={shortPaid ? 'Kurang dari total tagihan.' : undefined}
              requiredMark
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setAmountPaid(String(total))}>
                Uang pas
              </Button>
              {CASH_CHIPS.map((c) => (
                <Button key={c} type="button" size="sm" variant="secondary" onClick={() => setAmountPaid(String(total + c))}>
                  +{formatIDR(c).replace('Rp', '')}
                </Button>
              ))}
              {CASH_CHIPS.filter((c) => total > c).slice(0, 2).map((c) => (
                <Button
                  key={`r-${c}`}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAmountPaid(String(roundUpTo(total, c <= 20_000 ? 10_000 : c)))}
                >
                  Bulatkan {formatIDR(c).replace('Rp', '')}
                </Button>
              ))}
            </div>
            <p className="text-body-sm text-text-secondary">
              Kembalian: <span className="tnum font-semibold text-success">{formatIDR(changeDue)}</span>
            </p>
          </div>
        )}

        {isAdmin && (
          <details className="rounded-md border border-border bg-surface px-3 py-2.5">
            <summary className="cursor-pointer text-body-sm font-medium text-text-secondary">
              Diskon & biaya tambahan (admin)
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <Input
                label="Diskon"
                inputMode="numeric"
                prefix="Rp"
                value={discount}
                onChange={(e) => setDiscount(e.target.value.replace(/[^\d]/g, ''))}
              />
              {discountValue > 0 && (
                <Input
                  label="Alasan diskon"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  maxLength={120}
                  requiredMark
                />
              )}
              <Input
                label="Biaya tambahan"
                inputMode="numeric"
                prefix="Rp"
                value={extraCharge}
                onChange={(e) => setExtraCharge(e.target.value.replace(/[^\d]/g, ''))}
              />
            </div>
          </details>
        )}

        <Textarea
          label="Catatan (opsional)"
          rows={2}
          maxLength={200}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {formError && formError !== 'Pilih metode pembayaran.' && (
          <p role="alert" className="text-body-sm text-danger">{formError}</p>
        )}
      </div>
    </Modal>
  );
}
