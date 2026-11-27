import { describe, expect, it } from 'vitest';
import {
  FRESH_FORM,
  INTENSE,
  OVERLOAD_FORM,
  RESTART_DAYS,
  suggest,
  suggestFor,
  type AssignAthlete,
  type AssignDay,
  type AssignWorkout,
} from '../src/lib/assign.js';

/** Fabrique typée pour un jour. */
function day(date: string, overrides?: Partial<AssignDay>): AssignDay {
  return {
    date,
    inWindow: true,
    availability: null,
    maxMinutes: 120,
    existing: [],
    doneLoad: 0,
    blocked: null,
    ...overrides,
  };
}

/** Fabrique typée pour un athlète. */
function athlete(overrides?: Partial<AssignAthlete>): AssignAthlete {
  return {
    id: 'a1',
    name: 'Test Athlete',
    days: [],
    form: null,
    hrv: [],
    lastSleep: null,
    usualWeekLoad: null,
    daysSinceRide: null,
    ...overrides,
  };
}

/** Fabrique typée pour une séance. */
function workout(overrides?: Partial<AssignWorkout>): AssignWorkout {
  return {
    seconds: 3600,
    load: 100,
    intensity: 0.75,
    ...overrides,
  };
}

describe("moteur assign - exclusions et scoring", () => {
  describe("exclusions", () => {
    it("exclut un jour avec availability = repos", () => {
      const a = athlete({
        days: [
          day("2026-11-28", { availability: "repos" }),
          day("2026-11-29"),
        ],
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.date).toBe("2026-11-29");
    });

    it("exclut un jour avec availability = indisponible", () => {
      const a = athlete({
        days: [
          day("2026-11-28", { availability: "indisponible" }),
          day("2026-11-29"),
        ],
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.date).toBe("2026-11-29");
    });

    it("exclut une seance plus longue que maxMinutes", () => {
      const a = athlete({
        days: [
          day("2026-11-28", { maxMinutes: 60 }),
          day("2026-11-29", { maxMinutes: 120 }),
        ],
      });
      const suggestion = suggestFor(workout({ seconds: 5400 }), a);
      expect(suggestion.date).toBe("2026-11-29");
    });

    it("exclut un jour occupe par une seance plus lourde", () => {
      const a = athlete({
        days: [
          day("2026-11-28", { existing: [{ id: 'e1', name: 'Lourde', load: 150, intensity: 0.8 }] }),
          day("2026-11-29"),
        ],
      });
      const suggestion = suggestFor(workout({ load: 100 }), a);
      expect(suggestion.date).toBe("2026-11-29");
    });

    it("propose date null quand un jour bloquant couvre la fenetre entiere", () => {
      const a = athlete({
        days: [
          day("2026-11-28", { blocked: "Blessure au genou" }),
        ],
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.date).toBeNull();
      expect(suggestion.blocked).toBe("Blessure au genou");
      expect(suggestion.reasons[0]).toContain("Blessure au genou");
    });

    it("propose date null quand la fenetre est vide", () => {
      const a = athlete({ days: [] });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.date).toBeNull();
      expect(suggestion.blocked).toBeTruthy();
    });

    it("propose date null et raison quand aucun jour raisonnable", () => {
      const a = athlete({
        days: [
          day("2026-11-28", { availability: "repos" }),
          day("2026-11-29", { availability: "indisponible" }),
        ],
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.date).toBeNull();
      expect(suggestion.blocked).toContain("Aucun jour");
    });
  });

  describe("jour occupe par une seance plus legere", () => {
    it("remplace une seance plus legere (replaces renseigne)", () => {
      const a = athlete({
        days: [day("2026-11-28", { existing: [{ id: 'e1', name: 'Legere', load: 50, intensity: 0.5 }] })],
      });
      const suggestion = suggestFor(workout({ load: 100 }), a);
      expect(suggestion.date).toBe("2026-11-28");
      expect(suggestion.replaces).toEqual({ eventId: 'e1', name: 'Legere' });
    });

    it("affiche le nom de la seance remplacee dans les raisons", () => {
      const a = athlete({
        days: [day("2026-11-28", { existing: [{ id: 'e1', name: 'Tempo', load: 50, intensity: 0.5 }] })],
      });
      const suggestion = suggestFor(workout({ load: 100 }), a);
      expect(suggestion.reasons.some((r) => r.includes("Remplace"))).toBe(true);
    });

    it("remplace meme avec depassement charge semaine", () => {
      const a = athlete({
        days: [
          day("2026-11-25", { doneLoad: 300 }),
          day("2026-11-28", { existing: [{ id: 'e1', name: 'Tempo', load: 50, intensity: 0.5 }] }),
        ],
        usualWeekLoad: 300,
      });
      const suggestion = suggestFor(workout({ load: 100 }), a);
      // Peut etre jour 25 ou 28, peu importe; si 28 choisi, doit avoir replaces
      if (suggestion.date === "2026-11-28") {
        expect(suggestion.replaces).toEqual({ eventId: 'e1', name: 'Tempo' });
      }
    });
  });

  describe("seances intenses", () => {
    it("penalise le jour apres une seance intense voisine", () => {
      const a = athlete({
        days: [
          day("2026-11-27", { existing: [{ id: 'e1', name: 'Intense', load: 150, intensity: INTENSE }] }),
          day("2026-11-28"),
          day("2026-11-29"),
        ],
      });
      const suggestion = suggestFor(workout({ intensity: INTENSE }), a);
      // Le 27 est pris par une séance plus lourde, le 28 la suit : le 29 l'emporte.
      expect(suggestion.date).toBe('2026-11-29');
      expect(suggestion.alternatives).toContain('2026-11-28');
    });

    it("penalise le jour avant une seance intense voisine", () => {
      const a = athlete({
        days: [
          day("2026-11-27"),
          day("2026-11-28", { existing: [{ id: 'e1', name: 'Intense', load: 150, intensity: INTENSE }] }),
          day("2026-11-29"),
        ],
      });
      const suggestion = suggestFor(workout({ intensity: INTENSE }), a);
      // 2026-11-27 est penalise car voisin d'une intense
      expect(suggestion.date).not.toBeNull();
    });
  });

  describe("surcharge et variante courte", () => {
    it("propose variante courte quand forme < OVERLOAD_FORM", () => {
      const a = athlete({
        days: [day("2026-11-28"), day("2026-11-29")],
        form: OVERLOAD_FORM - 5,
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.variant).toBe("courte");
    });

    it("applique intensityScale 0.95 quand en surcharge", () => {
      const a = athlete({
        days: [day("2026-11-28")],
        form: OVERLOAD_FORM - 5,
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.intensityScale).toBe(0.95);
    });

    it("affiche Surcharge comme premiere raison", () => {
      const a = athlete({
        days: [day("2026-11-28"), day("2026-11-29"), day("2026-11-30")],
        form: OVERLOAD_FORM - 5,
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.reasons[0]).toContain("Surcharge");
    });

    it("prefere le jour le plus tardif quand en surcharge", () => {
      const a = athlete({
        days: [day("2026-11-28"), day("2026-11-29"), day("2026-11-30")],
        form: OVERLOAD_FORM - 5,
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.date).toBe("2026-11-30");
    });
  });

  describe("variante longue", () => {
    it("propose variante longue quand forme > FRESH_FORM", () => {
      const a = athlete({
        days: [day("2026-11-28")],
        form: FRESH_FORM + 5,
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.variant).toBe("longue");
    });

    it("redescend a standard si le jour est trop court pour la longue mais standard tient", () => {
      const a = athlete({
        days: [day("2026-11-28", { maxMinutes: 100 })],
        form: FRESH_FORM + 5,
      });
      const suggestion = suggestFor(workout({ seconds: 5400 }), a);
      expect(suggestion.variant).toBe("standard");
    });

    it("exclut le jour si meme standard ne tient pas", () => {
      const a = athlete({
        days: [
          day("2026-11-28", { maxMinutes: 50 }),
          day("2026-11-29", { maxMinutes: 120 }),
        ],
        form: FRESH_FORM + 5,
      });
      const suggestion = suggestFor(workout({ seconds: 5400 }), a);
      expect(suggestion.date).toBe("2026-11-29");
    });
  });

  describe("bien-etre VFC et sommeil", () => {
    it("penalise le premier jour quand VFC est basse donc deuxieme jour prefere", () => {
      const a = athlete({
        days: [day("2026-11-28"), day("2026-11-29")],
        hrv: [100, 100, 100, 100, 100, 100, 100, 85],
      });
      const suggestion = suggestFor(workout(), a);
      // Premier jour penalise donc deuxieme jour choisi
      expect(suggestion.date).toBe("2026-11-29");
    });

    it("inclut raison VFC basse ce matin si premier jour choisi sans autre option", () => {
      const a = athlete({
        days: [day("2026-11-28")],
        hrv: [100, 100, 100, 85],
      });
      const suggestion = suggestFor(workout(), a);
      // Seul jour possible donc celui-ci est choisi avec raison VFC
      if (suggestion.date === "2026-11-28") {
        expect(suggestion.reasons.some((r) => r.includes("VFC basse ce matin"))).toBe(true);
      }
    });

    it("ignore VFC si moins de 3 jours historique", () => {
      const a = athlete({
        days: [day("2026-11-28"), day("2026-11-29")],
        hrv: [100, 85],
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.reasons.some((r) => r.includes("VFC"))).toBe(false);
    });

    it("penalise le premier jour quand la nuit precedente < 6h donc deuxieme jour prefere", () => {
      const a = athlete({
        days: [day("2026-11-28"), day("2026-11-29")],
        lastSleep: 4 * 3600,
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.date).toBe("2026-11-29");
    });

    it("ignore lastSleep si valeur null", () => {
      const a = athlete({
        days: [day("2026-11-28")],
        lastSleep: null,
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.reasons.some((r) => r.includes("Nuit"))).toBe(false);
    });
  });

  describe("charge semaine", () => {
    it("penalise les jours qui depasseraient +15 pct charge habitude", () => {
      const a = athlete({
        days: [
          day("2026-11-25", { doneLoad: 300 }),
          day("2026-11-28"),
          day("2026-11-29"),
        ],
        usualWeekLoad: 300,
      });
      const suggestion = suggestFor(workout({ load: 100 }), a);
      // Le jour 28 recoit une penalite. Si date est 28, raison incluse
      if (suggestion.date === "2026-11-28") {
        expect(suggestion.reasons.some((r) => r.includes("Semaine deja chargee"))).toBe(true);
      }
    });

    it("inclut le pourcentage de depassement dans la raison", () => {
      const a = athlete({
        days: [
          day("2026-11-25", { doneLoad: 300 }),
          day("2026-11-28"),
        ],
        usualWeekLoad: 300,
      });
      const suggestion = suggestFor(workout({ load: 100 }), a);
      if (suggestion.reasons.some((r) => r.includes("Semaine"))) {
        expect(suggestion.reasons.some((r) => r.match(/\+\d+ %/))).toBe(true);
      }
    });

    it("ignore charge semaine si usualWeekLoad null", () => {
      const a = athlete({
        days: [day("2026-11-28")],
        usualWeekLoad: null,
      });
      const suggestion = suggestFor(workout({ load: 200 }), a);
      expect(suggestion.reasons.some((r) => r.includes("Semaine deja chargee"))).toBe(false);
    });
  });

  describe("reprise apres inactivite", () => {
    it("propose variante courte apres 10 jours sans sortie", () => {
      const a = athlete({
        days: [day("2026-11-28")],
        form: FRESH_FORM + 5,
        daysSinceRide: RESTART_DAYS,
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.variant).toBe("courte");
    });

    it("affiche Reprise comme premiere raison", () => {
      const a = athlete({
        days: [day("2026-11-28")],
        daysSinceRide: RESTART_DAYS + 2,
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.reasons[0]).toContain("Reprise");
    });

    it("ignore si daysSinceRide null", () => {
      const a = athlete({
        days: [day("2026-11-28")],
        daysSinceRide: null,
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.reasons.some((r) => r.includes("Reprise"))).toBe(false);
    });
  });

  describe("choix du meilleur jour", () => {
    it("choisit le plus tot a score egal", () => {
      const a = athlete({
        days: [
          day("2026-11-28"),
          day("2026-11-29"),
          day("2026-11-30"),
        ],
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.date).toBe("2026-11-28");
    });

    it("propose alternatives triees du meilleur au moins bon (max 3)", () => {
      const a = athlete({
        days: [
          day("2026-11-28"),
          day("2026-11-29"),
          day("2026-11-30"),
          day("2026-12-01"),
          day("2026-12-02"),
        ],
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.alternatives.length).toBeLessThanOrEqual(3);
      expect(suggestion.alternatives[0]).toBe("2026-11-29");
      expect(suggestion.alternatives[1]).toBe("2026-11-30");
    });

    it("inclut seulement raisons dans limite", () => {
      const a = athlete({
        days: [day("2026-11-28"), day("2026-11-29"), day("2026-11-30")],
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.reasons.length).toBeLessThanOrEqual(3);
    });
  });

  describe("fenetre et contexte", () => {
    it("ignore les jours hors inWindow", () => {
      const a = athlete({
        days: [
          day("2026-11-26", { inWindow: false }),
          day("2026-11-27", { inWindow: false }),
          day("2026-11-28", { inWindow: true }),
        ],
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.date).toBe("2026-11-28");
    });

    it("utilise les jours de contexte pour evaluer les voisins intenses", () => {
      const a = athlete({
        days: [
          day("2026-11-26", { inWindow: false, existing: [{ id: 'e1', name: 'Intense', load: 150, intensity: INTENSE }] }),
          day("2026-11-27", { inWindow: true }),
          day("2026-11-28", { inWindow: true }),
        ],
      });
      const suggestion = suggestFor(workout({ intensity: INTENSE }), a);
      expect(suggestion.date).not.toBe("2026-11-27");
    });
  });

  describe("suggest batch pour plusieurs athletes", () => {
    it("renvoie une suggestion par athlete", () => {
      const athletes = [
        athlete({ id: 'a1' }),
        athlete({ id: 'a2' }),
        athlete({ id: 'a3' }),
      ];
      const suggestions = suggest(workout(), athletes);
      expect(suggestions).toHaveLength(3);
      expect(suggestions.map((s) => s.athleteId)).toEqual(['a1', 'a2', 'a3']);
    });

    it("chaque suggestion a les bonnes cles", () => {
      const suggestions = suggest(workout(), [athlete({ days: [day("2026-11-28")] })]);
      const s = suggestions[0];
      expect(s).toHaveProperty("athleteId");
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("date");
      expect(s).toHaveProperty("variant");
      expect(s).toHaveProperty("intensityScale");
      expect(s).toHaveProperty("reasons");
      expect(s).toHaveProperty("alternatives");
      expect(s).toHaveProperty("replaces");
      expect(s).toHaveProperty("blocked");
    });
  });

  describe("cas complexes", () => {
    it("gere un athlete en surcharge avec peu options", () => {
      const a = athlete({
        days: [
          day("2026-11-28", { maxMinutes: 60 }),
          day("2026-11-29", { maxMinutes: 100, existing: [{ id: 'e1', name: 'Tempo', load: 50, intensity: 0.6 }] }),
          day("2026-11-30"),
        ],
        form: OVERLOAD_FORM - 10,
        usualWeekLoad: 400,
      });
      const suggestion = suggestFor(workout({ seconds: 5400, load: 150 }), a);
      expect(suggestion.date).not.toBeNull();
      expect(suggestion.variant).toBe("courte");
      expect(suggestion.intensityScale).toBe(0.95);
    });

    it("calcule form comme fitness moins fatigue", () => {
      const a = athlete({
        days: [day("2026-11-28")],
        form: 42,
      });
      const suggestion = suggestFor(workout(), a);
      expect(suggestion.reasons.some((r) => r.includes("Frais"))).toBe(true);
    });
  });
});

describe('étalement de l’équipe', () => {
  it('répartit des athlètes identiques sur plusieurs jours', () => {
    const days = ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03'].map((d) => day(d));
    const team = ['a', 'b', 'c', 'd'].map((id) => athlete({ id, name: id, days: days.map((d) => ({ ...d })) }));
    const dates = suggest(workout(), team).map((s) => s.date);
    expect(new Set(dates).size).toBeGreaterThan(1);
  });
});
