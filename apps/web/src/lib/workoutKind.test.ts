import { describe, it, expect } from 'vitest';
import { workoutKind } from './workoutKind';

describe('workoutKind', () => {
  it('retourne "récup" pour une séance en dessous de 60 %', () => {
    expect(workoutKind('- 10m 55%')).toBe('récup');
    expect(workoutKind('- 20m 50%')).toBe('récup');
  });

  it('retourne "endurance" pour une séance entre 61-75 %', () => {
    expect(workoutKind('- 60m 70%')).toBe('endurance');
    expect(workoutKind('- 90m 65%')).toBe('endurance');
  });

  it('retourne "tempo" pour une séance entre 76-87 %', () => {
    expect(workoutKind('- 30m 82%')).toBe('tempo');
    expect(workoutKind('- 20m 85%')).toBe('tempo');
  });

  it('retourne "sweet spot" pour une séance entre 88-93 %', () => {
    expect(workoutKind('3x\n- 10m 90%')).toBe('sweet spot');
    expect(workoutKind('- 20m 91%')).toBe('sweet spot');
  });

  it('retourne "seuil" pour une séance entre 94-109 %', () => {
    expect(workoutKind('2x\n- 20m 95%')).toBe('seuil');
    expect(workoutKind('- 10m 100%')).toBe('seuil');
  });

  it('retourne "vo2" pour une séance entre 110-125 %', () => {
    expect(workoutKind('5x\n- 4m 115%')).toBe('vo2');
    expect(workoutKind('- 3m 115%')).toBe('vo2');
  });

  it('retourne "sprint" pour une séance au-delà de 125 %', () => {
    expect(workoutKind('8x\n- 15s 150%')).toBe('sprint');
    expect(workoutKind('- 20s 150%')).toBe('sprint');
  });

  it('utilise l\'intensité maximale du bloc principal', () => {
    // Échauffement faible, bloc principal intense
    expect(workoutKind('Échauffement\n- 15m 50%\n\nBloc principal\n3x\n- 20m 95%')).toBe('seuil');

    // Blocs multiples, prend le plus intense
    expect(workoutKind('- 30m 70%\n\n2x\n- 10m 90%\n\n- 10m 50%')).toBe('sweet spot');
  });

  it('retourne "endurance" pour une séance vide', () => {
    expect(workoutKind('')).toBe('endurance');
    expect(workoutKind('\n\n')).toBe('endurance');
  });

  it('retourne "endurance" par défaut si aucun palier lisible', () => {
    expect(workoutKind('ceci n\'est pas une séance')).toBe('endurance');
  });
});
