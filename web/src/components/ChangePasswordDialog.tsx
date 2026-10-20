import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Form';
import { Modal } from './Modal';
import { auth } from '../lib/api';
import { errorMessage } from '../lib/useAsync';
import { useToast } from '../lib/toast';

export interface ChangePasswordDialogProps { open: boolean; onOpenChange: (v: boolean) => void }

/** specs/users.md §4.5 — every signed-in user changes their own password from the shell. */
export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { success } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setCurrent(''); setNext(''); setConfirm(''); setError(null); }
  }, [open]);

  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < 8;

  async function submit() {
    if (tooShort) { setError('Sandi baru minimal 8 karakter.'); return; }
    if (mismatch) { setError('Konfirmasi sandi tidak sama.'); return; }
    setBusy(true);
    setError(null);
    try {
      await auth.changePassword(current, next);
      success('Sandi berhasil diubah.');
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Ubah sandi"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button
            onClick={submit}
            loading={busy}
            loadingText="Menyimpan…"
            iconLeft={<KeyRound className="size-4" aria-hidden="true" />}
            disabled={!current || !next || mismatch || tooShort}
          >
            Simpan sandi
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Sandi saat ini"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          requiredMark
        />
        <Input
          label="Sandi baru"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          helpText="Minimal 8 karakter."
          error={tooShort ? 'Minimal 8 karakter.' : undefined}
          requiredMark
        />
        <Input
          label="Ulangi sandi baru"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'Konfirmasi sandi tidak sama.' : undefined}
          requiredMark
        />
        {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
