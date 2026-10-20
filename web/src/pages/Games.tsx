import { useState } from 'react';
import { Gamepad2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { Button, IconButton } from '../components/Button';
import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { EmptyState } from '../components/Feedback';
import { Input, Select, Switch, Textarea } from '../components/Form';
import { ConfirmDialog, Modal } from '../components/Modal';
import { games } from '../lib/api';
import { PLATFORM_LABEL } from '../lib/status';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { errorMessage, useAsync, useDebounced } from '../lib/useAsync';
import type { Game, GamePlatform } from '../lib/types';

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'Semua platform' },
  { value: 'PS4', label: 'PS4' },
  { value: 'PS5', label: 'PS5' },
  { value: 'both', label: 'PS4 & PS5' },
];

const FORM_PLATFORM_OPTIONS = PLATFORM_OPTIONS.slice(1);

interface Draft {
  id: string | null;
  title: string;
  platform: GamePlatform;
  genre: string;
  recommendedControllers: string;
  availabilityNote: string;
  isActive: boolean;
}

const EMPTY: Draft = {
  id: null, title: '', platform: 'both', genre: '', recommendedControllers: '2', availabilityNote: '', isActive: true,
};

/** A lookup table, not a catalogue — availability is recorded by staff, never granted here. */
export function Games() {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const isAdmin = user?.role === 'superadmin';

  const [platform, setPlatform] = useState('all');
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null);

  const list = useAsync(
    () => games.list({
      platform: platform === 'all' ? undefined : platform,
      q: search || undefined,
      includeInactive: isAdmin ? includeInactive : undefined,
    }),
    [platform, search, includeInactive, isAdmin],
  );

  const rows = list.data?.items ?? [];

  async function saveDraft() {
    if (!draft) return;
    const payload: Partial<Game> = {
      title: draft.title.trim(),
      platform: draft.platform,
      genre: draft.genre.trim(),
      recommendedControllers: draft.recommendedControllers ? Number(draft.recommendedControllers) : null,
      availabilityNote: draft.availabilityNote.trim() || null,
      isActive: draft.isActive,
    };
    try {
      if (draft.id) await games.update(draft.id, payload);
      else await games.create(payload);
      success(draft.id ? 'Game diperbarui.' : 'Game ditambahkan.');
      setDraft(null);
      void list.reload();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await games.remove(deleteTarget.id);
      success(`Game ${deleteTarget.title} dihapus.`);
      setDeleteTarget(null);
      void list.reload();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  const columns: Column<Game>[] = [
    { key: 'title', header: 'Judul', primary: true, text: (g) => `Game ${g.title}`, render: (g) => g.title },
    { key: 'platform', header: 'Platform', render: (g) => PLATFORM_LABEL[g.platform] },
    { key: 'genre', header: 'Genre', render: (g) => g.genre },
    {
      key: 'controllers',
      header: 'Kontroler',
      numeric: true,
      hideOnMobile: true,
      render: (g) => (g.recommendedControllers ? String(g.recommendedControllers) : '—'),
    },
    {
      key: 'note',
      header: 'Ketersediaan',
      hideOnMobile: true,
      render: (g) => <span className="text-text-muted">{g.availabilityNote || '—'}</span>,
    },
    {
      key: 'active',
      header: 'Status',
      render: (g) => (g.isActive ? <Badge tone="success">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Game"
        subtitle="Daftar judul yang tersedia di outlet."
        actions={
          isAdmin && (
            <Button iconLeft={<Plus className="size-4" aria-hidden="true" />} onClick={() => setDraft({ ...EMPTY })}>
              Tambah game
            </Button>
          )
        }
      />

      <PageSection>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Platform" options={PLATFORM_OPTIONS} value={platform} onChange={(e) => setPlatform(e.target.value)} />
          <Input
            label="Cari judul"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="mis. FIFA"
            prefix={<Search className="size-4" aria-hidden="true" />}
          />
        </div>
        {isAdmin && (
          <div className="mt-3">
            <Switch
              checked={includeInactive}
              onCheckedChange={setIncludeInactive}
              label="Tampilkan game nonaktif"
            />
          </div>
        )}
      </PageSection>

      <PageSection>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(g) => g.id}
          loading={list.loading}
          error={list.error}
          empty={
            <EmptyState
              icon={<Gamepad2 className="size-8" aria-hidden="true" />}
              title="Belum ada game"
              description="Tambahkan judul agar pelanggan bisa melihat katalog."
              primaryAction={isAdmin ? <Button onClick={() => setDraft({ ...EMPTY })}>Tambah game</Button> : undefined}
            />
          }
          rowActions={
            isAdmin
              ? (g) => (
                  <>
                    <IconButton
                      size="sm"
                      icon={<Pencil className="size-4" aria-hidden="true" />}
                      label="Ubah"
                      onClick={() => setDraft({
                        id: g.id, title: g.title, platform: g.platform, genre: g.genre,
                        recommendedControllers: g.recommendedControllers ? String(g.recommendedControllers) : '',
                        availabilityNote: g.availabilityNote ?? '', isActive: g.isActive,
                      })}
                    />
                    <IconButton
                      size="sm"
                      tone="danger"
                      icon={<Trash2 className="size-4" aria-hidden="true" />}
                      label="Hapus"
                      onClick={() => setDeleteTarget(g)}
                    />
                  </>
                )
              : undefined
          }
        />
      </PageSection>

      {isAdmin && (
        <Modal
          open={draft !== null}
          onOpenChange={(v) => !v && setDraft(null)}
          title={draft?.id ? `Ubah ${draft.title}` : 'Tambah game'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>Batal</Button>
              <Button onClick={saveDraft} disabled={!draft?.title.trim() || !draft?.genre.trim()}>Simpan</Button>
            </>
          }
        >
          {draft && (
            <div className="flex flex-col gap-4">
              <Input label="Judul" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={80} requiredMark />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Platform" options={FORM_PLATFORM_OPTIONS} value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value as GamePlatform })} />
                <Input label="Genre" value={draft.genre} onChange={(e) => setDraft({ ...draft, genre: e.target.value })} maxLength={40} placeholder="mis. Sports" requiredMark />
              </div>
              <Input
                label="Kontroler disarankan"
                inputMode="numeric"
                value={draft.recommendedControllers}
                onChange={(e) => setDraft({ ...draft, recommendedControllers: e.target.value.replace(/[^\d]/g, '') })}
              />
              <Textarea
                label="Catatan ketersediaan (opsional)"
                rows={2}
                maxLength={200}
                value={draft.availabilityNote}
                onChange={(e) => setDraft({ ...draft, availabilityNote: e.target.value })}
                helpText="Hanya catatan internal. Sistem tidak memverifikasi kepemilikan game."
              />
              {draft.id && (
                <Switch checked={draft.isActive} onCheckedChange={(v) => setDraft({ ...draft, isActive: v })} label="Game aktif" />
              )}
            </div>
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Hapus ${deleteTarget?.title ?? ''}?`}
        description="Judul dihapus dari daftar game."
        confirmLabel="Hapus"
        tone="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
