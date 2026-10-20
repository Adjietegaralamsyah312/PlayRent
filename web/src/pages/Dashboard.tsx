import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, BellRing, CalendarPlus, ChevronRight, Plus, TriangleAlert } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chart } from '../components/Chart';
import { DateRangePicker } from '../components/DateRangePicker';
import type { DateRange } from '../components/DateRangePicker';
import { EmptyState, Skeleton } from '../components/Feedback';
import { ExtendDialog, FinishDialog, toExtendTarget, toFinishTarget } from '../components/session-dialogs';
import type { ExtendTarget, FinishTarget } from '../components/session-dialogs';
import { Timer } from '../components/Timer';
import { dashboard, sessions } from '../lib/api';
import {
  formatBucketLabel, formatIDR, formatJakarta, formatNumber, greeting, shiftDate, toJakartaDateStr,
} from '../lib/format';
import { useSettings } from '../lib/settings-context';
import { useToast } from '../lib/toast';
import { errorMessage, useAsync } from '../lib/useAsync';
import { usePolling } from '../lib/usePolling';
import type { EndingSoonItem } from '../lib/types';

const UNITS: { key: 'total' | 'available' | 'inUse' | 'reserved' | 'maintenance'; label: string; className: string }[] = [
  { key: 'total', label: 'Total', className: 'text-text' },
  { key: 'available', label: 'Tersedia', className: 'text-success' },
  { key: 'inUse', label: 'Sedang Bermain', className: 'text-cyan' },
  { key: 'reserved', label: 'Dipesan', className: 'text-accent-text' },
  { key: 'maintenance', label: 'Perawatan', className: 'text-warning' },
];

// DESIGN.md §7 D3 — labels, tone and icon together; colour is never the only signal.
const SEVERITY = {
  warn: { label: 'Segera Selesai', tone: 'warning', icon: <BellRing className="size-3.5" aria-hidden="true" /> },
  critical: { label: 'Hampir Habis', tone: 'warning', icon: <BellRing className="size-3.5" aria-hidden="true" /> },
  overdue: { label: 'Lewat Waktu', tone: 'danger', icon: <TriangleAlert className="size-3.5" aria-hidden="true" /> },
} as const;

