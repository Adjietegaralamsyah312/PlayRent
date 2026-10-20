import { useEffect, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ChangePasswordDialog } from '../components/ChangePasswordDialog';
import { Input } from '../components/Form';
import { auth } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatJakarta } from '../lib/format';
import { useToast } from '../lib/toast';
import { errorMessage } from '../lib/useAsync';
import { ROLE_LABEL } from '../lib/types';

export function Akun() {
  const { user, setUser } = useAuth();
  const { success, error: toastError } = useToast();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  useEffect(() => {
    setFullName(user?.fullName ?? '');
    setPhone(user?.phone ?? '');
  }, [user?.fullName, user?.phone]);

  async function save() {
    if (!user) return;
    if (fullName.trim().length < 2) {
      toastError('Nama lengkap minimal 2 karakter.');
      return;
    }
    setSaving(true);
    try {
      const { user: updated } = await auth.updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim() || null,
      });
      setUser(updated);
      success('Profil berhasil disimpan.');
    } catch (e) {
      toastError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Profil" subtitle="Data akun dan keamanan Anda." />

      <PageSection title="Data akun">
        <Card>
          <div className="flex flex-col gap-4">
            <p className="mt-1 text-caption text-text-muted">* wajib diisi</p>
            <Input
              label="Nama lengkap"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={80}
              requiredMark
            />
            <Input
              label="Nomor HP"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={40}
              helpText="Opsional. Dipakai Admin saat menghubungi Anda."
            />
            <div>
              <Button onClick={() => void save()} loading={saving} loadingText="Menyimpan…" iconLeft={<Save className="size-4" aria-hidden="true" />}>
                Simpan
              </Button>
            </div>
          </div>
        </Card>
      </PageSection>

      <PageSection title="Keamanan">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-text">Kata sandi</p>
              <p className="text-caption text-text-muted">Ganti sandi secara berkala untuk keamanan akun.</p>
            </div>
            <Button variant="secondary" iconLeft={<KeyRound className="size-4" aria-hidden="true" />} onClick={() => setPwdOpen(true)}>
              Ubah kata sandi
            </Button>
          </div>
        </Card>
      </PageSection>

      <PageSection title="Informasi akun">
        <Card>
          <dl className="flex flex-col gap-2 text-body-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-secondary">Nama pengguna</dt>
              <dd className="font-mono text-text">{user?.username ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-secondary">Peran</dt>
              <dd className="text-text">{user ? ROLE_LABEL[user.role] : '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-secondary">Dibuat</dt>
              <dd className="text-text">{user ? formatJakarta(user.createdAt, 'date') : '—'}</dd>
            </div>
          </dl>
        </Card>
      </PageSection>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  );
}
