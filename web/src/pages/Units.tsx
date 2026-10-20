import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, Pencil, Play, Plus, Rows3, Trash2 } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { IconButton } from '../components/Button';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConsoleCard } from '../components/ConsoleCard';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { EmptyState } from '../components/Feedback';
import { Input, Select, Switch, Textarea } from '../components/Form';
import { ConfirmDialog, Modal } from '../components/Modal';
import { StatusBadge } from '../components/Badge';
import { Tabs } from '../components/Tabs';
import { ExtendDialog, FinishDialog, toExtendTarget, toFinishTarget } from '../components/session-dialogs';
import type { ExtendTarget, FinishTarget } from '../components/session-dialogs';
import { consoles, sessions } from '../lib/api';
import { formatIDR } from '../lib/format';
import { CONSOLE_STATUS, effectiveSessionStatus } from '../lib/status';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings-context';
import { useToast } from '../lib/toast';
import { errorMessage, useAsync } from '../lib/useAsync';
import type { ConsoleStatus, ConsoleType, ConsoleUnit, RoomType, RentalSession } from '../lib/types';

const TABS = [
  { value: 'all', label: 'Semua' },
  { value: 'available', label: 'Tersedia' },
  { value: 'in_use', label: 'Sedang Bermain' },
  { value: 'reserved', label: 'Dipesan' },
  { value: 'maintenance', label: 'Perawatan' },
];

const TYPE_OPTIONS = [{ value: 'PS4', label: 'PS4' }, { value: 'PS5', label: 'PS5' }];
const ROOM_OPTIONS = [{ value: 'Reguler', label: 'Reguler' }, { value: 'VIP', label: 'VIP' }];
const STATUS_OPTIONS = [
  { value: 'available', label: 'Tersedia' },
  { value: 'maintenance', label: 'Perawatan' },
];

interface Draft {
  id: string | null;
  code: string;
  consoleType: ConsoleType;
  roomType: RoomType;
  controllers: string;
  hourlyRate: string;
  status: ConsoleStatus;
  conditionNote: string;
  isActive: boolean;
}

const EMPTY_DRAFT: Draft = {
  id: null, code: '', consoleType: 'PS4', roomType: 'Reguler', controllers: '2',
  hourlyRate: '25000', status: 'available', conditionNote: '', isActive: true,
};

