import { useState } from 'react';
import { KeyRound, Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { Button, IconButton } from '../components/Button';
import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { EmptyState } from '../components/Feedback';
import { Input, Select, Switch } from '../components/Form';
import { ConfirmDialog, Modal } from '../components/Modal';
import { users } from '../lib/api';
import { formatJakarta } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { errorMessage, useAsync, useDebounced } from '../lib/useAsync';
import type { Role, User } from '../lib/types';
import { ROLE_LABEL } from '../lib/types';

const ROLE_OPTIONS = [
  { value: 'all', label: 'Semua peran' },
  { value: 'superadmin', label: 'Super Admin' },
  { value: 'user', label: 'Pelanggan' },
];

const FORM_ROLE_OPTIONS = ROLE_OPTIONS.slice(1);

interface UserDraft {
  id: string | null;
  username: string;
  fullName: string;
  password: string;
  role: Role;
  isActive: boolean;
}

const EMPTY_USER: UserDraft = { id: null, username: '', fullName: '', password: '', role: 'user', isActive: true };

export function Users() {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [showInactive, setShowInactive] = useState(true);
  const search = useDebounced(q);

  const list = useAsync(
    () => users.list({
      q: search || undefined,
      role: role === 'all' ? undefined : role,
      isActive: showInactive ? undefined : true,
    }),
    [search, role, showInactive],
  );

  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [toggleTarget, setToggleTarget] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = list.data?.items ?? [];
  // The guard must count every Super Admin, not just the rows the active filter happens to show.
  const allUsers = useAsync(() => users.list({}), []);
  const activeAdmins = allUsers.data ? allUsers.data.items.filter((u) => u.role === 'superadmin' && u.isActive).length : null;

  /** Why a row's deactivate action is unavailable — shown before the tap, never as a failed request. */
  function blockReason(u: User): string | null {
    if (u.id === user?.id) return 'Tidak bisa menonaktifkan akun sendiri.';
    if (u.role === 'superadmin' && u.isActive && activeAdmins !== null && activeAdmins <= 1) return 'Harus ada minimal satu Super Admin aktif.';
    return null;
  }

  async function saveUser() {
    if (!draft) return;
    setSaving(true);
    try {
      if (draft.id) {
        await users.update(draft.id, { fullName: draft.fullName.trim(), role: draft.role, isActive: draft.isActive });
      } else {
        await users.create({ username: draft.username.trim(), fullName: draft.fullName.trim(), password: draft.password, role: draft.role });
      }
      success(draft.id ? 'Pengguna diperbarui.' : 'Pengguna ditambahkan.');
      setDraft(null);
      void list.reload();
      void allUsers.reload();
    } catch (e) {
      toastError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    if (!passwordTarget) return;
    setSaving(true);
    try {
      await users.update(passwordTarget.id, { password: newPassword });
      success(`Sandi ${passwordTarget.fullName} diperbarui.`);
      setPasswordTarget(null);
      setNewPassword('');
    } catch (e) {
      toastError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!toggleTarget) return;
    try {
      if (toggleTarget.isActive) await users.deactivate(toggleTarget.id);
      else await users.update(toggleTarget.id, { isActive: true });
      success(toggleTarget.isActive ? `${toggleTarget.fullName} dinonaktifkan.` : `${toggleTarget.fullName} diaktifkan.`);
      setToggleTarget(null);
      void list.reload();
      void allUsers.reload();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  const columns: Column<User>[] = [
    { key: 'fullName', header: 'Nama', primary: true, text: (u) => `Pengguna ${u.fullName}`, render: (u) => u.fullName },
    { key: 'username', header: 'Username', render: (u) => <span className="font-mono">{u.username}</span> },
    {
      key: 'role',
      header: 'Peran',
      render: (u) => <Badge tone={u.role === 'superadmin' ? 'accent' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (u.isActive ? <Badge tone="success">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>),
    },
    { key: 'createdAt', header: 'Dibuat', hideOnMobile: true, render: (u) => formatJakarta(u.createdAt, 'date') },
  ];

  return (
    <div>
      <PageHeader
        title="Pengguna"
        subtitle="Akun Super Admin dan pelanggan."
        actions={
          <Button iconLeft={<Plus className="size-4" aria-hidden="true" />} onClick={() => setDraft({ ...EMPTY_USER })}>
            Tambah pengguna
          </Button>
        }
      />

      <PageSection>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Peran" options={ROLE_OPTIONS} value={role} onChange={(e) => setRole(e.target.value)} />
          <Input
            label="Cari"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nama atau username"
            prefix={<Search className="size-4" aria-hidden="true" />}
          />
        </div>
        <div className="mt-3">
          <Switch checked={!showInactive} onCheckedChange={(v) => setShowInactive(!v)} label="Hanya pengguna aktif" />
        </div>
      </PageSection>

      <PageSection>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(u) => u.id}
          loading={list.loading}
          error={list.error}
          empty={<EmptyState title="Belum ada pengguna" description="Tambahkan akun Super Admin atau pelanggan." primaryAction={<Button onClick={() => setDraft({ ...EMPTY_USER })}>Tambah pengguna</Button>} />}
          rowActions={(u) => {
            const blocked = blockReason(u);
            return (
              <>
                <IconButton
                  size="sm"
                  icon={<Pencil className="size-4" aria-hidden="true" />}
                  label="Ubah pengguna"
                  onClick={() => setDraft({ id: u.id, username: u.username, fullName: u.fullName, password: '', role: u.role, isActive: u.isActive })}
                />
                <IconButton
                  size="sm"
                  icon={<KeyRound className="size-4" aria-hidden="true" />}
                  label="Atur ulang sandi"
                  onClick={() => { setPasswordTarget(u); setNewPassword(''); }}
                />
                <span title={blocked ?? undefined} className="inline-flex">
                  <IconButton
                    size="sm"
                    tone={u.isActive ? 'danger' : 'success'}
                    icon={u.isActive ? <UserX className="size-4" aria-hidden="true" /> : <UserCheck className="size-4" aria-hidden="true" />}
                    label={u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    disabled={Boolean(blocked)}
                    onClick={() => setToggleTarget(u)}
                  />
                </span>
              </>
            );
          }}
        />
      </PageSection>

      <Modal
        open={draft !== null}
        onOpenChange={(v) => !v && setDraft(null)}
        title={draft?.id ? `Ubah ${draft.fullName}` : 'Tambah pengguna'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>Batal</Button>
            <Button
              onClick={saveUser}
              loading={saving}
              loadingText="Menyimpan…"
              disabled={
                !draft?.fullName.trim()
                || (!draft?.id && (!draft?.username.trim() || draft.password.length < 8))
              }
            >
              Simpan
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <Input
              label="Username"
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value.replace(/\s/g, '').toLowerCase() })}
              maxLength={30}
              disabled={Boolean(draft.id)}
              helpText={draft.id ? 'Username tidak dapat diubah.' : 'Tanpa spasi. Digunakan untuk masuk.'}
              requiredMark={!draft.id}
            />
            <Input label="Nama lengkap" value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} maxLength={80} requiredMark />
            {!draft.id && (
              <Input
                label="Sandi awal"
                type="password"
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                helpText="Minimal 8 karakter."
                requiredMark
              />
            )}
            <Select label="Peran" options={FORM_ROLE_OPTIONS} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })} />
            {draft.id && (
              <Switch checked={draft.isActive} onCheckedChange={(v) => setDraft({ ...draft, isActive: v })} label="Akun aktif" />
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={passwordTarget !== null}
        onOpenChange={(v) => !v && setPasswordTarget(null)}
        title="Atur ulang sandi"
        description={passwordTarget ? `Sandi baru untuk ${passwordTarget.fullName}.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasswordTarget(null)}>Batal</Button>
          <Button onClick={savePassword} loading={saving} loadingText="Menyimpan…" disabled={newPassword.length < 8}>
            Simpan sandi
          </Button>
          </>
        }
      >
        <Input
          label="Sandi baru"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          helpText="Minimal 8 karakter."
          requiredMark
        />
      </Modal>

      <ConfirmDialog
        open={toggleTarget !== null}
        onOpenChange={(v) => !v && setToggleTarget(null)}
        title={toggleTarget?.isActive ? `Nonaktifkan ${toggleTarget?.fullName ?? ''}?` : `Aktifkan ${toggleTarget?.fullName ?? ''}?`}
        description={toggleTarget?.isActive ? 'Akun tidak dapat masuk lagi. Riwayat transaksinya tetap tersimpan.' : 'Akun dapat masuk kembali dengan sandi yang sama.'}
        confirmLabel={toggleTarget?.isActive ? 'Nonaktifkan' : 'Aktifkan'}
        tone={toggleTarget?.isActive ? 'destructive' : 'default'}
        onConfirm={toggleActive}
      />
    </div>
  );
}
