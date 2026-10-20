import { useState } from 'react';
import { Download } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chart } from '../components/Chart';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { DateRangePicker } from '../components/DateRangePicker';
import type { DateRange } from '../components/DateRangePicker';
import { EmptyState } from '../components/Feedback';
import { StatusBadge } from '../components/Badge';
import { Tabs } from '../components/Tabs';
import { reports } from '../lib/api';
import { formatDurationShort, formatIDR, formatJakarta, shiftDate, toJakartaDateStr } from '../lib/format';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS } from '../lib/status';
import { useAsync } from '../lib/useAsync';
import type { ReportRow, Transaction, UnitReport } from '../lib/types';

type TabValue = 'daily' | 'weekly' | 'monthly' | 'units' | 'payments';
type Grain = 'daily' | 'weekly' | 'monthly';

const TABS = [
  { value: 'daily', label: 'Harian' },
  { value: 'weekly', label: 'Mingguan' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'units', label: 'Per Unit' },
  { value: 'payments', label: 'Pembayaran' },
];

const defaultRange = (): DateRange => ({ from: shiftDate(toJakartaDateStr(), -29), to: toJakartaDateStr() });

export function Reports() {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [tab, setTab] = useState<TabValue>('daily');

  const summary = useAsync(() => reports.summary(range), [range.from, range.to]);

  // Only the visible tab is fetched — the other four would be four wasted requests.
  const grain = useAsync(
    () => (tab === 'units' || tab === 'payments' ? Promise.resolve({ items: [] }) : reports[tab as Grain](range)),
    [tab, range.from, range.to],
  );
  const units = useAsync(
    () => (tab === 'units' ? reports.units(range) : Promise.resolve({ items: [] as UnitReport[] })),
    [tab, range.from, range.to],
  );
  const payments = useAsync(
    () => (tab === 'payments'
      ? reports.payments(range)
      : Promise.resolve({ items: [] as Transaction[], totals: { count: 0, gross: 0, paid: 0, outstanding: 0 } })),
    [tab, range.from, range.to],
  );

  const s = summary.data;
  const grainRows = grain.data?.items ?? [];

  const chartData = grainRows.map((r) => ({ label: r.date, value: r.revenue, secondary: r.transactions }));

  const grainColumns: Column<ReportRow>[] = [
    { key: 'date', header: 'Periode', primary: true, render: (r) => r.date },
    { key: 'revenue', header: 'Pendapatan tercatat', numeric: true, render: (r) => formatIDR(r.revenue) },
    { key: 'transactions', header: 'Transaksi', numeric: true, render: (r) => String(r.transactions) },
    { key: 'sessions', header: 'Sesi', numeric: true, hideOnMobile: true, render: (r) => String(r.sessions) },
    { key: 'minutes', header: 'Durasi', numeric: true, hideOnMobile: true, render: (r) => formatDurationShort(r.minutes) },
  ];

  const unitColumns: Column<UnitReport>[] = [
    { key: 'code', header: 'Konsol', primary: true, render: (u) => u.code },
    { key: 'type', header: 'Tipe', render: (u) => `${u.consoleType} · ${u.roomType}` },
    { key: 'sessions', header: 'Sesi', numeric: true, render: (u) => String(u.sessions) },
    { key: 'minutes', header: 'Durasi', numeric: true, hideOnMobile: true, render: (u) => formatDurationShort(u.minutes) },
    { key: 'utilization', header: 'Utilisasi', numeric: true, render: (u) => `${u.utilizationPct}%` },
    { key: 'revenue', header: 'Pendapatan tercatat', numeric: true, prominentOnMobile: true, render: (u) => formatIDR(u.revenue) },
  ];

  const paymentColumns: Column<Transaction>[] = [
    { key: 'number', header: 'Nomor', primary: true, render: (t) => <span className="font-mono tnum">{t.number}</span> },
    { key: 'at', header: 'Waktu', render: (t) => formatJakarta(t.createdAt, 'short') },
    { key: 'method', header: 'Metode', render: (t) => PAYMENT_METHOD_LABEL[t.paymentMethod] },
    { key: 'status', header: 'Pembayaran', render: (t) => <StatusBadge value={t.paymentStatus} map={PAYMENT_STATUS} /> },
    { key: 'total', header: 'Total', numeric: true, prominentOnMobile: true, render: (t) => formatIDR(t.total) },
  ];

  function exportCsv() {
    window.location.href = reports.exportCsvUrl({ type: tab, from: range.from, to: range.to });
  }

  return (
    <div>
      <PageHeader
        title="Laporan"
        subtitle="Rekap pendapatan dan pemakaian unit."
        actions={
          <Button variant="secondary" iconLeft={<Download className="size-4" aria-hidden="true" />} onClick={exportCsv}>
            Ekspor CSV
          </Button>
        }
      />

      <PageSection title="Rentang tanggal">
        <Card>
          <DateRangePicker value={range} onChange={setRange} />
        </Card>
      </PageSection>

      {summary.error ? (
        <PageSection>
          <EmptyState
            variant="error"
            title="Gagal memuat ringkasan"
            description={summary.error}
            primaryAction={<Button onClick={() => void summary.reload()}>Coba lagi</Button>}
          />
        </PageSection>
      ) : (
        <PageSection title="Ringkasan">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border lg:grid-cols-3">
            <div className="bg-surface px-4 py-3">
              <p className="text-caption text-text-secondary">Pendapatan tercatat</p>
              <p className="mt-1 text-h3 font-semibold tnum text-success">{s ? formatIDR(s.revenueRecorded) : '—'}</p>
            </div>
            <div className="bg-surface px-4 py-3">
              <p className="text-caption text-text-secondary">Belum dibayar</p>
              <p className="mt-1 text-h3 font-semibold tnum text-warning">{s ? formatIDR(s.revenueOutstanding) : '—'}</p>
            </div>
            <div className="bg-surface px-4 py-3">
              <p className="text-caption text-text-secondary">Rata-rata per transaksi</p>
              <p className="mt-1 text-h3 font-semibold tnum text-text">{s ? formatIDR(s.avgPerTransaction) : '—'}</p>
            </div>
            <div className="bg-surface px-4 py-3">
              <p className="text-caption text-text-secondary">Transaksi</p>
              <p className="mt-1 text-body font-medium tnum text-text">{s ? s.transactionCount : '—'}</p>
            </div>
            <div className="bg-surface px-4 py-3">
              <p className="text-caption text-text-secondary">Sesi</p>
              <p className="mt-1 text-body font-medium tnum text-text">{s ? s.sessionsCount : '—'}</p>
            </div>
            <div className="bg-surface px-4 py-3">
              <p className="text-caption text-text-secondary">Total durasi</p>
              <p className="mt-1 text-body font-medium tnum text-text">{s ? formatDurationShort(s.totalMinutes) : '—'}</p>
            </div>
          </div>
          {s && s.voidedCount > 0 && (
            <p className="mt-2 text-caption text-text-muted">
              {s.voidedCount} transaksi dibatalkan pada rentang ini — tidak dihitung sebagai pendapatan.
            </p>
          )}
        </PageSection>
      )}

      <PageSection>
        <Tabs items={TABS} value={tab} onChange={(v) => setTab(v as TabValue)} />
      </PageSection>

      {(tab === 'daily' || tab === 'weekly' || tab === 'monthly') && (
        <>
          <PageSection title="Pendapatan tercatat per periode">
            <Card>
              <Chart
                type="bar"
                data={chartData}
                valueKind="currency"
                loading={grain.loading}
                error={grain.error}
                ariaLabel="Grafik pendapatan tercatat per periode"
                ariaSummary={`Pendapatan tercatat per periode, ${grainRows.length} periode.`}
              />
            </Card>
          </PageSection>
          <PageSection>
            <DataTable
              columns={grainColumns}
              rows={grainRows}
              rowKey={(r) => r.date}
              loading={grain.loading}
              error={grain.error}
              empty={<EmptyState title="Belum ada data" description="Tidak ada transaksi pada rentang ini." />}
            />
          </PageSection>
        </>
      )}

      {tab === 'units' && (
        <PageSection>
          <DataTable
            columns={unitColumns}
            rows={units.data?.items ?? []}
            rowKey={(u) => u.consoleId}
            loading={units.loading}
            error={units.error}
            empty={<EmptyState title="Belum ada data unit" description="Tidak ada pemakaian pada rentang ini." />}
          />
        </PageSection>
      )}

      {tab === 'payments' && (
        <>
          {payments.data?.totals && (
            <PageSection>
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border">
                <div className="bg-surface px-4 py-3">
                  <p className="text-caption text-text-secondary">Total tagihan</p>
                  <p className="mt-1 text-body font-medium tnum text-text">{formatIDR(payments.data.totals.gross)}</p>
                </div>
                <div className="bg-surface px-4 py-3">
                  <p className="text-caption text-text-secondary">Pendapatan tercatat</p>
                  <p className="mt-1 text-body font-medium tnum text-success">{formatIDR(payments.data.totals.paid)}</p>
                </div>
                <div className="bg-surface px-4 py-3">
                  <p className="text-caption text-text-secondary">Belum dibayar</p>
                  <p className="mt-1 text-body font-medium tnum text-warning">{formatIDR(payments.data.totals.outstanding)}</p>
                </div>
              </div>
            </PageSection>
          )}
          <PageSection>
            <DataTable
              columns={paymentColumns}
              rows={payments.data?.items ?? []}
              rowKey={(t) => t.id}
              loading={payments.loading}
              error={payments.error}
              empty={<EmptyState title="Belum ada pembayaran" description="Tidak ada transaksi pada rentang ini." />}
            />
          </PageSection>
        </>
      )}

      <p className="mt-2 text-caption text-text-muted">
        Data dihitung dari transaksi yang tercatat. Ekspor mengikuti tab yang sedang aktif.
      </p>
    </div>
  );
}
