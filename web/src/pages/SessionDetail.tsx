import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, Clock, History, ReceiptText, TimerReset, User } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { Badge, StatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState, Skeleton } from '../components/Feedback';
import { ConfirmDialog } from '../components/Modal';
import { Timer } from '../components/Timer';
import { ExtendDialog, FinishDialog, toExtendTarget, toFinishTarget } from '../components/session-dialogs';
import type { ExtendTarget, FinishTarget } from '../components/session-dialogs';
import { sessions } from '../lib/api';
import { elapsedMinutes, formatDurationShort, formatIDR, formatJakarta } from '../lib/format';
import { SESSION_STATUS, effectiveSessionStatus } from '../lib/status';
import { useCountdown } from '../lib/useCountdown';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings-context';
import { useToast } from '../lib/toast';
import { errorMessage, useAsync } from '../lib/useAsync';
import { usePolling } from '../lib/usePolling';

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const { settings } = useSettings();
  const warnMinutes = settings?.rules.warnMinutes ?? [10, 5, 1];

  const detail = useAsync(() => sessions.get(id as string), [id]);

  const [extendTarget, setExtendTarget] = useState<ExtendTarget | null>(null);
  const [finishTarget, setFinishTarget] = useState<FinishTarget | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);

  const session = detail.data?.session ?? null;
  const live = session ? ['active', 'overdue'].includes(effectiveSessionStatus(session)) : false;
  // Derived from endsAt on the 1 s tick, same source as <Timer> — not the 15 s poll.
  const countdown = useCountdown(session?.endsAt, warnMinutes);

  // Silent refetch — a 15 s poll must not flash the skeletons.
  usePolling(async () => {
    if (!id) return;
    try {
      detail.setData(await sessions.get(id));
    } catch {
      /* transient — keep showing the last good state */
    }
  }, 15_000, live);

  async function handleVoid(reason: string) {
    if (!session) return;
    try {
      await sessions.void(session.id, reason);
      success('Sesi dibatalkan.');
      setVoidOpen(false);
      void detail.reload();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  if (detail.loading && !detail.data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton variant="text" className="h-8 w-1/3" />
        <Skeleton variant="block" />
        <Skeleton variant="block" />
      </div>
    );
  }

  if (detail.error || !session) {
    return (
      <EmptyState
        variant={detail.error ? 'error' : 'default'}
        title="Sesi tidak ditemukan"
        description={detail.error ?? 'Sesi ini mungkin sudah dihapus atau tautannya salah.'}
        primaryAction={<Button onClick={() => navigate('/sesi')}>Kembali ke daftar sesi</Button>}
      />
    );
  }

  const status = effectiveSessionStatus(session);
  const overtimeMinutes = Math.max(0, Math.ceil(-countdown.remainingSeconds / 60));

  return (
    <div>
      <PageHeader
        title={`Konsol ${session.consoleCode ?? '—'}`}
        subtitle={session.customerName}
        breadcrumb={[{ label: 'Sesi', href: '/sesi' }, { label: session.consoleCode ?? 'Detail' }]}
        backTo="/sesi"
        actions={
          <>
            <StatusBadge value={status} map={SESSION_STATUS} size="md" />
            {live && (
              <>
                <span className="hidden sm:contents">
                  <Button
                    variant="secondary"
                    iconLeft={<TimerReset className="size-4" aria-hidden="true" />}
                    onClick={() => setExtendTarget(toExtendTarget(session))}
                  >
                    Perpanjang
                  </Button>
                </span>
                <Button size="lg" onClick={() => setFinishTarget(toFinishTarget(session))}>Selesaikan</Button>
              </>
            )}
          </>
        }
      />

      {live && (
        <PageSection>
          <div className={`rounded-[var(--radius-lg)] border bg-surface p-5 text-center ${
            status === 'overdue' ? 'border-danger/50' : 'border-border'
          }`}>
            <p className="text-body-sm text-text-secondary">
              {status === 'overdue' ? 'Lewat waktu' : 'Sisa waktu'}
            </p>
            <div className="mt-2 flex justify-center">
              <Timer endsAt={session.endsAt} warnMinutes={warnMinutes} size="lg" />
            </div>
            {status === 'overdue' && (
              <p className="mt-2 text-body-sm text-danger">
                Kelebihan ±{formatDurationShort(overtimeMinutes)} — akan dihitung saat pembayaran.
              </p>
            )}
            {/* HP: "Perpanjang" pindah ke kartu timer, tepat di bawah sisa waktu. */}
            <div className="mt-3 sm:hidden">
              <Button
                variant="secondary"
                fullWidth
                iconLeft={<TimerReset className="size-4" aria-hidden="true" />}
                onClick={() => setExtendTarget(toExtendTarget(session))}
              >
                Perpanjang
              </Button>
            </div>
          </div>
        </PageSection>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <PageSection title="Rincian sesi">
          <Card>
            <dl className="flex flex-col gap-2.5 text-body-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Pelanggan</dt>
                <dd className="flex items-center gap-2 text-text">
                  <User className="size-4 text-text-muted" aria-hidden="true" />
                  {session.customerName}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Kontak</dt>
                <dd className="text-text">{session.customerContact || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Mulai</dt>
                <dd className="text-text">{formatJakarta(session.startedAt, 'short')}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Berakhir</dt>
                <dd className="text-text">{formatJakarta(session.endsAt, 'short')}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Durasi (rencana / tercatat)</dt>
                <dd className="tnum text-text">
                  {formatDurationShort(session.plannedMinutes)} / {formatDurationShort(live ? elapsedMinutes(session.startedAt) : session.billedMinutes)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Tarif per jam</dt>
                <dd className="tnum text-text">{formatIDR(session.rateSnapshot)}</dd>
              </div>
              {session.notes && (
                <div className="flex flex-col gap-1 border-t border-border pt-2">
                  <dt className="text-text-secondary">Catatan</dt>
                  <dd className="text-text">{session.notes}</dd>
                </div>
              )}
            </dl>
          </Card>
        </PageSection>

        <PageSection title="Riwayat perpanjangan">
          <Card>
            {session.extensions.length === 0 ? (
              <p className="flex items-center gap-2 text-body-sm text-text-muted">
                <History className="size-4" aria-hidden="true" />
                Belum ada perpanjangan.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {session.extensions.map((x, i) => (
                  <li key={`${x.at}-${i}`} className="flex items-center justify-between gap-3 text-body-sm">
                    <span className="flex items-center gap-2 text-text">
                      <Clock className="size-4 text-text-muted" aria-hidden="true" />
                      +{formatDurationShort(x.minutes)}
                    </span>
                    <span className="tnum text-text-secondary">{formatJakarta(x.at, 'short')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {session.status === 'finished' && session.transactionId && (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ReceiptText className="size-5 text-text-muted" aria-hidden="true" />
                  <div>
                    <p className="text-body-sm font-medium text-text">Sesi sudah dibayar</p>
                    <p className="text-caption text-text-muted">Lihat struk dan rincian transaksi.</p>
                  </div>
                </div>
                <Button variant="secondary" onClick={() => navigate(`/transaksi/${session.transactionId}`)}>
                  Buka
                </Button>
              </div>
            </Card>
          )}

          {session.status === 'void' && (
            <Card>
              <Badge tone="neutral">Sesi dibatalkan</Badge>
            </Card>
          )}

          {user?.role === 'superadmin' && live && (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body-sm font-medium text-text">Batalkan sesi</p>
                  <p className="text-caption text-text-muted">Tanpa transaksi. Tindakan ini tercatat.</p>
                </div>
                <Button
                  variant="danger"
                  iconLeft={<Ban className="size-4" aria-hidden="true" />}
                  onClick={() => setVoidOpen(true)}
                >
                  Batalkan
                </Button>
              </div>
            </Card>
          )}
        </PageSection>
      </div>

      <ExtendDialog
        open={extendTarget !== null}
        onOpenChange={(v) => !v && setExtendTarget(null)}
        session={extendTarget}
        warnMinutes={warnMinutes}
        onDone={() => { success('Sesi diperpanjang.'); void detail.reload(); }}
      />
      <FinishDialog
        open={finishTarget !== null}
        onOpenChange={(v) => !v && setFinishTarget(null)}
        session={finishTarget}
        onPaid={() => { void detail.reload(); }}
      />
      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title="Batalkan sesi?"
        description={`Sesi ${session.consoleCode ?? ''} atas nama ${session.customerName} akan dibatalkan tanpa transaksi.`}
        confirmLabel="Batalkan sesi"
        tone="destructive"
        reason={{ label: 'Alasan pembatalan', placeholder: 'mis. salah input' }}
        onConfirm={handleVoid}
      />
    </div>
  );
}
