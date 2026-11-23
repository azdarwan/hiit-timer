import { describe, expect, it } from 'vitest';
import { allRepsEntries, missingRepsEntries } from '../modules/workout/reps';
import type { RepRecord } from '../modules/storage/history';
import type { WorkoutConfig } from '../types';

/** Config de test : un exercice compté (A), un non compté (B). */
const config = (rounds: number, aCounted = true): WorkoutConfig => ({
  work: 30,
  rest: 10,
  exercises: 2,
  rounds,
  longRest: 20,
  prepare: 2,
  exerciseDefs: [
    { name: 'Exo A', countReps: aCounted },
    { name: 'Exo B', countReps: false },
  ],
});

describe('entrées de reps (fiches + écran avant récap, 23/11)', () => {
  it('liste toutes les entrées, round par round, dans l ordre du cycle', () => {
    expect(allRepsEntries(config(3))).toEqual([
      { name: 'Exo A', round: 1 },
      { name: 'Exo A', round: 2 },
      { name: 'Exo A', round: 3 },
    ]);
  });

  it('ne retourne rien quand aucun exercice ne compte les reps', () => {
    expect(allRepsEntries(config(3, false))).toEqual([]);
    expect(missingRepsEntries(config(3, false), [])).toEqual([]);
  });

  it('signale le dernier round non saisi (pas de pause longue derrière lui)', () => {
    const done: RepRecord[] = [
      { exercise: 'Exo A', round: 1, reps: 12 },
      { exercise: 'Exo A', round: 2, reps: 10 },
    ];
    expect(missingRepsEntries(config(3), done)).toEqual([{ name: 'Exo A', round: 3 }]);
  });

  it('ne retourne rien quand tout est déjà saisi, et normalise les noms', () => {
    const done: RepRecord[] = [
      { exercise: 'exo a', round: 1, reps: 12 },
      { exercise: 'Exo A', round: 2, reps: 10 },
      { exercise: 'EXO   A', round: 3, reps: 8 },
    ];
    expect(missingRepsEntries(config(3), done)).toEqual([]);
  });

  it('signale aussi un round intermédiaire raté, dans l ordre round/cycle', () => {
    const done: RepRecord[] = [{ exercise: 'Exo A', round: 2, reps: 10 }];
    expect(missingRepsEntries(config(3), done)).toEqual([
      { name: 'Exo A', round: 1 },
      { name: 'Exo A', round: 3 },
    ]);
  });
});
