import { describe, expect, it } from 'vitest';
import { buildPhases, formatDuration, totalDuration } from '../modules/workout/plan';
import { DEFAULT_CONFIG } from '../types';

describe('Déroulé de séance', () => {
  it('calcule la durée totale par défaut : 33:40 (2020 s)', () => {
    expect(totalDuration(DEFAULT_CONFIG)).toBe(2020);
    expect(formatDuration(totalDuration(DEFAULT_CONFIG))).toBe('33:40');
  });

  it('construit les phases dans le bon ordre (préparation, travail/repos, repos long)', () => {
    const cfg = { work: 30, rest: 10, exercises: 3, rounds: 2, longRest: 120, prepare: 10 };
    const phases = buildPhases(cfg);
    expect(phases.map((p) => p.type)).toEqual([
      'prepare',
      'work', 'rest', 'work', 'rest', 'work',
      'longRest',
      'work', 'rest', 'work', 'rest', 'work',
    ]);
    expect(phases.map((p) => p.duration)).toEqual([
      10,
      30, 10, 30, 10, 30,
      120,
      30, 10, 30, 10, 30,
    ]);
  });

  it('ne met pas de repos après le dernier exercice du round', () => {
    const phases = buildPhases({ work: 30, rest: 10, exercises: 2, rounds: 1, longRest: 60, prepare: 5 });
    expect(phases[phases.length - 1].type).toBe('work');
  });

  it('ne met pas de repos long après le dernier round', () => {
    const phases = buildPhases({ work: 30, rest: 10, exercises: 2, rounds: 2, longRest: 60, prepare: 5 });
    expect(phases[phases.length - 1].type).toBe('work');
  });

  it('omet les phases de durée nulle', () => {
    const phases = buildPhases({ work: 30, rest: 0, exercises: 3, rounds: 2, longRest: 0, prepare: 0 });
    expect(phases.map((p) => p.type)).toEqual(['work', 'work', 'work', 'work', 'work', 'work']);
  });

  it('la somme des phases est égale à la durée totale', () => {
    const phases = buildPhases(DEFAULT_CONFIG);
    const sum = phases.reduce((a, p) => a + p.duration, 0);
    expect(sum).toBe(totalDuration(DEFAULT_CONFIG));
  });

  it('valide les contraintes métier', () => {
    expect(DEFAULT_CONFIG.work).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_CONFIG.rest).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CONFIG.exercises).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_CONFIG.rounds).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_CONFIG.prepare).toBeGreaterThanOrEqual(0);
  });
});
