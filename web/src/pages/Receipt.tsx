import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Printer } from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/Button';
import { EmptyState, Skeleton } from '../components/Feedback';
import { transactions } from '../lib/api';
import { formatIDR } from '../lib/format';
import { useAsync } from '../lib/useAsync';

/**
 * ponytail: the backend already renders the receipt document (that is the copy
 * customers get). Rebuilding it in React would duplicate the layout and let the
 * two drift, so this page frames the server HTML and only adds the print chrome.
 */
export function Receipt() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const [frameState, setFrameState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const detail = useAsync(() => transactions.get(id as string), [id]);

  const url = transactions.receiptUrl(id as string);
  const tx = detail.data?.transaction ?? null;

  // An iframe `onError` never fires for HTTP 4xx/5xx bodies, so cap the skeleton.
  useEffect(() => {
    if (frameState !== 'loading') return;
    const timer = window.setTimeout(() => {
      setFrameState((s) => (s === 'loading' ? 'error' : s));
    // 15 s: a cold LAN/phone can take a while; a premature error flashes on success.
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [frameState, url]);

  function print() {
    const win = frame.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Struk"
          subtitle={tx ? `${tx.number} · ${tx.customerName} · ${formatIDR(tx.total)}` : 'Memuat…'}
          breadcrumb={[{ label: 'Transaksi', href: '/transaksi' }, { label: 'Struk' }]}
          actions={
            <>
              <Button
                variant="secondary"
                iconLeft={<ArrowLeft className="size-4" aria-hidden="true" />}
                onClick={() => navigate(`/transaksi/${id}`)}
              >
                Kembali
              </Button>
              <Button
                variant="secondary"
                iconLeft={<ExternalLink className="size-4" aria-hidden="true" />}
                onClick={() => window.open(url, '_blank', 'noopener')}
              >
                Buka tab baru
              </Button>
              <Button iconLeft={<Printer className="size-4" aria-hidden="true" />} onClick={print}>
                Cetak
              </Button>
            </>
          }
        />
      </div>

      <div className="relative overflow-hidden rounded-[var(--radius-lg)]">
        <iframe
          ref={frame}
          src={url}
          title="Struk transaksi"
          onLoad={() => setFrameState('loaded')}
          onError={() => setFrameState('error')}
          className="h-[80dvh] w-full rounded-[var(--radius-lg)] border border-border bg-surface print:h-[100dvh] print:border-0"
        />
        {frameState === 'loading' && (
          <div className="absolute inset-0 print:hidden" aria-hidden="true">
            <Skeleton variant="block" className="h-full w-full" />
          </div>
        )}
        {frameState === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface print:hidden">
            <EmptyState
              variant="error"
              title="Gagal memuat struk"
              description="Struk tidak dapat ditampilkan di sini."
              primaryAction={<Button onClick={() => window.open(url, '_blank', 'noopener')}>Buka tab baru</Button>}
            />
          </div>
        )}
      </div>
    </div>
  );
}
