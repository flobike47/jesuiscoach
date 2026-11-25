import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Layers, LineChart, Settings, Sun, Users, Zap, type LucideIcon } from 'lucide-react';
import { useMe } from '@/hooks/useCoach';
import { IosInstallHint } from '@/components/common/IosInstallHint';
import { UpdateBanner } from '@/components/common/UpdateBanner';

type Tab = { to: string; label: string; icon: LucideIcon; end?: boolean };

const COACH_TABS: Tab[] = [
  { to: '/', label: 'Équipe', icon: Users, end: true },
  { to: '/activite', label: 'Activité', icon: Zap },
  { to: '/calendrier', label: 'Calendrier', icon: CalendarDays },
  { to: '/seances', label: 'Séances', icon: Layers },
  { to: '/reglages', label: 'Réglages', icon: Settings },
];

const ATHLETE_TABS: Tab[] = [
  { to: '/', label: "Aujourd'hui", icon: Sun, end: true },
  { to: '/plan', label: 'Plan', icon: CalendarDays },
  { to: '/progres', label: 'Progrès', icon: LineChart },
  { to: '/reglages', label: 'Réglages', icon: Settings },
];

/** Coque de l'app : contenu + barre d'onglets translucide (le contenu défile dessous). */
export default function AppLayout() {
  const me = useMe();
  const tabs = me.data?.role === 'athlete' ? ATHLETE_TABS : me.data ? COACH_TABS : [];
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
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <Icon size={24} strokeWidth={1.8} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
