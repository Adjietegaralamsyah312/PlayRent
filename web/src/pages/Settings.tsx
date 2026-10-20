import { useEffect, useMemo, useState } from 'react';
import { Info, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { PageHeader, PageSection, StickyActionBar } from '../components/AppShell';
import { Button, IconButton } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { EmptyState, Skeleton } from '../components/Feedback';
import { Checkbox, Input, Select, Switch, Textarea } from '../components/Form';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Tabs } from '../components/Tabs';
import { settings as settingsApi } from '../lib/api';
import { formatDurationShort, formatIDR } from '../lib/format';
import { useSettings } from '../lib/settings-context';
import { useToast } from '../lib/toast';
import { errorMessage, useAsync } from '../lib/useAsync';
import type { ConsoleType, DurationPackage, PaymentMethod, Settings } from '../lib/types';

/** The admin form always carries the payment methods — the server only omits them for a customer session. */
type SettingsShape = Omit<Settings, 'payments'> & { payments: { methods: PaymentMethod[] } };

const TABS = [
  { value: 'business', label: 'Usaha' },
  { value: 'pricing', label: 'Tarif & Aturan' },
  { value: 'packages', label: 'Paket Durasi' },
  { value: 'timer', label: 'Timer & Notifikasi' },
  { value: 'payments', label: 'Pembayaran' },
  { value: 'receipt', label: 'Struk' },
];

const METHOD_CHOICES: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Tunai' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'qris', label: 'QRIS' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Semua tipe' },
  { value: 'PS4', label: 'PS4' },
  { value: 'PS5', label: 'PS5' },
];

interface PackageDraft {
  id: string | null;
  name: string;
  durationMinutes: string;
  price: string;
  consoleType: ConsoleType | 'all';
  isActive: boolean;
}

const EMPTY_PACKAGE: PackageDraft = { id: null, name: '', durationMinutes: '60', price: '25000', consoleType: 'all', isActive: true };

