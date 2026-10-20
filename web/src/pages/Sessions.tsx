import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CheckCircle2, Eye, Plus, Search, TimerReset } from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import { IconButton } from '../components/Button';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/Modal';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { EmptyState } from '../components/Feedback';
import { Input } from '../components/Form';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/Badge';
import { Tabs } from '../components/Tabs';
import { Timer } from '../components/Timer';
import { ExtendDialog, FinishDialog, toExtendTarget, toFinishTarget } from '../components/session-dialogs';
import type { ExtendTarget, FinishTarget } from '../components/session-dialogs';
import { sessions } from '../lib/api';
import { formatDurationShort, formatIDR, formatJakarta } from '../lib/format';
import { SESSION_STATUS, effectiveSessionStatus } from '../lib/status';
import { useAuth } from '../lib/auth';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useSettings } from '../lib/settings-context';
import { useToast } from '../lib/toast';
import { errorMessage, useAsync, useDebounced } from '../lib/useAsync';
import type { RentalSession } from '../lib/types';

const TABS = [
  { value: 'active', label: 'Berjalan' },
  { value: 'overdue', label: 'Lewat Waktu' },
  { value: 'finished', label: 'Selesai' },
  { value: 'all', label: 'Semua' },
];

const STATUS_PARAM: Record<string, string | undefined> = {
  active: 'active', overdue: 'overdue', finished: 'finished', all: undefined,
};

const LIMIT = 20;

function isLive(s: RentalSession): boolean {
  const st = effectiveSessionStatus(s);
  return st === 'active' || st === 'overdue';
}

