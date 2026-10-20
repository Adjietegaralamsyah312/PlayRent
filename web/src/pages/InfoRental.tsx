import { useState } from 'react';
import { Gamepad2, Package as PackageIcon, Ticket } from 'lucide-react';
import { PageHeader, PageSection } from '../components/AppShell';
import { Button } from '../components/Button';
import { Badge, StatusBadge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { EmptyState, Skeleton } from '../components/Feedback';
import { Tabs, TabPanel } from '../components/Tabs';
import { consoles, games, settings } from '../lib/api';
import { formatDurationShort, formatIDR } from '../lib/format';
import { CONSOLE_STATUS, PLATFORM_LABEL } from '../lib/status';
import { UNIT_CARD_LAYOUT } from '../lib/table-card';
import { useAsync } from '../lib/useAsync';
import type { DurationPackage, Game, PublicConsoleUnit } from '../lib/types';

const TABS = [
  { value: 'unit', label: 'Unit' },
  { value: 'paket', label: 'Paket Durasi' },
  { value: 'game', label: 'Game' },
];

// Shared id prefix so every tab really points at the panel that is in the
// DOM (DS-010 M4).
const TABS_ID = 'info-rental';

export function InfoRental() {
  const [tab, setTab] = useState('unit');

  const units = useAsync(() => consoles.listPublic(), []);
  const packages = useAsync(() => settings.packages(), []);
  const catalog = useAsync(() => games.list(), []);

  const loading = units.loading || packages.loading || catalog.loading;
  const error = units.error ?? packages.error ?? catalog.error;

  const unitColumns: Column<PublicConsoleUnit>[] = [
    {
      ...UNIT_CARD_LAYOUT.code,
      header: 'Unit',
      text: (u) => `Unit ${u.code}`,
      render: (u) => (
        <span className="flex items-center gap-1.5">
          <Gamepad2 className="size-4 text-text-muted" aria-hidden="true" />
          {u.code}
        </span>
      ),
    },
    { ...UNIT_CARD_LAYOUT.type, header: 'Tipe', render: (u) => u.consoleType },
    { ...UNIT_CARD_LAYOUT.room, header: 'Ruangan', render: (u) => u.roomType },
    { ...UNIT_CARD_LAYOUT.controllers, header: 'Controller', numeric: true, render: (u) => String(u.controllers) },
    { ...UNIT_CARD_LAYOUT.rate, header: 'Tarif/jam', numeric: true, render: (u) => formatIDR(u.hourlyRate) },
    { ...UNIT_CARD_LAYOUT.status, header: 'Status', render: (u) => <StatusBadge value={u.status} map={CONSOLE_STATUS} /> },
  ];

  const packageColumns: Column<DurationPackage>[] = [
    { key: 'name', header: 'Paket', primary: true, text: (p) => p.name, render: (p) => p.name },
    { key: 'duration', header: 'Durasi', numeric: true, render: (p) => formatDurationShort(p.durationMinutes) },
    { key: 'type', header: 'Tipe konsol', render: (p) => p.consoleType ?? 'Semua tipe' },
    { key: 'price', header: 'Harga', numeric: true, prominentOnMobile: true, render: (p) => formatIDR(p.price) },
  ];

  const gameColumns: Column<Game>[] = [
    { key: 'title', header: 'Judul', primary: true, text: (g) => g.title, render: (g) => g.title },
    { key: 'platform', header: 'Platform', render: (g) => <Badge tone="neutral">{PLATFORM_LABEL[g.platform]}</Badge> },
    { key: 'genre', header: 'Genre', render: (g) => g.genre },
    {
      key: 'controllers',
      header: 'Controller',
      numeric: true,
      hideOnMobile: true,
      render: (g) => (g.recommendedControllers ? String(g.recommendedControllers) : '—'),
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton variant="text" className="h-8 w-1/2" />
        <Skeleton variant="block" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        variant="error"
        headingLevel={1}
        title="Gagal memuat info rental"
        description={error}
        primaryAction={
          <Button onClick={() => { void units.reload(); void packages.reload(); void catalog.reload(); }}>
            Coba lagi
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <PageHeader title="Info Rental" subtitle="Unit, paket durasi, dan katalog game." />

      <PageSection>
        <Tabs items={TABS} value={tab} onChange={setTab} idPrefix={TABS_ID} />
      </PageSection>

      <TabPanel id={`${TABS_ID}-panel-unit`} value="unit" hidden={tab !== 'unit'}>
        <PageSection title="Daftar unit" description="Tarif per jam, sesuai tipe dan ruangan.">
          <DataTable
            columns={unitColumns}
            rows={units.data?.items ?? []}
            rowKey={(u) => u.id}
            loading={units.loading}
            error={units.error}
            empty={
              <EmptyState
                icon={<Gamepad2 className="size-8" aria-hidden="true" />}
                title="Belum ada unit"
                description="Hubungi Admin untuk informasi unit terbaru."
              />
            }
          />
        </PageSection>
      </TabPanel>

      <TabPanel id={`${TABS_ID}-panel-paket`} value="paket" hidden={tab !== 'paket'}>
        <PageSection title="Paket durasi" description="Harga tetap untuk durasi tertentu.">
          <DataTable
            columns={packageColumns}
            rows={(packages.data?.items ?? []).filter((p) => p.isActive)}
            rowKey={(p) => p.id}
            loading={packages.loading}
            error={packages.error}
            empty={
              <EmptyState
                icon={<PackageIcon className="size-8" aria-hidden="true" />}
                title="Belum ada paket"
                description="Paket durasi akan tampil di sini bila tersedia."
              />
            }
          />
        </PageSection>
      </TabPanel>

      <TabPanel id={`${TABS_ID}-panel-game`} value="game" hidden={tab !== 'game'}>
        <PageSection title="Katalog game" description="Game yang bisa Anda mainkan di unit.">
          <DataTable
            columns={gameColumns}
            rows={catalog.data?.items ?? []}
            rowKey={(g) => g.id}
            loading={catalog.loading}
            error={catalog.error}
            empty={
              <EmptyState
                icon={<Ticket className="size-8" aria-hidden="true" />}
                title="Belum ada game"
                description="Katalog game akan tampil di sini bila tersedia."
              />
            }
          />
        </PageSection>
      </TabPanel>
    </div>
  );
}
