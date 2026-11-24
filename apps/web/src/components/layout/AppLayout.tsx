import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Layers, Settings, Users, Zap, type LucideIcon } from 'lucide-react';
import { IosInstallHint } from '@/components/common/IosInstallHint';
import { UpdateBanner } from '@/components/common/UpdateBanner';

const TABS: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/', label: 'Équipe', icon: Users, end: true },
  { to: '/activite', label: 'Activité', icon: Zap },
  { to: '/calendrier', label: 'Calendrier', icon: CalendarDays },
  { to: '/seances', label: 'Séances', icon: Layers },
  { to: '/reglages', label: 'Réglages', icon: Settings },
];

/** Coque de l'app : contenu + barre d'onglets translucide (le contenu défile dessous). */
export default function AppLayout() {
  return (
    <>
      <main>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px' }}>
          <UpdateBanner />
          <IosInstallHint />
        </div>
        <Outlet />
      </main>
      <nav className="tab-bar" aria-label="Navigation principale">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <Icon size={24} strokeWidth={1.8} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