export function SessionBoard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const { settings } = useSettings();
  const warnMinutes = settings?.rules.warnMinutes ?? [10, 5, 1];
  // The same column renders in the card (<640) and the table (≥640): the timer
  // is the card's headline value, but stays a table-sized cell on the laptop.
  const isNarrow = useMediaQuery('(max-width: 639px)');

  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');
  const query = useDebounced(search, 300);
  const [page, setPage] = useState(1);

  const list = useAsync(
    () => sessions.list({ status: STATUS_PARAM[tab], q: query || undefined, page, limit: LIMIT }),
    [tab, query, page],
  );

  const [extendTarget, setExtendTarget] = useState<ExtendTarget | null>(null);
  const [finishTarget, setFinishTarget] = useState<FinishTarget | null>(null);
  const [voidTarget, setVoidTarget] = useState<RentalSession | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function openDialog(kind: 'extend' | 'finish', sessionId: string) {
    setBusyId(sessionId);
    try {
      const { session } = await sessions.get(sessionId);
      if (kind === 'extend') setExtendTarget(toExtendTarget(session));
      else setFinishTarget(toFinishTarget(session));
    } catch (e) {
      toastError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleVoid(reason: string) {
    if (!voidTarget) return;
    try {
      await sessions.void(voidTarget.id, reason);
      success('Sesi dibatalkan.');
      setVoidTarget(null);
      void list.reload();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  const rows = list.data?.items ?? [];
  const total = list.data?.meta.total ?? rows.length;

  const columns: Column<RentalSession>[] = [
    {
      key: 'console',
      header: 'Konsol',
      primary: true,
      text: (s) => `Sesi ${s.consoleCode ?? ''} — ${s.customerName}`,
      render: (s) => (
        // span, not div: this render sits inside the card's <button> (phrasing content only).
        <span className="flex flex-col">
          <span>{s.consoleCode ?? '—'}</span>
          <span className="text-caption text-text-muted">{s.customerName}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => <StatusBadge value={effectiveSessionStatus(s)} map={SESSION_STATUS} />,
    },
    {
      key: 'ends',
      header: 'Berakhir',
      prominentOnMobile: true,
      render: (s) => (isLive(s) ? <Timer endsAt={s.endsAt} warnMinutes={warnMinutes} size={isNarrow ? 'md' : 'sm'} /> : formatJakarta(s.endsAt, 'time')),
    },
    {
      key: 'started',
      header: 'Mulai',
      hideOnMobile: true,
      render: (s) => (s.startedAt ? formatJakarta(s.startedAt, 'short') : '—'),
    },
    {
      key: 'duration',
      header: 'Durasi',
      numeric: true,
      hideOnMobile: true,
      render: (s) => `${formatDurationShort(s.billedMinutes)} / ${formatDurationShort(s.plannedMinutes)}`,
    },
    {
      key: 'rate',
      header: 'Tarif/jam',
      numeric: true,
      hideOnMobile: true,
      render: (s) => formatIDR(s.rateSnapshot),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Sesi"
        subtitle="Sesi berjalan dan riwayatnya."
        actions={
          <Button iconLeft={<Plus className="size-4" aria-hidden="true" />} onClick={() => navigate('/sesi/baru')}>
            Mulai sesi
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <Tabs items={TABS} value={tab} onChange={(v) => { setTab(v); setPage(1); }} />
        <div className="max-w-sm">
          <Input
            label="Cari"
            placeholder="Nama pelanggan atau kode konsol"
            value={search}
            prefix={<Search className="size-4" aria-hidden="true" />}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={list.loading}
        error={list.error}
        onRowClick={(s) => navigate(`/sesi/${s.id}`)}
        empty={
          <EmptyState
            title={query ? 'Tidak ada sesi yang cocok' : 'Belum ada sesi'}
            description={query ? 'Coba kata kunci lain.' : 'Mulai sesi untuk konsol yang tersedia.'}
            primaryAction={
              !query ? <Button onClick={() => navigate('/sesi/baru')}>Mulai sesi</Button> : undefined
            }
          />
        }
        rowActions={(s) => (
          <>
            <IconButton size="sm" icon={<Eye className="size-4" aria-hidden="true" />} label="Lihat detail" onClick={() => navigate(`/sesi/${s.id}`)} />
            {isLive(s) && (
              <>
                <IconButton
                  size="sm"
                  icon={<TimerReset className="size-4" aria-hidden="true" />}
                  label="Perpanjang sesi"
                  loading={busyId === s.id}
                  onClick={() => void openDialog('extend', s.id)}
                />
                <IconButton
                  size="sm"
                  tone="success"
                  icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
                  label="Selesaikan & bayar"
                  loading={busyId === s.id}
                  onClick={() => void openDialog('finish', s.id)}
                />
                {user?.role === 'superadmin' && (
                  <IconButton
                    size="sm"
                    tone="danger"
                    icon={<Ban className="size-4" aria-hidden="true" />}
                    label="Batalkan sesi"
                    onClick={() => setVoidTarget(s)}
                  />
                )}
              </>
            )}
          </>
        )}
      />

      {total > LIMIT && (
        <div className="mt-4">
          <Pagination page={page} limit={LIMIT} total={total} onPageChange={setPage} />
        </div>
      )}

      <ExtendDialog
        open={extendTarget !== null}
        onOpenChange={(v) => !v && setExtendTarget(null)}
        session={extendTarget}
        warnMinutes={warnMinutes}
        onDone={() => { success('Sesi diperpanjang.'); void list.reload(); }}
      />
      <FinishDialog
        open={finishTarget !== null}
        onOpenChange={(v) => !v && setFinishTarget(null)}
        session={finishTarget}
        onPaid={() => void list.reload()}
      />
      <ConfirmDialog
        open={voidTarget !== null}
        onOpenChange={(v) => !v && setVoidTarget(null)}
        title="Batalkan sesi?"
        description={voidTarget ? `Sesi ${voidTarget.consoleCode ?? ''} atas nama ${voidTarget.customerName} akan dibatalkan tanpa transaksi.` : undefined}
        confirmLabel="Batalkan sesi"
        tone="destructive"
        reason={{ label: 'Alasan pembatalan', placeholder: 'mis. pelanggan membatalkan' }}
        onConfirm={handleVoid}
      />
    </div>
  );
}
