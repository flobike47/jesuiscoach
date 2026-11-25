import type { IntervalsFolder } from '../types.js';

/**
 * Bibliothèque Intervals.icu du coach, réduite aux séances vélo envoyables :
 * une description (format texte des séances) et un type vélo. Lecture seule.
 */

export interface LibraryWorkout {
  id: string;
  name: string;
  description: string;
}

export interface LibraryFolder {
  id: string;
  name: string;
  workouts: LibraryWorkout[];
}

const MAX_FOLDERS = 50;
const MAX_WORKOUTS = 100;
const MAX_DESCRIPTION = 4000;

const isRideType = (type: string | null | undefined) => !type || type.includes('Ride');

export function libraryView(folders: IntervalsFolder[]): LibraryFolder[] {
  return (Array.isArray(folders) ? folders : [])
    .slice(0, MAX_FOLDERS)
    .map((f) => ({
      id: String(f.id),
      name: (f.name ?? '').trim().slice(0, 120) || 'Sans nom',
      workouts: (f.children ?? [])
        .filter((w) => isRideType(w.type) && typeof w.description === 'string' && w.description.trim() !== '')
        .slice(0, MAX_WORKOUTS)
        .map((w) => ({
          id: String(w.id),
          name: (w.name ?? '').trim().slice(0, 120) || 'Séance',
          description: (w.description as string).slice(0, MAX_DESCRIPTION),
        })),
    }))
    .filter((f) => f.workouts.length > 0);
}
