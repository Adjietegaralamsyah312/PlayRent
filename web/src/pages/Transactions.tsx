import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Printer, Search } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { IconButton } from '../components/Button';
import { StatusBadge } from '../components/Badge';
import { Card } from '../components/Card';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { DateRangePicker } from '../components/DateRangePicker';
import type { DateRange } from '../components/DateRangePicker';
import { EmptyState } from '../components/Feedback';
import { Input, Select } from '../components/Form';
import { ConfirmDialog } from '../components/Modal';
import { Pagination } from '../components/Pagination';
import { transactions } from '../lib/api';
import { formatIDR, formatJakarta, shiftDate, toJakartaDateStr } from '../lib/format';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS } from '../lib/status';
import { openReceipt } from '../lib/receipt';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { errorMessage, useAsync, useDebounced } from '../lib/useAsync';
import type { Transaction } from '../lib/types';

const METHOD_OPTIONS = [
  { value: 'all', label: 'Semua metode' },
  { value: 'cash', label: 'Tunai' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'qris', label: 'QRIS' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Semua status' },
  { value: 'paid', label: 'Lunas' },
  { value: 'unpaid', label: 'Belum Bayar' },
  { value: 'void', label: 'Dibatalkan' },
];

const defaultRange = (): DateRange => ({ from: shiftDate(toJakartaDateStr(), -6), to: toJakartaDateStr() });

export function Transactions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const isAdmin = user?.role === 'superadmin';

  const [range, setRange] = useState<DateRange>(defaultRange);
  const [method, setMethod] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);

  const list = useAsync(
    () => transactions.list({
      from: range.from, to: range.to,
      method: method === 'all' ? undefined : method,
      status: status === 'all' ? undefined : status,
      q: search || undefined,
      page, limit: 20,
    }),
    [range.from, range.to, method, status, search, page],
  );

  const [voidTarget, setVoidTarget] = useState<Transaction | null>(null);

  const rows = list.data?.items ?? [];
  const totals = list.data?.totals;
  const meta = list.data?.meta;

  // Any filter change resets to page 1 so the user never lands on an empty page.
  function withReset<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setPage(1); };
  }

  async function handleVoid(reason: string) {
    if (!voidTarget) return;
    try {
      await transactions.void(voidTarget.id, reason);
      success(`Transaksi ${voidTarget.number} dibatalkan.`);
      setVoidTarget(null);
      void list.reload();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  // A blocked popup used to fail silently — the operator pressed "Cetak struk"
  // and nothing happened. The internal receipt page is the way out.
  function handlePrint(id: string) {
    const res = openReceipt(id, true);
    if (!res.ok) {
      toastError('Popup diblokir peramban. Izinkan popup lalu coba lagi.', {
        label: 'Buka struk',
        onClick: () => navigate(`/transaksi/${id}/struk`),
      });
    }
  }

  const columns: Column<Transaction>[] = [
    {
      key: 'number',
      header: 'Nomor',
      primary: true,
      render: (t) => <span className="font-mono tnum">{t.number}</span>,
    },
    {
      key: 'customer',
      header: 'Pelanggan',
      render: (t) => (
        <div className="flex flex-col">
          <span>{t.customerName}</span>
          <span className="text-caption text-text-muted">{t.consoleCode}</span>
        </div>
      ),
    },
    { key: 'at', header: 'Waktu', hideOnMobile: true, render: (t) => formatJakarta(t.createdAt, 'short') },
    { key: 'method', header: 'Metode', render: (t) => PAYMENT_METHOD_LABEL[t.paymentMethod] },
    {
      key: 'payment',
      header: 'Pembayaran',
      render: (t) => <StatusBadge value={t.paymentStatus} map={PAYMENT_STATUS} />,
    },
    { key: 'total', header: 'Total', numeric: true, prominentOnMobile: true, render: (t) => formatIDR(t.total) },
  ];

  return (
    <div>
      <PageHeader title="Transaksi" subtitle="Riwayat pembayaran dan struk." />

      <PageSection title="Rentang tanggal">
        <Card>
          <DateRangePicker value={range} onChange={withReset(setRange)} />
        </Card>
      </PageSection>

      {totals && (
        <PageSection title="Ringkasan rentang">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border lg:grid-cols-4">
            <div className="bg-surface px-4 py-3">
              <p className="text-caption text-text-secondary">Total tagihan</p>
              <p className="mt-1 text-h3 font-semibold tnum text-text">{formatIDR(totals.gross)}</p>
            </div>
            <div className="bg-surface px-4 py-3">
              <p className="text-caption text-text-secondary">Pendapatan tercatat</p>
              <p className="mt-1 text-h3 font-semibold tnum text-success">{formatIDR(totals.paid)}</p>
            </div>
            <div className="bg-surface px-4 py-3">
              <p className="text-caption text-text-secondary">Belum dibayar</p>
              <p className="mt-1 text-h3 font-semibold tnum text-warning">{formatIDR(totals.outstanding)}</p>
            </div>
            <div className="bg-surface px-4 py-3">
              <p className="text-caption text-text-secondary">Jumlah transaksi</p>
              <p className="mt-1 text-h3 font-semibold tnum text-text">{totals.count}</p>
            </div>
          </div>
        </PageSection>
      )}

      <PageSection>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Metode" options={METHOD_OPTIONS} value={method} onChange={(e) => withReset(setMethod)(e.target.value)} />
          <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={(e) => withReset(setStatus)(e.target.value)} />
          <Input
            label="Cari"
            value={q}
            onChange={(e) => withReset(setQ)(e.target.value)}
            placeholder="Nomor atau nama pelanggan"
            prefix={<Search className="size-4" aria-hidden="true" />}
          />
        </div>
      </PageSection>

      <PageSection>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          loading={list.loading}
          error={list.error}
          onRowClick={(t) => navigate(`/transaksi/${t.id}`)}
          rowLabel={(t) => `Transaksi ${t.number}`}
          empty={
            <EmptyState
              title="Belum ada transaksi"
              description="Tidak ada transaksi pada filter ini."
            />
          }
          rowActions={(t) => (
            <>
              <IconButton
                size="sm"
                icon={<Printer className="size-4" aria-hidden="true" />}
                label={`Cetak struk ${t.number}`}
                onClick={() => handlePrint(t.id)}
              />
              {isAdmin && t.status === 'completed' && (
                <IconButton
                  size="sm"
                  tone="danger"
                  icon={<Ban className="size-4" aria-hidden="true" />}
                  label="Batalkan transaksi"
                  onClick={() => setVoidTarget(t)}
                />
              )}
            </>
          )}
        />

        {meta && meta.total > 0 && (
          <div className="mt-4">
            <Pagination page={page} limit={meta.limit} total={meta.total} onPageChange={setPage} />
          </div>
        )}
      </PageSection>

      <ConfirmDialog
        open={voidTarget !== null}
        onOpenChange={(v) => !v && setVoidTarget(null)}
        title={`Batalkan transaksi ${voidTarget?.number ?? ''}?`}
        description="Transaksi ditandai dibatalkan dan tidak lagi dihitung sebagai pendapatan."
        confirmLabel="Batalkan transaksi"
        tone="destructive"
        reason={{ label: 'Alasan pembatalan', placeholder: 'mis. salah input nominal' }}
        onConfirm={handleVoid}
      />
    </div>
  );
}