function toInt(v: string): number {
  const n = Number(v.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function Units() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const { settings } = useSettings();
  const warnMinutes = settings?.rules.warnMinutes ?? [10, 5, 1];
  const isAdmin = user?.role === 'superadmin';

  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'all';
  const [view, setView] = useState<'grid' | 'table'>('grid');

  const list = useAsync(
    () => consoles.list({ status: status === 'all' ? undefined : status, includeInactive: isAdmin }),
    [status, isAdmin],
  );
  const active = useAsync(() => sessions.active(), []);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConsoleUnit | null>(null);
  const [extendTarget, setExtendTarget] = useState<ExtendTarget | null>(null);
  const [finishTarget, setFinishTarget] = useState<FinishTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const units = list.data?.items ?? [];
  const liveByConsole = new Map<string, RentalSession>((active.data?.items ?? []).map((s) => [s.consoleId, s]));

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

  function refresh() {
    void list.reload();
    void active.reload();
  }

  async function saveDraft() {
    if (!draft) return;
    const payload = {
      code: draft.code.trim().toUpperCase(),
      consoleType: draft.consoleType,
      roomType: draft.roomType,
      controllers: toInt(draft.controllers) || 1,
      hourlyRate: toInt(draft.hourlyRate),
      status: draft.status,
      conditionNote: draft.conditionNote.trim() || null,
      isActive: draft.isActive,
    };
    try {
      if (draft.id) await consoles.update(draft.id, payload);
      else await consoles.create(payload);
      success(draft.id ? 'Konsol diperbarui.' : 'Konsol ditambahkan.');
      setDraft(null);
      refresh();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await consoles.remove(deleteTarget.id);
      success(`Konsol ${deleteTarget.code} dinonaktifkan.`);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  const columns: Column<ConsoleUnit>[] = [
    { key: 'code', header: 'Konsol', primary: true, text: (u) => `Konsol ${u.code}`, render: (u) => u.code },
    { key: 'type', header: 'Tipe', render: (u) => `${u.consoleType} · ${u.roomType}` },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge value={u.status} map={CONSOLE_STATUS} /> },
    { key: 'rate', header: 'Tarif/jam', numeric: true, render: (u) => formatIDR(u.hourlyRate) },
    { key: 'controllers', header: 'Kontroler', numeric: true, hideOnMobile: true, render: (u) => String(u.controllers) },
    {
      key: 'note',
      header: 'Catatan',
      hideOnMobile: true,
      render: (u) => <span className="text-text-muted">{u.conditionNote || '—'}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Konsol"
        subtitle="Status dan kondisi setiap unit."
        actions={
          <>
            <div className="hidden items-center gap-1 rounded-md border border-border p-0.5 sm:flex">
              <IconButton size="sm" icon={<LayoutGrid className="size-4" aria-hidden="true" />} label="Tampilan kartu" onClick={() => setView('grid')} variant={view === 'grid' ? 'solid' : 'ghost'} />
              <IconButton size="sm" icon={<Rows3 className="size-4" aria-hidden="true" />} label="Tampilan tabel" onClick={() => setView('table')} variant={view === 'table' ? 'solid' : 'ghost'} />
            </div>
            {isAdmin && (
              <Button iconLeft={<Plus className="size-4" aria-hidden="true" />} onClick={() => setDraft({ ...EMPTY_DRAFT })}>
                Tambah konsol
              </Button>
            )}
          </>
        }
      />

      <PageSection>
        {list.error ? (
          <EmptyState variant="error" title="Gagal memuat konsol" description={list.error} primaryAction={<Button onClick={refresh}>Coba lagi</Button>} />
        ) : (
          <Tabs
            items={TABS}
            value={status}
            onChange={(v) => setParams(v === 'all' ? {} : { status: v }, { replace: true })}
          />
        )}
      </PageSection>

      {view === 'table' ? (
        <DataTable
          columns={columns}
          rows={units}
          rowKey={(u) => u.id}
          loading={list.loading}
          empty={<EmptyState title="Belum ada konsol" description="Tambahkan unit pertama." primaryAction={isAdmin ? <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>Tambah konsol</Button> : undefined} />}
          rowActions={(u) => (
            <>
              {u.status === 'available' && (
                <IconButton size="sm" tone="success" icon={<Play className="size-4" aria-hidden="true" />} label="Mulai sesi" onClick={() => navigate(`/sesi/baru?consoleId=${u.id}`)} />
              )}
              {isAdmin && (
                <>
                  <IconButton size="sm" icon={<Pencil className="size-4" aria-hidden="true" />} label="Ubah" onClick={() => setDraft({ id: u.id, code: u.code, consoleType: u.consoleType, roomType: u.roomType, controllers: String(u.controllers), hourlyRate: String(u.hourlyRate), status: u.status, conditionNote: u.conditionNote ?? '', isActive: u.isActive })} />
                  <IconButton size="sm" tone="danger" icon={<Trash2 className="size-4" aria-hidden="true" />} label="Nonaktifkan" onClick={() => setDeleteTarget(u)} />
                </>
              )}
            </>
          )}
        />
      ) : list.loading && units.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}><div className="h-24 animate-pulse rounded-md bg-surface-hover" /></Card>
          ))}
        </div>
      ) : units.length === 0 ? (
        <EmptyState
          title="Belum ada konsol"
          description={status === 'all' ? 'Tambahkan unit pertama untuk mulai menyewakan.' : 'Tidak ada konsol dengan status ini.'}
          primaryAction={isAdmin && status === 'all' ? <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>Tambah konsol</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((u) => {
            const s = liveByConsole.get(u.id);
            const looksAvailable = u.status === 'available' && !s;
            return (
              <ConsoleCard
                key={u.id}
                console={u}
                session={s ? { id: s.id, customerName: s.customerName, endsAt: s.endsAt, status: effectiveSessionStatus(s) as 'active' | 'overdue' } : null}
                warnMinutes={warnMinutes}
                busy={busyId === s?.id}
                onStart={looksAvailable ? (id) => navigate(`/sesi/baru?consoleId=${id}`) : undefined}
                onExtend={s ? (sid) => void openDialog('extend', sid) : undefined}
                onFinish={s ? (sid) => void openDialog('finish', sid) : undefined}
                onOpenDetail={s ? () => navigate(`/sesi/${s.id}`) : undefined}
              />
            );
          })}
        </div>
      )}

      {isAdmin && (
        <Modal
          open={draft !== null}
          onOpenChange={(v) => !v && setDraft(null)}
          title={draft?.id ? `Ubah konsol ${draft.code}` : 'Tambah konsol'}
          description="Status Sedang Bermain/Dipesan diatur otomatis oleh sistem saat sesi berjalan."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>Batal</Button>
              <Button onClick={saveDraft} disabled={!draft?.code.trim() || toInt(draft?.hourlyRate ?? '0') <= 0}>
                Simpan
              </Button>
            </>
          }
        >
          {draft && (
            <div className="flex flex-col gap-4">
              <Input label="Kode konsol" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} maxLength={12} placeholder="mis. PS5-01" requiredMark />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Tipe" options={TYPE_OPTIONS} value={draft.consoleType} onChange={(e) => setDraft({ ...draft, consoleType: e.target.value as ConsoleType })} />
                <Select label="Ruangan" options={ROOM_OPTIONS} value={draft.roomType} onChange={(e) => setDraft({ ...draft, roomType: e.target.value as RoomType })} />
                <Input label="Jumlah kontroler" inputMode="numeric" value={draft.controllers} onChange={(e) => setDraft({ ...draft, controllers: e.target.value.replace(/[^\d]/g, '') })} />
                <Input label="Tarif per jam" inputMode="numeric" prefix="Rp" value={draft.hourlyRate} onChange={(e) => setDraft({ ...draft, hourlyRate: e.target.value.replace(/[^\d]/g, '') })} requiredMark />
              </div>
              <Select label="Status" options={STATUS_OPTIONS} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ConsoleStatus })} helpText="Sedang Bermain dan Dipesan diatur otomatis." />
              <Textarea label="Catatan kondisi (opsional)" rows={2} maxLength={200} value={draft.conditionNote} onChange={(e) => setDraft({ ...draft, conditionNote: e.target.value })} />
              {draft.id && (
                <Switch checked={draft.isActive} onCheckedChange={(v) => setDraft({ ...draft, isActive: v })} label="Konsol aktif" description="Nonaktifkan bila unit tidak lagi tersedia untuk disewa." />
              )}
            </div>
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Nonaktifkan konsol ${deleteTarget?.code ?? ''}?`}
        description="Konsol disembunyikan dari daftar penyewaan. Riwayat sesi tetap tersimpan."
        confirmLabel="Nonaktifkan"
        tone="destructive"
        onConfirm={handleDelete}
      />

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
