import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/Feedback';
import { Input, Select, Textarea } from '../components/Form';
import { bookings, consoles } from '../lib/api';
import { formatDurationShort, toJakartaDateStr } from '../lib/format';
import { useSettings } from '../lib/settings-context';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { errorCode, errorMessage, useAsync } from '../lib/useAsync';

const CHIPS = [60, 90, 120, 180];

export function BookingNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { success, error: toastError } = useToast();
  const isAdmin = user?.role === 'superadmin';

  const units = useAsync(() => consoles.list({}), []);
  const options = (units.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.code} · ${u.consoleType} ${u.roomType}` }));

  const [consoleId, setConsoleId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [bookingDate, setBookingDate] = useState(params.get('date') ?? toJakartaDateStr());
  const [startTime, setStartTime] = useState('19:00');
  const [duration, setDuration] = useState(60);
  const [custom, setCustom] = useState('');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const minutes = custom ? Number(custom) : duration;
  const minMinutes = settings?.rules.minDurationMinutes ?? 30;

  async function submit() {
    if (!consoleId || !customerName.trim() || minutes < minMinutes) return;
    setSubmitting(true);
    try {
      await bookings.create({
        consoleId,
        customerName: customerName.trim(),
        customerContact: customerContact.trim() || undefined,
        bookingDate,
        startTime,
        durationMinutes: minutes,
        notes: notes.trim() || undefined,
        discount: isAdmin && discount ? Number(discount) : undefined,
      });
      success('Booking dibuat.');
      navigate(`/booking?date=${bookingDate}`, { replace: true });
    } catch (e) {
      toastError(errorCode(e) === 'UNIT_OCCUPIED' ? 'Konsol sudah dipesan pada jam itu.' : errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (units.error) {
    return (
      <EmptyState
        variant="error"
        title="Gagal memuat konsol"
        description={units.error}
        primaryAction={<Button onClick={() => void units.reload()}>Coba lagi</Button>}
      />
    );
  }

  return (
    <div>
      <PageHeader title="Booking baru" subtitle="Pesan konsol untuk jam tertentu." backTo="/booking" />

      <PageSection title="Konsol & jadwal">
        <Card>
          <div className="flex flex-col gap-4">
            <Select
              label="Konsol"
              options={[{ value: '', label: 'Pilih konsol…' }, ...options]}
              value={consoleId}
              onChange={(e) => setConsoleId(e.target.value)}
              helpText="Konsol yang sedang dipakai tetap bisa dipesan untuk jam berikutnya."
              requiredMark
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Tanggal" type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} requiredMark />
              <Input label="Jam mulai" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} requiredMark />
            </div>
          </div>
        </Card>
      </PageSection>

      <PageSection title="Durasi">
        <Card>
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-label font-medium text-text-secondary">Pilihan cepat</legend>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={!custom && duration === m ? 'primary' : 'secondary'}
                  aria-pressed={!custom && duration === m}
                  onClick={() => { setDuration(m); setCustom(''); }}
                >
                  {formatDurationShort(m)}
                </Button>
              ))}
            </div>
            <Input
              label="Atau isi manual (menit)"
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="mis. 45"
              error={minutes > 0 && minutes < minMinutes ? `Minimal ${minMinutes} menit.` : undefined}
            />
          </fieldset>
        </Card>
      </PageSection>

      <PageSection title="Pelanggan">
        <Card>
          <div className="flex flex-col gap-4">
            <Input label="Nama pelanggan" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={80} requiredMark />
            <Input label="Kontak (opsional)" inputMode="tel" value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} maxLength={30} placeholder="mis. 0812…" />
            {isAdmin && (
              <Input label="Diskon (opsional)" inputMode="numeric" prefix="Rp" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d]/g, ''))} helpText="Diskon diterapkan saat sesi dibayar." />
            )}
            <Textarea label="Catatan (opsional)" rows={2} maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Card>
      </PageSection>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={() => navigate('/booking')}>Batal</Button>
        <Button
          iconLeft={<CalendarPlus className="size-4" aria-hidden="true" />}
          onClick={submit}
          loading={submitting}
          loadingText="Menyimpan…"
          disabled={!consoleId || !customerName.trim() || minutes < minMinutes}
        >
          Buat booking
        </Button>
      </div>
    </div>
  );
}