function toInt(v: string): number {
  const n = Number(String(v).replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function clone(s: Settings): SettingsShape {
  return {
    business: { ...s.business },
    rules: { ...s.rules, warnMinutes: [...s.rules.warnMinutes] },
    payments: { methods: [...(s.payments?.methods ?? [])] },
  };
}

export function Settings() {
  const { settings, loading, error, reload } = useSettings();
  const { success, error: toastError } = useToast();

  const [tab, setTab] = useState('business');
  const [draft, setDraft] = useState<SettingsShape | null>(null);
  const [warnText, setWarnText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDraft(clone(settings));
    setWarnText(settings.rules.warnMinutes.join(', '));
  }, [settings]);

  const dirty = useMemo(
    () => Boolean(draft && settings && JSON.stringify(draft) !== JSON.stringify(settings)),
    [draft, settings],
  );

  const packages = useAsync(() => settingsApi.packages(), []);
  const [pkgDraft, setPkgDraft] = useState<PackageDraft | null>(null);
  const [pkgDelete, setPkgDelete] = useState<DurationPackage | null>(null);

  function patchRules(patch: Partial<SettingsShape['rules']>) {
    setDraft((d) => (d ? { ...d, rules: { ...d.rules, ...patch } } : d));
  }
  function patchBusiness(patch: Partial<SettingsShape['business']>) {
    setDraft((d) => (d ? { ...d, business: { ...d.business, ...patch } } : d));
  }

  function toggleMethod(m: PaymentMethod, on: boolean) {
    setDraft((d) => {
      if (!d) return d;
      const set = new Set(d.payments?.methods ?? []);
      if (on) set.add(m); else set.delete(m);
      // At least one method must stay enabled or the till cannot close a session.
      if (set.size === 0) return d;
      return { ...d, payments: { methods: METHOD_CHOICES.filter((c) => set.has(c.value)).map((c) => c.value) } };
    });
  }

  function onWarnChange(v: string) {
    setWarnText(v);
    const parsed = [...new Set(v.split(/[,\s]+/).map(toInt).filter((n) => n > 0))].sort((a, b) => b - a);
    if (parsed.length > 0) patchRules({ warnMinutes: parsed });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await settingsApi.update(draft);
      await reload();
      success('Pengaturan disimpan.');
    } catch (e) {
      toastError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function savePackage() {
    if (!pkgDraft) return;
    const body: Partial<DurationPackage> = {
      name: pkgDraft.name.trim(),
      durationMinutes: toInt(pkgDraft.durationMinutes),
      price: toInt(pkgDraft.price),
      consoleType: pkgDraft.consoleType === 'all' ? null : pkgDraft.consoleType,
      isActive: pkgDraft.isActive,
    };
    try {
      if (pkgDraft.id) await settingsApi.updatePackage(pkgDraft.id, body);
      else await settingsApi.createPackage(body);
      success(pkgDraft.id ? 'Paket diperbarui.' : 'Paket ditambahkan.');
      setPkgDraft(null);
      void packages.reload();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  async function deletePackage() {
    if (!pkgDelete) return;
    try {
      await settingsApi.removePackage(pkgDelete.id);
      success(`Paket ${pkgDelete.name} dihapus.`);
      setPkgDelete(null);
      void packages.reload();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  const packageColumns: Column<DurationPackage>[] = [
    { key: 'name', header: 'Nama', primary: true, render: (p) => p.name },
    { key: 'duration', header: 'Durasi', render: (p) => formatDurationShort(p.durationMinutes) },
    { key: 'type', header: 'Tipe konsol', render: (p) => p.consoleType ?? 'Semua' },
    { key: 'price', header: 'Harga', numeric: true, prominentOnMobile: true, render: (p) => formatIDR(p.price) },
    {
      key: 'active',
      header: 'Status',
      render: (p) => (p.isActive ? <Badge tone="success">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>),
    },
  ];

  if (loading && !draft) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton variant="text" className="h-8 w-1/3" />
        <Skeleton variant="block" />
      </div>
    );
  }

  if (error || !draft) {
    return (
      <EmptyState
        variant="error"
        title="Gagal memuat pengaturan"
        description={error ?? 'Pengaturan tidak dapat dimuat.'}
        primaryAction={<Button onClick={() => void reload()}>Coba lagi</Button>}
      />
    );
  }

  return (
    <div>
      <PageHeader title="Pengaturan" subtitle="Aturan tarif, paket, dan identitas usaha." />

      <PageSection>
        <Tabs items={TABS} value={tab} onChange={setTab} />
      </PageSection>

      {tab === 'business' && (
        <PageSection title="Identitas usaha">
          <Card>
            <div className="flex flex-col gap-4">
              <Input label="Nama usaha" value={draft.business.name} onChange={(e) => patchBusiness({ name: e.target.value })} maxLength={80} requiredMark />
              <Input label="Telepon" inputMode="tel" value={draft.business.phone} onChange={(e) => patchBusiness({ phone: e.target.value })} maxLength={30} />
              <Textarea label="Alamat" rows={3} maxLength={200} value={draft.business.address} onChange={(e) => patchBusiness({ address: e.target.value })} />
            </div>
          </Card>
        </PageSection>
      )}

      {tab === 'pricing' && (
        <PageSection title="Tarif & aturan">
          <div className="mb-3 flex items-start gap-2 rounded-md border border-info/40 bg-info-soft px-3 py-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
            <p className="text-body-sm text-text">
              Perubahan berlaku untuk transaksi berikutnya. Sesi yang sedang berjalan tetap memakai tarif saat dimulai.
            </p>
          </div>
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Tarif default per jam" inputMode="numeric" prefix="Rp" value={String(draft.rules.defaultHourlyRate)} onChange={(e) => patchRules({ defaultHourlyRate: toInt(e.target.value) })} requiredMark />
              <Input label="Tarif kelebihan per jam" inputMode="numeric" prefix="Rp" value={String(draft.rules.overtimeRatePerHour)} onChange={(e) => patchRules({ overtimeRatePerHour: toInt(e.target.value) })} />
              <Input label="Durasi minimum (menit)" inputMode="numeric" value={String(draft.rules.minDurationMinutes)} onChange={(e) => patchRules({ minDurationMinutes: toInt(e.target.value) })} requiredMark />
              <Input label="Pembulatan (menit)" inputMode="numeric" value={String(draft.rules.roundingMinutes)} onChange={(e) => patchRules({ roundingMinutes: toInt(e.target.value) })} helpText="Waktu ditagih dibulatkan ke atas sebanyak ini." />
              <Input label="Toleransi kelebihan (menit)" inputMode="numeric" value={String(draft.rules.overtimeGraceMinutes)} onChange={(e) => patchRules({ overtimeGraceMinutes: toInt(e.target.value) })} helpText="Kelebihan di bawah angka ini tidak ditagih." />
            </div>
          </Card>
        </PageSection>
      )}

      {tab === 'packages' && (
        <PageSection
          title="Paket durasi"
          description="Pilihan cepat saat memulai sesi."
          actions={
            <Button iconLeft={<Plus className="size-4" aria-hidden="true" />} onClick={() => setPkgDraft({ ...EMPTY_PACKAGE })}>
              Tambah paket
            </Button>
          }
        >
          <DataTable
            columns={packageColumns}
            rows={packages.data?.items ?? []}
            rowKey={(p) => p.id}
            loading={packages.loading}
            error={packages.error}
            empty={<EmptyState title="Belum ada paket" description="Tambahkan paket durasi agar pelanggan bisa memilih lebih cepat." />}
            rowActions={(p) => (
              <>
                <IconButton
                  size="sm"
                  icon={<Pencil className="size-4" aria-hidden="true" />}
                  label="Ubah paket"
                  onClick={() => setPkgDraft({
                    id: p.id, name: p.name, durationMinutes: String(p.durationMinutes),
                    price: String(p.price), consoleType: p.consoleType ?? 'all', isActive: p.isActive,
                  })}
                />
                <IconButton size="sm" tone="danger" icon={<Trash2 className="size-4" aria-hidden="true" />} label="Hapus paket" onClick={() => setPkgDelete(p)} />
              </>
            )}
          />
        </PageSection>
      )}

      {tab === 'timer' && (
        <PageSection title="Timer & notifikasi">
          <Card>
            <Input
              label="Peringatan sisa waktu (menit)"
              value={warnText}
              onChange={(e) => onWarnChange(e.target.value)}
              placeholder="10, 5, 1"
              helpText="Pisahkan dengan koma. Urut dari peringatan paling awal."
              error={draft.rules.warnMinutes.length === 0 ? 'Isi minimal satu angka.' : undefined}
              requiredMark
            />
            <p className="mt-2 text-caption text-text-muted">
              Timer dihitung dari waktu berakhir sesi, sehingga tetap akurat setelah halaman dimuat ulang.
            </p>
          </Card>
        </PageSection>
      )}

      {tab === 'payments' && (
        <PageSection title="Metode pembayaran">
          <Card>
            <div className="flex flex-col gap-4">
              {METHOD_CHOICES.map((m) => {
                const checked = draft.payments.methods.includes(m.value);
                return (
                  <Checkbox
                    key={m.value}
                    label={m.label}
                    checked={checked}
                    disabled={checked && draft.payments.methods.length === 1}
                    description={checked && draft.payments.methods.length === 1 ? 'Minimal satu metode harus aktif.' : undefined}
                    onChange={(e) => toggleMethod(m.value, e.target.checked)}
                  />
                );
              })}
            </div>
          </Card>
        </PageSection>
      )}

      {tab === 'receipt' && (
        <PageSection title="Struk">
          <Card>
            <div className="flex flex-col gap-4">
              <Input label="Catatan pajak / layanan" value={draft.business.taxNote} onChange={(e) => patchBusiness({ taxNote: e.target.value })} maxLength={120} />
              <Textarea label="Pesan penutup struk" rows={3} maxLength={200} value={draft.business.receiptFooter} onChange={(e) => patchBusiness({ receiptFooter: e.target.value })} />
            </div>
          </Card>
        </PageSection>
      )}

      {dirty && <div className="h-[4.5rem] lg:hidden" aria-hidden="true" />}
      <StickyActionBar visible={dirty}>
        <p className="mr-auto hidden text-body-sm text-text-secondary sm:block">Ada perubahan yang belum disimpan.</p>
        <Button variant="ghost" onClick={() => { if (settings) { setDraft(clone(settings)); setWarnText(settings.rules.warnMinutes.join(', ')); } }} disabled={saving}>
          Batalkan
        </Button>
        <Button iconLeft={<Save className="size-4" aria-hidden="true" />} onClick={save} loading={saving} loadingText="Menyimpan…">
          Simpan perubahan
        </Button>
      </StickyActionBar>

      <Modal
        open={pkgDraft !== null}
        onOpenChange={(v) => !v && setPkgDraft(null)}
        title={pkgDraft?.id ? `Ubah ${pkgDraft.name}` : 'Tambah paket durasi'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPkgDraft(null)}>Batal</Button>
            <Button onClick={savePackage} disabled={!pkgDraft?.name.trim() || toInt(pkgDraft?.durationMinutes ?? '0') <= 0 || toInt(pkgDraft?.price ?? '0') <= 0}>
              Simpan
            </Button>
          </>
        }
      >
        {pkgDraft && (
          <div className="flex flex-col gap-4">
            <Input label="Nama paket" value={pkgDraft.name} onChange={(e) => setPkgDraft({ ...pkgDraft, name: e.target.value })} maxLength={40} placeholder="mis. Paket 2 Jam" requiredMark />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Durasi (menit)" inputMode="numeric" value={pkgDraft.durationMinutes} onChange={(e) => setPkgDraft({ ...pkgDraft, durationMinutes: e.target.value.replace(/[^\d]/g, '') })} requiredMark />
              <Input label="Harga" inputMode="numeric" prefix="Rp" value={pkgDraft.price} onChange={(e) => setPkgDraft({ ...pkgDraft, price: e.target.value.replace(/[^\d]/g, '') })} requiredMark />
            </div>
            <Select label="Tipe konsol" options={TYPE_OPTIONS} value={pkgDraft.consoleType} onChange={(e) => setPkgDraft({ ...pkgDraft, consoleType: e.target.value as ConsoleType | 'all' })} />
            <Switch checked={pkgDraft.isActive} onCheckedChange={(v) => setPkgDraft({ ...pkgDraft, isActive: v })} label="Paket aktif" />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pkgDelete !== null}
        onOpenChange={(v) => !v && setPkgDelete(null)}
        title={`Hapus paket ${pkgDelete?.name ?? ''}?`}
        description="Paket tidak lagi muncul sebagai pilihan saat memulai sesi."
        confirmLabel="Hapus"
        tone="destructive"
        onConfirm={deletePackage}
      />
    </div>
  );
}
