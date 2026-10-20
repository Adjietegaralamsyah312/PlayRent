import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, ExternalLink, Printer } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { Button } from '../components/Button';
import { Badge, StatusBadge } from '../components/Badge';
import { Card } from '../components/Card';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { EmptyState, Skeleton } from '../components/Feedback';
import { ConfirmDialog } from '../components/Modal';
import { transactions } from '../lib/api';
import { formatIDR, formatJakarta } from '../lib/format';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS, TX_STATUS } from '../lib/status';
import { openReceipt } from '../lib/receipt';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { errorMessage, useAsync } from '../lib/useAsync';
import type { TransactionItem } from '../lib/types';

export function TransactionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const detail = useAsync(() => transactions.get(id as string), [id]);
  const [voidOpen, setVoidOpen] = useState(false);

  const tx = detail.data?.transaction ?? null;
  const items = detail.data?.items ?? [];

  async function handleVoid(reason: string) {
    if (!tx) return;
    try {
      await transactions.void(tx.id, reason);
      success('Transaksi dibatalkan.');
      setVoidOpen(false);
      void detail.reload();
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  // A blocked popup used to fail silently — the operator pressed "Cetak struk"
  // and nothing happened. The internal receipt page is the way out.
  function handlePrint() {
    if (!tx) return;
    const res = openReceipt(tx.id, true);
    if (!res.ok) {
      toastError('Popup diblokir peramban. Izinkan popup lalu coba lagi.', {
        label: 'Buka struk',
        onClick: () => navigate(`/transaksi/${tx.id}/struk`),
      });
    }
  }

  if (detail.loading && !detail.data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton variant="text" className="h-8 w-1/3" />
        <Skeleton variant="block" />
      </div>
    );
  }

  if (detail.error || !tx) {
    return (
      <EmptyState
        variant={detail.error ? 'error' : 'default'}
        title="Transaksi tidak ditemukan"
        description={detail.error ?? 'Transaksi ini mungkin sudah dihapus atau tautannya salah.'}
        primaryAction={<Button onClick={() => navigate('/transaksi')}>Kembali ke daftar transaksi</Button>}
      />
    );
  }

  const columns: Column<TransactionItem>[] = [
    { key: 'description', header: 'Item', primary: true, render: (i) => i.description },
    { key: 'qty', header: 'Qty', numeric: true, render: (i) => String(i.qty) },
    { key: 'unitPrice', header: 'Harga satuan', numeric: true, hideOnMobile: true, render: (i) => formatIDR(i.unitPrice) },
    { key: 'lineTotal', header: 'Jumlah', numeric: true, render: (i) => formatIDR(i.lineTotal) },
  ];

  return (
    <div>
      <PageHeader
        title={tx.number}
        subtitle={tx.customerName}
        breadcrumb={[{ label: 'Transaksi', href: '/transaksi' }, { label: tx.number }]}
        backTo="/transaksi"
        actions={
          <>
            <span className="hidden sm:contents">
              {tx.status === 'completed' && <StatusBadge value={tx.status} map={TX_STATUS} size="md" />}
              {tx.paymentStatus !== 'paid' && tx.status !== 'void' && <StatusBadge value={tx.paymentStatus} map={PAYMENT_STATUS} size="md" />}
            </span>
            <Button size="lg" iconLeft={<Printer className="size-4" aria-hidden="true" />} onClick={handlePrint}>
              Cetak struk
            </Button>
            <span className="hidden sm:contents">
              <Button
                variant="secondary"
                iconLeft={<ExternalLink className="size-4" aria-hidden="true" />}
                onClick={() => navigate(`/transaksi/${tx.id}/struk`)}
              >
                Halaman struk
              </Button>
              {user?.role === 'superadmin' && tx.status === 'completed' && (
                <Button variant="danger" iconLeft={<Ban className="size-4" aria-hidden="true" />} onClick={() => setVoidOpen(true)}>
                  Batalkan
                </Button>
              )}
            </span>
          </>
        }
      />

      {tx.status === 'void' && (
        <PageSection>
          <Card>
            <div className="flex flex-col gap-1.5">
              <Badge tone="danger">Transaksi dibatalkan</Badge>
              <p className="text-body-sm text-text">{tx.voidReason || 'Tanpa alasan tertulis.'}</p>
              <p className="text-caption text-text-muted">
                {tx.voidBy ? `Oleh ${tx.voidBy}` : ''}{tx.voidedAt ? ` · ${formatJakarta(tx.voidedAt, 'short')}` : ''}
              </p>
            </div>
          </Card>
        </PageSection>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <PageSection title="Rincian item">
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(i) => i.id}
            empty={<p className="text-body-sm text-text-muted">Tidak ada item.</p>}
          />
        </PageSection>

        <PageSection title="Pembayaran">
          <Card>
            <dl className="flex flex-col gap-2 text-body-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Subtotal</dt>
                <dd className="tnum text-text">{formatIDR(tx.subtotal)}</dd>
              </div>
              {tx.extraCharge > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Tambahan biaya</dt>
                  <dd className="tnum text-text">{formatIDR(tx.extraCharge)}</dd>
                </div>
              )}
              {tx.discount > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Diskon</dt>
                  <dd className="tnum text-success">−{formatIDR(tx.discount)}</dd>
                </div>
              )}
              {tx.discountReason && (
                <p className="text-caption text-text-muted">Alasan diskon: {tx.discountReason}</p>
              )}
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2">
                <dt className="font-medium text-text">Total</dt>
                <dd className="text-h3 font-semibold tnum text-text">{formatIDR(tx.total)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Metode</dt>
                <dd className="text-text">{PAYMENT_METHOD_LABEL[tx.paymentMethod]}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Dibayar</dt>
                <dd className="tnum text-text">{formatIDR(tx.amountPaid)}</dd>
              </div>
              {tx.changeDue > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Kembalian</dt>
                  <dd className="tnum font-medium text-text">{formatIDR(tx.changeDue)}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            {/* HP: aksi sekunder pindah ke isi halaman — header hanya "Cetak struk". */}
            <div className="mb-3 flex flex-wrap items-center gap-2 sm:hidden">
              {tx.status === 'completed' && <StatusBadge value={tx.status} map={TX_STATUS} size="md" />}
              {tx.paymentStatus !== 'paid' && tx.status !== 'void' && <StatusBadge value={tx.paymentStatus} map={PAYMENT_STATUS} size="md" />}
              {user?.role === 'superadmin' && tx.status === 'completed' && (
                <Button variant="danger" size="sm" iconLeft={<Ban className="size-4" aria-hidden="true" />} onClick={() => setVoidOpen(true)}>
                  Batalkan
                </Button>
              )}
              <Button variant="link" size="sm" onClick={() => navigate(`/transaksi/${tx.id}/struk`)}>
                Halaman struk
              </Button>
            </div>
            <dl className="flex flex-col gap-2 text-body-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Waktu</dt>
                <dd className="text-text">{formatJakarta(tx.createdAt, 'short')}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Super Admin</dt>
                <dd className="text-text">{detail.data?.cashier?.fullName ?? tx.cashierName}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Konsol</dt>
                <dd className="text-text">{detail.data?.console?.code ?? tx.consoleCode}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Sesi</dt>
                <dd>
                  <Button variant="link" size="sm" onClick={() => navigate(`/sesi/${tx.sessionId}`)}>
                    Buka sesi
                  </Button>
                </dd>
              </div>
            </dl>
          </Card>
        </PageSection>
      </div>

      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={`Batalkan transaksi ${tx.number}?`}
        description="Transaksi ditandai dibatalkan dan tidak lagi dihitung sebagai pendapatan."
        confirmLabel="Batalkan transaksi"
        tone="destructive"
        reason={{ label: 'Alasan pembatalan', placeholder: 'mis. salah input nominal' }}
        onConfirm={handleVoid}
      />
    </div>
  );
}
