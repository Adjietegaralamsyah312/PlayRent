import { useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, CalendarClock, Gamepad2, Home, Info, KeyRound, LayoutDashboard, LogOut,
  Menu, MonitorPlay, MoreHorizontal, ReceiptText, Settings, UserRound, Users, Volume2, VolumeX,
} from 'lucide-react';
import { Button, IconButton } from './Button';
import { Drawer } from './Modal';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { useAuth } from '../lib/auth';
import { isMuted, setMuted } from '../lib/sound';
import { formatHeaderDate } from '../lib/format';
import type { Role } from '../lib/types';
import { ROLE_LABEL } from '../lib/types';

interface NavItem { to: string; label: string; icon: typeof LayoutDashboard; roles?: Role[] }

const NAV: NavItem[] = [
  // Super Admin — the operator screens.
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['superadmin'] },
  { to: '/sesi', label: 'Sesi', icon: MonitorPlay, roles: ['superadmin'] },
  { to: '/unit', label: 'Konsol', icon: Gamepad2, roles: ['superadmin'] },
  { to: '/booking', label: 'Booking', icon: CalendarClock, roles: ['superadmin'] },
  { to: '/transaksi', label: 'Transaksi', icon: ReceiptText, roles: ['superadmin'] },
  { to: '/laporan', label: 'Laporan', icon: BarChart3, roles: ['superadmin'] },
  { to: '/games', label: 'Game', icon: Gamepad2, roles: ['superadmin'] },
  { to: '/settings', label: 'Pengaturan', icon: Settings, roles: ['superadmin'] },
  { to: '/users', label: 'Pengguna', icon: Users, roles: ['superadmin'] },
  // Pelanggan — the renter screens.
  { to: '/beranda', label: 'Beranda', icon: Home, roles: ['user'] },
  { to: '/booking-saya', label: 'Booking Saya', icon: CalendarClock, roles: ['user'] },
  { to: '/info-rental', label: 'Info Rental', icon: Info, roles: ['user'] },
  { to: '/akun', label: 'Profil', icon: UserRound, roles: ['user'] },
];

// Bottom nav HP is role-aware (DESIGN.md §6 — five items max, the fifth is
// "Lainnya"). The Super Admin keeps the dashboard: that is the owner screen.
const MOBILE_PRIMARY_SUPERADMIN = ['/dashboard', '/sesi', '/unit', '/transaksi'];
const MOBILE_PRIMARY_USER = ['/beranda', '/booking-saya', '/info-rental', '/akun'];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-text-inverse">
        <Gamepad2 className="size-5" aria-hidden="true" />
      </span>
      <span className="text-h3 font-bold tracking-heading text-text">PlayRent</span>
    </div>
  );
}

function NavList({ items, label, onNavigate }: { items: NavItem[]; label: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            onClick={onNavigate}
            className={({ isActive }) => [
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-body-sm font-medium transition-colors duration-fast',
              isActive ? 'bg-accent-soft text-accent-text' : 'text-text-secondary hover:bg-surface-hover hover:text-text',
            ].join(' ')}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export interface AppShellProps { children: ReactNode }

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [pwdOpen, setPwdOpen] = useState(false);

  const allowed = NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role)));
  const mobilePrimary = user?.role === 'user' ? MOBILE_PRIMARY_USER : MOBILE_PRIMARY_SUPERADMIN;
  const primary = allowed.filter((n) => mobilePrimary.includes(n.to));
  const overflow = allowed.filter((n) => !mobilePrimary.includes(n.to));

  async function handleLogout() {
    await logout();
    navigate('/masuk', { replace: true });
  }

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* ── sidebar (≥1024) ── */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-sidebar p-4 lg:flex">
        <Brand />
        <div className="mt-6 flex-1 overflow-y-auto">
          <NavList items={allowed} label="Navigasi utama" />
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <UserBlock
            name={user?.fullName ?? ''}
            role={user?.role}
            muted={muted}
            onToggleMute={user?.role === 'superadmin' ? () => { setMuted(!muted); setMutedState(!muted); } : undefined}
          />
          <Button variant="ghost" fullWidth className="mt-2 justify-start" onClick={handleLogout} iconLeft={<LogOut className="size-4" aria-hidden="true" />}>
            Keluar
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── topbar ── */}
        <header className="sticky top-0 z-[var(--z-sticky)] flex h-14 shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 shadow-e1 lg:px-6">
          <div className="lg:hidden">
            <IconButton icon={<Menu className="size-5" aria-hidden="true" />} label="Buka menu" onClick={() => setMenuOpen(true)} />
          </div>
          <div className="lg:hidden"><Brand /></div>
          <p className="hidden text-body-sm text-text-secondary lg:block">{formatHeaderDate()}</p>
          <div className="ml-auto flex items-center gap-1">
            <IconButton
              icon={<KeyRound className="size-5" aria-hidden="true" />}
              label="Ubah sandi"
              onClick={() => setPwdOpen(true)}
            />
            {/* The alert chime only plays in the operator screens (Timer), so the
                customer area has no use for it (DS-010 M5). */}
            {user?.role === 'superadmin' && (
              <IconButton
                icon={muted ? <VolumeX className="size-5" aria-hidden="true" /> : <Volume2 className="size-5" aria-hidden="true" />}
                label={muted ? 'Nyalakan suara peringatan' : 'Matikan suara peringatan'}
                onClick={() => { setMuted(!muted); setMutedState(!muted); }}
              />
            )}
            <div className="hidden lg:block">
              <UserBlock name={user?.fullName ?? ''} role={user?.role} />
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 pb-24 lg:px-6 lg:pb-8">
          {/* DESIGN.md §6 — content stops at 1280 px and centres in the remaining space. */}
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </main>

        {/* ── bottom nav (<1024) ── */}
        <nav
          className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] flex items-stretch border-t border-border bg-sidebar lg:hidden"
          style={{ paddingBottom: 'var(--spacing-safe-bottom)' }}
          aria-label="Navigasi bawah"
        >
          {primary.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) => [
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-caption transition-colors duration-fast',
                  isActive ? 'text-accent-text' : 'text-text-muted',
                ].join(' ')}
              >
                <Icon className="size-6" aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
          {/* "Lainnya" only exists when something is left over — a customer has
              all four routes in the bottom bar, so an empty sheet would be a
              dead target (DS-010 B1). */}
          {overflow.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-caption text-text-muted"
            >
              <MoreHorizontal className="size-6" aria-hidden="true" />
              Lainnya
            </button>
          )}
        </nav>
      </div>

      <Drawer open={menuOpen} onOpenChange={setMenuOpen} title="Menu">
        <Brand />
        <div className="mt-5"><NavList items={allowed} label="Navigasi menu" onNavigate={() => setMenuOpen(false)} /></div>
        <div className="mt-5 border-t border-border pt-4">
          <UserBlock name={user?.fullName ?? ''} role={user?.role} />
          <Button variant="ghost" fullWidth className="mt-2 justify-start" onClick={handleLogout} iconLeft={<LogOut className="size-4" aria-hidden="true" />}>
            Keluar
          </Button>
        </div>
      </Drawer>

      {overflow.length > 0 && (
        <Drawer open={moreOpen} onOpenChange={setMoreOpen} title="Menu lainnya" side="bottom">
          <NavList items={overflow} label="Navigasi lainnya" onNavigate={() => setMoreOpen(false)} />
        </Drawer>
      )}

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  );
}

