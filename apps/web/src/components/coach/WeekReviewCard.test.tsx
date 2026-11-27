import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderPage } from '@/hooks/test-utils';
import type { TeamCalendar, TeamCalendarAthlete, TeamCalendarDay } from '@/types';
import { WeekReviewCard } from './WeekReviewCard';
import WeekReview from '@/pages/WeekReview';
import { calendarApi } from '@/services/calendarApi';

/** Le résumé se construit à partir de /team/calendar : on simule cette seule réponse. */
vi.mock('@/services/calendarApi', () => ({ calendarApi: { teamCalendar: vi.fn() } }));
vi.mock('@/hooks/useCoach', () => ({ useMe: () => ({ data: { name: 'Coach Test' } }) }));

const TODAY = '2026-11-30'; // lundi
const WEEK = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];

function athlete(id: string, name: string, opts: { missed?: number; done?: number; usual: number | null }): TeamCalendarAthlete {
  const days: TeamCalendarDay[] = WEEK.map((date, i) => ({
    date,
    availability: null,
    rest: null,
    // Pas de nom de séance (comme en démo) : le résumé ne s'en sert pas.
    workouts: i < (opts.missed ?? 0) ? [{ id: `${id}-${i}`, name: '', description: null, sport: 'Ride', load: 50, seconds: null, done: false }] : [],
    races: [],
    activities: i === 6 && opts.done ? [{ id: `${id}-a`, name: null, moving_time: 3600, load: opts.done }] : [],
  }));
  return { id, name, ftp: null, form: null, groupIds: [], error: null, days, load: { planned: 0, done: 0, usual: opts.usual } };
}

const CAL: TeamCalendar = {
  from: WEEK[0],
  to: WEEK[6],
  athletes: [athlete('hugo', 'Hugo', { done: 400, usual: 300 }), athlete('lea', 'Léa', { missed: 2, usual: 300 }), athlete('sarah', 'Sarah', { done: 280, usual: 300 })],
};

beforeEach(() => {
  vi.mocked(calendarApi.teamCalendar).mockReset();
  vi.mocked(calendarApi.teamCalendar).mockResolvedValue(CAL);
});

describe('WeekReviewCard (accueil du coach)', () => {
  it('lit la semaine écoulée et résume charge, séances manquées et athlètes au-dessus de l’habitude', async () => {
    renderPage(<WeekReviewCard today={TODAY} />);
    const link = await screen.findByRole('link', { name: /résumé de la semaine du 23 – 29 nov/i });
    expect(calendarApi.teamCalendar).toHaveBeenCalledWith('2026-11-23', '2026-11-29');
    expect(link).toHaveAttribute('href', '/semaine');
    expect(within(link).getByText('680')).toBeInTheDocument(); // 400 + 280 faits
    expect(within(link).getByText('séances manquées').previousSibling).toHaveTextContent('2');
    expect(within(link).getByText("au-dessus de l'habitude").previousSibling).toHaveTextContent('1');
    expect(link).toHaveTextContent('Hugo : +33 % de son habitude — Léa : 2 séances manquées');
  });

  it('dit quand il n’y a rien à signaler', async () => {
    vi.mocked(calendarApi.teamCalendar).mockResolvedValue({ ...CAL, athletes: [athlete('sarah', 'Sarah', { done: 280, usual: 300 })] });
    renderPage(<WeekReviewCard today={TODAY} />);
    expect(await screen.findByText(/rien à signaler/i)).toBeInTheDocument();
  });

  it('n’affiche pas « 0 prévue » quand aucune séance n’a de charge estimable (démo)', async () => {
    const unestimated = athlete('lea', 'Léa', { missed: 2, usual: 300 });
    unestimated.days = unestimated.days.map((d) => ({ ...d, workouts: d.workouts.map((x) => ({ ...x, load: null })) }));
    vi.mocked(calendarApi.teamCalendar).mockResolvedValue({ ...CAL, athletes: [unestimated] });
    renderPage(<WeekReviewCard today={TODAY} />);
    const link = await screen.findByRole('link', { name: /résumé de la semaine/i });
    expect(within(link).getByText('charge faite · prévue non estimée')).toBeInTheDocument();
    expect(link).not.toHaveTextContent('/ 0');
  });

  it('ne casse pas l’accueil si le planning est indisponible', async () => {
    vi.mocked(calendarApi.teamCalendar).mockRejectedValue(new Error('BFF indisponible'));
    renderPage(<WeekReviewCard today={TODAY} />);
    expect(await screen.findByText(/résumé indisponible : bff indisponible/i)).toBeInTheDocument();
  });
});

describe('Page « Résumé de la semaine »', () => {
  it('sépare les athlètes à suivre des autres et mène à leur calendrier', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T08:00:00`));
    try {
      renderPage(<WeekReview />, '/semaine');
      const toFollow = (await screen.findByText('À suivre · 2')).closest('section')!;
      expect(within(toFollow).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/calendrier?athlete=hugo', '/calendrier?athlete=lea']);
      expect(within(screen.getByText('Les autres').closest('section')!).getByRole('link')).toHaveTextContent('Sarah');

      fireEvent.click(screen.getByRole('button', { name: 'Semaine précédente' }));
      expect(calendarApi.teamCalendar).toHaveBeenLastCalledWith('2026-11-16', '2026-11-22');
    } finally {
      vi.useRealTimers();
    }
  });
});
