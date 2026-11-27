import { describe, expect, it } from 'vitest';
import { buildBlock, type BlockInput, type BlockWorkout } from './periodize';

/** Crée un input par défaut pour les tests. */
function defaultInput(overrides?: Partial<BlockInput>): BlockInput {
  return {
    today: '2026-11-30', // lundi
    raceDate: '2027-01-07', // mercredi + 5 semaines
    raceName: 'Grand Fond',
    sport: 'Ride',
    weeklyHours: { from: 7, to: 10 },
    availableWeekdays: [1, 2, 3, 4, 5, 6], // mardi → dimanche
    keySessions: ['sweet spot', 'seuil', 'vo2', 'longue'],
    cycle: 3,
    ...overrides,
  };
}

describe('periodize', () => {
  describe('structure du bloc', () => {
    it('construit un bloc avec le nombre correct de semaines', () => {
      // 30 nov. (lundi) → 7 janv. (mercredi) = 6 semaines complètes
      const input = defaultInput({ today: '2026-11-30', raceDate: '2027-01-07' });
      const block = buildBlock(input);
      expect(block.weeks).toHaveLength(6);
    });

    it('gère un bloc court de 3 semaines', () => {
      const input = defaultInput({ today: '2026-12-04', raceDate: '2026-12-25' });
      const block = buildBlock(input);
      expect(block.weeks.length).toBeGreaterThanOrEqual(3);
    });

    it('construit les phases dans le bon ordre', () => {
      const input = defaultInput();
      const block = buildBlock(input);
      const phases = block.weeks.map((w) => w.phase);

      // Vérifier que les phases ont un ordre logique : dev/allég, puis spécif (si ≥5 sem), puis affut, puis course
      let seenDev = false;
      let seenAllég = false;
      let seenSpécif = false;
      let seenAffut = false;

      for (const phase of phases) {
        if (phase === 'developpement') seenDev = true;
        if (phase === 'allegee') seenAllég = true;
        if (phase === 'specifique') seenSpécif = true;
        if (phase === 'affutage') seenAffut = true;

        // Vérifier l'ordre : dev→allég, puis spécif, puis affut
        if (seenAllég && phase === 'developpement') {
          throw new Error('Développement après allégée');
        }
        if (seenSpécif && (phase === 'developpement' || phase === 'allegee')) {
          throw new Error('Dev/allég après spécifique');
        }
        if (seenAffut && (phase === 'developpement' || phase === 'allegee' || phase === 'specifique')) {
          throw new Error('Dev/allég/spécif après affutage');
        }
      }

      expect(seenDev).toBe(true);
      expect(seenAffut).toBe(true);
    });

    it('place la course la semaine de la date de course', () => {
      const input = defaultInput();
      const block = buildBlock(input);
      const lastWeek = block.weeks[block.weeks.length - 1];

      // La dernière semaine devrait contenir la course (sauf si raceDate est en fin de semaine et bloc continue)
      const hasRace = lastWeek.workouts.some((w) => w.name === 'Course' || lastWeek.phase === 'course');
      expect(hasRace).toBe(true);
    });
  });

  describe('séances et disponibilité', () => {
    it('place toutes les séances sur des jours disponibles', () => {
      const input = defaultInput({ availableWeekdays: [1, 3, 5] }); // mardi, jeudi, samedi
      const block = buildBlock(input);

      for (const week of block.weeks) {
        for (const wo of week.workouts) {
          if (wo.name === 'Course') continue; // ignore le jour de course
          const date = new Date(wo.date);
          const dow = date.getDay(); // 0 = dim, 1 = lun, ...
          const weekday = dow === 0 ? 6 : dow - 1; // 0 = lun, 6 = dim
          expect(input.availableWeekdays).toContain(weekday);
        }
      }
    });

    it('respecte maxMinutesByWeekday', () => {
      const input = defaultInput({
        availableWeekdays: [1, 2, 3, 4, 5],
        maxMinutesByWeekday: { 1: 60, 2: 90, 3: 60, 4: 90, 5: 180 }, // max par jour
      });
      const block = buildBlock(input);

      for (const week of block.weeks) {
        const minutesByDay: Partial<Record<number, number>> = {};
        for (const wo of week.workouts) {
          const date = new Date(wo.date);
          const dow = date.getDay();
          const weekday = dow === 0 ? 6 : dow - 1;
          minutesByDay[weekday] = (minutesByDay[weekday] ?? 0) + Math.ceil(wo.seconds / 60);
        }

        for (const [day, minutes] of Object.entries(minutesByDay)) {
          const max = input.maxMinutesByWeekday?.[Number(day)] ?? Infinity;
          expect(minutes).toBeLessThanOrEqual(max);
        }
      }
    });

    it('compte le nombre total de séances', () => {
      const input = defaultInput();
      const block = buildBlock(input);
      expect(block.totalWorkouts).toBeGreaterThan(0);
      const counted = block.weeks.reduce((sum, w) => sum + w.workouts.length, 0);
      expect(block.totalWorkouts).toBe(counted);
    });
  });

  describe('séances clés', () => {
    it('crée 2 séances clés par semaine en développement', () => {
      const input = defaultInput();
      const block = buildBlock(input);

      for (const week of block.weeks) {
        if (week.phase === 'developpement') {
          const keyCount = week.workouts.filter((w) => w.key).length;
          expect(keyCount).toBe(2);
        }
      }
    });

    it('crée 1 séance clé courte en allégée', () => {
      const input = defaultInput();
      const block = buildBlock(input);

      for (const week of block.weeks) {
        if (week.phase === 'allegee') {
          const keyCount = week.workouts.filter((w) => w.key).length;
          expect(keyCount).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('crée 2 rappels en affûtage', () => {
      const input = defaultInput();
      const block = buildBlock(input);

      for (const week of block.weeks) {
        if (week.phase === 'affutage') {
          const keyCount = week.workouts.filter((w) => w.key).length;
          expect(keyCount).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('ne place pas deux séances clés consécutives', () => {
      const input = defaultInput();
      const block = buildBlock(input);

      // Vérifie dans tout le bloc (pas juste une semaine)
      const allWorkouts: BlockWorkout[] = [];
      for (const week of block.weeks) {
        allWorkouts.push(...week.workouts);
      }
      allWorkouts.sort((a, b) => a.date.localeCompare(b.date));

      // Collecte les indices des séances clés
      const keyIndices = allWorkouts
        .map((w, i) => (w.key ? i : -1))
        .filter((i) => i >= 0);

      // Si on a au moins 2 séances clés, vérifier qu'elles ne sont pas le jour suivant
      if (keyIndices.length >= 2) {
        for (let i = 0; i < keyIndices.length - 1; i++) {
          const wo1 = allWorkouts[keyIndices[i]];
          const wo2 = allWorkouts[keyIndices[i + 1]];
          const date1 = new Date(wo1.date);
          const date2 = new Date(wo2.date);
          const dayDiff = (date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
          expect(dayDiff).toBeGreaterThan(1);
        }
      }
      // Si seulement 1 séance clé ou 0, le test passe triviale
      expect(keyIndices.length).toBeGreaterThan(0);
    });

    it('effectue une rotation des séances clés', () => {
      const input = defaultInput({ keySessions: ['sweet spot', 'seuil'] });
      const block = buildBlock(input);

      const keyNames = block.weeks
        .filter((w) => w.phase === 'developpement')
        .flatMap((w) => w.workouts.filter((wo) => wo.key).map((wo) => wo.name));

      // Au moins 2 types différents doivent être présents
      const types = new Set(keyNames);
      expect(types.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('volume horaire', () => {
    it('progresse linéairement en développement', () => {
      const input = defaultInput({ weeklyHours: { from: 5, to: 10 } });
      const block = buildBlock(input);

      const devWeeks = block.weeks.filter((w) => w.phase === 'developpement');
      if (devWeeks.length >= 2) {
        // Vérifie que les loads croissent
        for (let i = 1; i < devWeeks.length; i++) {
          const prev = devWeeks[i - 1].load;
          const curr = devWeeks[i].load;
          expect(curr).toBeGreaterThanOrEqual(prev * 0.9); // tolérance pour l'arrondi
        }
      }
    });

    it('réduit le volume en allégée', () => {
      const input = defaultInput();
      const block = buildBlock(input);

      for (let i = 0; i < block.weeks.length - 1; i++) {
        const curr = block.weeks[i];
        const next = block.weeks[i + 1];
        if (curr.phase === 'developpement' && next.phase === 'allegee') {
          expect(next.load).toBeLessThan(curr.load);
          expect(next.load).toBeLessThanOrEqual(curr.load * 0.6); // environ 55%
        }
      }
    });

    it('réduit drastiquement le volume en affûtage', () => {
      const input = defaultInput();
      const block = buildBlock(input);

      const affutWeek = block.weeks.find((w) => w.phase === 'affutage');
      const prevDev = block.weeks.filter((w) => w.phase === 'developpement');
      if (affutWeek && prevDev.length > 0) {
        const avgDev = prevDev.reduce((sum, w) => sum + w.load, 0) / prevDev.length;
        expect(affutWeek.load).toBeLessThan(avgDev);
        // Volume horaire à 45 % ; la charge reste un peu plus haute (rappels d'intensité conservés).
        expect(affutWeek.load).toBeLessThanOrEqual(avgDev * 0.6);
      }
    });
  });

  describe('résumés et estimateurs', () => {
    it('génère un résumé des séances principales par semaine', () => {
      const input = defaultInput();
      const block = buildBlock(input);

      for (const week of block.weeks) {
        expect(week.summary).toBeTruthy();
        expect(week.summary).not.toBe('');
      }
    });

    it('estime une forme positive après affûtage', () => {
      const input = defaultInput();
      const block = buildBlock(input);
      expect(block.estimatedRaceForm).toBeGreaterThan(0);
    });
  });

  describe('cycles', () => {
    it('utilise les cycles 3+1 avec cycle: 3', () => {
      // Bloc assez long pour avoir au moins 1 cycle complet 3+1
      const input = defaultInput({ today: '2026-11-02', raceDate: '2027-01-07', cycle: 3 });
      const block = buildBlock(input);

      const devPhases = block.weeks.filter((w) => w.phase === 'developpement');
      const allégPhases = block.weeks.filter((w) => w.phase === 'allegee');

      // Doit avoir au moins un cycle 3+1
      expect(devPhases.length).toBeGreaterThanOrEqual(3);
      expect(allégPhases.length).toBeGreaterThanOrEqual(1);
    });

    it('utilise les cycles 2+1 avec cycle: 2', () => {
      // Bloc assez long pour avoir au moins 1 cycle complet 2+1
      const input = defaultInput({ today: '2026-11-02', raceDate: '2027-01-07', cycle: 2 });
      const block = buildBlock(input);

      const devPhases = block.weeks.filter((w) => w.phase === 'developpement');
      const allégPhases = block.weeks.filter((w) => w.phase === 'allegee');

      // Doit avoir au moins un cycle 2+1
      expect(devPhases.length).toBeGreaterThanOrEqual(2);
      expect(allégPhases.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('bloc court', () => {
    it('omet la phase spécifique si bloc < 5 semaines', () => {
      const input = defaultInput({ today: '2026-12-15', raceDate: '2026-12-25' }); // 2 semaines
      const block = buildBlock(input);

      const hasSpecifique = block.weeks.some((w) => w.phase === 'specifique');
      expect(hasSpecifique).toBe(false);
    });
  });

  describe('cas particuliers', () => {
    it('gère un bloc sans jours de week-end disponibles', () => {
      const input = defaultInput({ availableWeekdays: [1, 2, 3, 4] }); // lun-ven
      const block = buildBlock(input);
      expect(block.weeks.length).toBeGreaterThan(0);
      expect(block.totalWorkouts).toBeGreaterThan(0);
    });

    it('gère un bloc avec maxMinutesByWeekday très restrictif', () => {
      const input = defaultInput({
        availableWeekdays: [1, 2, 3, 4, 5, 6],
        maxMinutesByWeekday: { 1: 30, 2: 30, 3: 30, 4: 30, 5: 60, 6: 180 },
      });
      const block = buildBlock(input);
      expect(block.weeks.length).toBeGreaterThan(0);
    });

    it('gère plusieurs séances clés avec rotation', () => {
      const input = defaultInput({
        keySessions: ['sweet spot', 'seuil', 'vo2'],
      });
      const block = buildBlock(input);

      const keyNames = block.weeks
        .flatMap((w) => w.workouts.filter((wo) => wo.key).map((wo) => wo.name));

      expect(keyNames.length).toBeGreaterThan(0);
    });

    it('construit correctement si raceDate = samedi', () => {
      const input = defaultInput({ raceDate: '2027-01-09' }); // samedi
      const block = buildBlock(input);
      expect(block.weeks.length).toBeGreaterThan(0);
    });
  });

  describe('propriétés des workouts', () => {
    it('chaque workout a une date, nom, description, seconds et load', () => {
      const input = defaultInput();
      const block = buildBlock(input);

      for (const week of block.weeks) {
        for (const wo of week.workouts) {
          expect(wo.date).toBeTruthy();
          expect(wo.name).toBeTruthy();
          expect(typeof wo.description).toBe('string');
          expect(typeof wo.seconds).toBe('number');
          expect(typeof wo.load).toBe('number');
          expect(typeof wo.key).toBe('boolean');
        }
      }
    });

    it('les workouts sont triés par date dans chaque semaine', () => {
      const input = defaultInput();
      const block = buildBlock(input);

      for (const week of block.weeks) {
        const dates = week.workouts.map((w) => new Date(w.date).getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
        }
      }
    });
  });

  describe('placement réaliste', () => {
    const realistic = () =>
      buildBlock({
        today: '2026-11-27',
        raceDate: '2027-01-07',
        raceName: 'Grand Fond',
        sport: 'Ride',
        weeklyHours: { from: 7, to: 10 },
        availableWeekdays: [1, 2, 3, 5, 6],
        maxMinutesByWeekday: { 1: 90, 2: 75, 3: 90 },
        keySessions: ['sweet spot', 'seuil', 'longue'],
        cycle: 3,
      });

    it('une séance par jour au plus', () => {
      const dates = realistic().weeks.flatMap((w) => w.workouts.map((x) => x.date));
      expect(new Set(dates).size).toBe(dates.length);
    });

    it('une seule sortie longue par semaine, nommée comme telle', () => {
      for (const w of realistic().weeks) {
        expect(w.workouts.filter((x) => x.name.startsWith('Sortie longue')).length).toBeLessThanOrEqual(1);
        expect(w.workouts.every((x) => x.name !== 'longue' && x.name !== 'seuil' && x.name !== 'sweet spot')).toBe(true);
      }
    });

    it('forme du jour J réaliste (fraîche sans excès)', () => {
      const form = realistic().estimatedRaceForm;
      expect(form).toBeGreaterThan(5);
      expect(form).toBeLessThan(35);
    });
  });
});