export function Dashboard() {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const { settings } = useSettings();
  const warnMinutes = settings?.rules.warnMinutes ?? [10, 5, 1];

  const summary = useAsync(() => dashboard.summary(), []);
  const activity = useAsync(() => dashboard.activity(), []);
  const [ending, setEnding] = useState<EndingSoonItem[] | null>(null);

  const [range, setRange] = useState<DateRange>(() => ({
    from: shiftDate(toJakartaDateStr(), -6),
    to: toJakartaDateStr(),
  }));
  const revenue = useAsync(() => dashboard.revenueChart({ from: range.from, to: range.to }), [range.from, range.to]);
  const busy = useAsync(() => dashboard.busyHours({ from: range.from, to: range.to }), [range.from, range.to]);

  const [extendTarget, setExtendTarget] = useState<ExtendTarget | null>(null);
  const [finishTarget, setFinishTarget] = useState<FinishTarget | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  // specs/dashboard.md — the ending-soon strip is the one thing that must be live.
  usePolling(async () => {
    try {
      const { items } = await dashboard.endingSoon();
      setEnding(items);
    } catch {
      /* keep the last good list rather than blanking the strip */
    }
  }, 30_000);

  async function openDialog(kind: 'extend' | 'finish', sessionId: number) {
    setLoadingId(sessionId);
    try {
      const { session } = await sessions.get(sessionId);
      if (kind === 'extend') setExtendTarget(toExtendTarget(session));
      else setFinishTarget(toFinishTarget(session));
    } catch (e) {
      toastError(errorMessage(e));
    } finally {
      setLoadingId(null);
    }
  }

  function refresh() {
    void summary.reload();
    void activity.reload();
    void dashboard.endingSoon().then(({ items }) => setEnding(items)).catch(() => undefined);
  }

  const buckets = revenue.data?.buckets ?? [];
  const hours = busy.data?.hours ?? [];

  // One metric pattern for the whole page: a dense strip, not decorative cards.
  const summaryState = summary.loading && !summary.data
    ? <Skeleton variant="block" />
    : summary.error
      ? (
        <EmptyState
          variant="error"
          title="Gagal memuat ringkasan"
          description={summary.error}
          primaryAction={<Button onClick={() => void summary.reload()}>Coba lagi</Button>}
        />
      )
      : null;

  const unitStrip = summary.data ? (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border sm:grid-cols-5">
      {UNITS.map((u) => (
        <div key={u.key} className="bg-surface p-3">
          <p className="text-caption text-text-muted">{u.label}</p>
          <p className={`mt-1 text-h2 font-bold tnum ${u.className}`}>{formatNumber(summary.data?.units[u.key])}</p>
        </div>
      ))}
    </div>
  ) : null;

  const metricStrip = summary.data ? (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border sm:grid-cols-5">
      {([
        { label: 'Sesi', value: formatNumber(summary.data.today.sessions), tone: 'text-text' },
        { label: 'Transaksi', value: formatNumber(summary.data.today.transactions), tone: 'text-text' },
        { label: 'Pendapatan tercatat', value: formatIDR(summary.data.today.revenue), tone: 'text-accent-text' },
        { label: 'Minggu ini', value: formatIDR(summary.data.range.revenueWeek), tone: 'text-text' },
        { label: 'Bulan ini', value: formatIDR(summary.data.range.revenueMonth), tone: 'text-text' },
      ] as const).map((c) => (
        <div key={c.label} className="bg-surface p-3">
          <p className="text-caption text-text-muted">{c.label}</p>
          <p className={`mt-1 text-h3 font-bold tnum ${c.tone}`}>{c.value}</p>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div>
      <PageHeader
        title={greeting()}
        subtitle={formatJakarta(new Date(), 'long')}
        actions={
          <span className="hidden sm:contents">
            <Button
              variant="secondary"
              iconLeft={<CalendarPlus className="size-4" aria-hidden="true" />}
              onClick={() => navigate('/booking/baru')}
            >
              Booking baru
            </Button>
            <Button iconLeft={<Plus className="size-4" aria-hidden="true" />} onClick={() => navigate('/sesi/baru')}>
              Mulai sesi
            </Button>
          </span>
        }
      />

      {/* HP: dua aksi turun menjadi baris 2-up, di jangkauan ibu jari. */}
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <Button
          size="lg"
          iconLeft={<Plus className="size-5" aria-hidden="true" />}
          onClick={() => navigate('/sesi/baru')}
        >
          Mulai sesi
        </Button>
        <Button
          size="lg"
          variant="secondary"
          iconLeft={<CalendarPlus className="size-5" aria-hidden="true" />}
          onClick={() => navigate('/booking/baru')}
        >
          Booking baru
        </Button>
      </div>

      {ending && ending.length > 0 && (
        <PageSection
          title="Segera berakhir"
          description="Sesi yang mendekati atau melewati waktu selesai."
        >
          <div className="flex flex-col gap-2">
            {ending.map((item) => (
              <div
                key={item.sessionId}
                className={`flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border bg-surface p-3 ${
                  item.severity === 'overdue' ? 'border-danger/50' : 'border-warning/50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-body font-semibold text-text">
                    {item.consoleCode}
                    <Badge tone={SEVERITY[item.severity].tone} withIcon={SEVERITY[item.severity].icon}>
                      {SEVERITY[item.severity].label}
                    </Badge>
                  </p>
                  <p className="truncate text-body-sm text-text-secondary">{item.customerName}</p>
                </div>
                <Timer endsAt={item.endsAt} warnMinutes={warnMinutes} size="md" />
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={loadingId === item.sessionId}
                    onClick={() => void openDialog('extend', item.sessionId)}
                  >
                    Perpanjang
                  </Button>
                  <Button
                    size="sm"
                    loading={loadingId === item.sessionId}
                    onClick={() => void openDialog('finish', item.sessionId)}
                  >
                    Selesaikan
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </PageSection>
      )}

      <PageSection>
        {summaryState ?? unitStrip}
      </PageSection>

      <PageSection>
        {summaryState ?? metricStrip}
      </PageSection>


      <PageSection
        title="Statistik"
        actions={<div className="w-64"><DateRangePicker value={range} onChange={setRange} presets={['today', 'last7', 'thisMonth']} maxDate={toJakartaDateStr()} /></div>}
      >
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card title="Pendapatan tercatat" description="Hanya transaksi lunas pada rentang ini.">
            <Chart
              type="bar"
              valueKind="currency"
              data={buckets.map((b) => ({ label: formatBucketLabel(b.label), value: b.revenue }))}
              loading={revenue.loading}
              error={revenue.error}
              emptyLabel="Belum ada transaksi pada rentang ini."
              ariaLabel="Grafik pendapatan tercatat"
              ariaSummary={`${buckets.length} titik data, total ${formatIDR(buckets.reduce((a, b) => a + b.revenue, 0))}`}
            />
          </Card>
          <Card title="Jam tersibuk" description="Jumlah sesi dimulai per jam.">
            <Chart
              type="line"
              valueKind="count"
              data={hours.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}:00`, value: h.sessions }))}
              loading={busy.loading}
              error={busy.error}
              emptyLabel="Belum ada sesi pada rentang ini."
              ariaLabel="Grafik jam tersibuk"
              ariaSummary={`${hours.length} jam, puncak ${Math.max(0, ...hours.map((h) => h.sessions))} sesi`}
            />
          </Card>
        </div>
      </PageSection>

      <PageSection title="Aktivitas terbaru">
        <Card padding="none">
          {activity.loading && !activity.data ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton variant="text" lines={3} />
            </div>
          ) : activity.error ? (
            <EmptyState
              variant="error"
              title="Gagal memuat aktivitas"
              description={activity.error}
              primaryAction={<Button onClick={() => void activity.reload()}>Coba lagi</Button>}
            />
          ) : (activity.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Activity className="size-8" aria-hidden="true" />}
              title="Belum ada aktivitas"
              description="Mulai sesi pertama untuk melihat riwayat di sini."
            />
          ) : (
            <ul className="divide-y divide-border">
              {activity.data?.items.map((a) => (
                <li key={`${a.type}-${a.refId}-${a.at}`} className="flex items-start gap-3 p-3">
                  <Activity className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm text-text">{a.description}</p>
                    <p className="text-caption text-text-muted">
                      {a.actor} · {formatJakarta(a.at, 'short')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Button
          variant="link"
          className="mt-2"
          iconRight={<ChevronRight className="size-4" aria-hidden="true" />}
          onClick={() => navigate('/transaksi')}
        >
          Lihat semua transaksi
        </Button>
      </PageSection>

      <ExtendDialog
        open={extendTarget !== null}
        onOpenChange={(v) => !v && setExtendTarget(null)}
        session={extendTarget}
        warnMinutes={warnMinutes}
        onDone={() => { success('Sesi diperpanjang.'); refresh(); }}
      />
      <FinishDialog
        open={finishTarget !== null}
        onOpenChange={(v) => !v && setFinishTarget(null)}
        session={finishTarget}
        onPaid={() => refresh()}
      />
    </div>
  );
}
