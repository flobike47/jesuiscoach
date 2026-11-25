import type { IntervalsFolder } from '../types.js';
import { sportOf, type Sport } from './sport.js';

/**
 * Bibliothèque Intervals.icu du coach, réduite aux séances envoyables :
 * une description (format texte des séances) et un sport géré (vélo, course,
 * natation). Lecture seule.
 */

export interface LibraryWorkout {
  id: string;
  name: string;
  description: string;
  sport: Sport;
}

export interface LibraryFolder {
  id: string;
  name: string;
  workouts: LibraryWorkout[];
}

const MAX_FOLDERS = 50;
const MAX_WORKOUTS = 100;
const MAX_DESCRIPTION = 4000;


export function libraryView(folders: IntervalsFolder[]): LibraryFolder[] {
  return (Array.isArray(folders) ? folders : [])
    .slice(0, MAX_FOLDERS)
    .map((f) => ({
      id: String(f.id),
      name: (f.name ?? '').trim().slice(0, 120) || 'Sans nom',
      workouts: (f.children ?? [])
        // Sans type : séance vélo (ancien comportement d'Intervals.icu).
        .filter((w) => (!w.type || sportOf(w.type)) && typeof w.description === 'string' && w.description.trim() !== '')
        .slice(0, MAX_WORKOUTS)
        .map((w) => ({
          id: String(w.id),
          name: (w.name ?? '').trim().slice(0, 120) || 'Séance',
          description: (w.description as string).slice(0, MAX_DESCRIPTION),
          sport: sportOf(w.type) ?? 'Ride',
        })),
    }))
    .filter((f) => f.workouts.length > 0);
}