function UserBlock({ name, role, muted, onToggleMute }: {
  name: string; role?: Role; muted?: boolean; onToggleMute?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-body-sm font-semibold text-accent-text">
        {name.slice(0, 1).toUpperCase() || '?'}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body-sm font-medium text-text">{name}</span>
        <span className="text-caption text-text-muted">{role ? ROLE_LABEL[role] : ''}</span>
      </span>
      {onToggleMute && (
        <IconButton
          className="ml-auto"
          size="sm"
          icon={muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
          label={muted ? 'Nyalakan suara peringatan' : 'Matikan suara peringatan'}
          onClick={onToggleMute}
        />
      )}
    </div>
  );
}

// ── Page primitives ─────────────────────────────────────────────────────────

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: { label: string; href?: string }[];
  actions?: ReactNode;
  backTo?: string;
}

export function PageHeader({ title, subtitle, breadcrumb, actions, backTo }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <header className="mb-5 flex flex-col gap-3">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="text-caption text-text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            {breadcrumb.map((b, i) => (
              <li key={`${b.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">/</span>}
                {b.href ? <NavLink to={b.href} className="hover:text-text">{b.label}</NavLink> : <span>{b.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {backTo && (
            <span className="lg:hidden">
              <IconButton icon={<ArrowLeft className="size-5" aria-hidden="true" />} label="Kembali" onClick={() => navigate(backTo)} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-h1 font-bold tracking-heading text-text">{title}</h1>
            {subtitle && <p className="mt-1 text-body-sm text-text-secondary">{subtitle}</p>}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        )}
      </div>
    </header>
  );
}

export interface PageSectionProps { title?: string; description?: string; actions?: ReactNode; children: ReactNode }

export function PageSection({ title, description, actions, children }: PageSectionProps) {
  return (
    <section className="mb-6 flex flex-col gap-3">
      {(title || actions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-h3 font-semibold text-text">{title}</h2>}
            {description && <p className="mt-0.5 text-body-sm text-text-secondary">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export interface StickyActionBarProps { children: ReactNode; visible?: boolean }

export function StickyActionBar({ children, visible = true }: StickyActionBarProps) {
  if (!visible) return null;
  return (
    <>
      {/* HP & tablet (<1024): fixed di atas nav bawah (nav = 60px = 3.75rem). */}
      <div className="fixed inset-x-0 bottom-[calc(3.75rem+var(--spacing-safe-bottom))] z-[var(--z-sticky)] border-t border-border bg-sidebar px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">{children}</div>
      </div>
      {/* Laptop (≥1024): di dalam flow `main` — tidak menutupi konten, tetap di jangkauan mouse. */}
      <div className="sticky bottom-0 z-[var(--z-sticky)] hidden border-t border-border bg-sidebar px-6 py-2.5 lg:flex lg:items-center lg:justify-end lg:gap-2">
        {children}
      </div>
    </>
  );
}
