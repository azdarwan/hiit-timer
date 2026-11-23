import { describe, expect, it } from 'vitest';
import type { WorkoutConfig } from '../types';
import {
  DEFAULT_EXERCISES,
  LEGACY_DEFAULT_EXERCISES,
  editableDefsFor,
  migrateExerciseDefs,
  moveExercise,
} from '../modules/workout/exercises';

const baseConfig: WorkoutConfig = {
  work: 30,
  rest: 10,
  exercises: 5,
  rounds: 3,
  longRest: 60,
  prepare: 10,
};

describe('migrateExerciseDefs (nouvel ordre du 23/11)', () => {
  it('remplace une liste par défaut historique dans le nouvel ordre', () => {
    const migrated = migrateExerciseDefs(LEGACY_DEFAULT_EXERCISES)!;
    // ordre voulu : tractions en 7, pont fessier en 8, gainage gauche/droit en 14 et 15
    expect(migrated.map((d) => d.name)).toEqual(DEFAULT_EXERCISES.map((d) => d.name));
    expect(migrated.map((d) => d.name)).toEqual([
      'Jumping jacks', 'Chaise', 'Pompes', 'Crunch', 'Step-up', 'Squat',
      'Tractions', 'Pont fessier', 'Dips triceps', 'Planche',
      'Montées de genoux', 'Fentes', 'Pompes avec rotation',
      'Gainage latéral gauche', 'Gainage latéral droit',
    ]);
  });

  it('hérite du comptage des reps par nom (gainages héritent de l\'ancien gainage)', () => {
    const legacy = LEGACY_DEFAULT_EXERCISES.map((d) =>
      d.name === 'Gainage latéral' ? { ...d, countReps: true } : { ...d },
    );
    const migrated = migrateExerciseDefs(legacy)!;
    expect(migrated.find((d) => d.name === 'Pompes')?.countReps).toBe(true);
    expect(migrated.find((d) => d.name === 'Tractions')?.countReps).toBe(true);
    expect(migrated.find((d) => d.name === 'Gainage latéral gauche')?.countReps).toBe(true);
    expect(migrated.find((d) => d.name === 'Gainage latéral droit')?.countReps).toBe(true);
    expect(migrated.find((d) => d.name === 'Crunch')?.countReps).toBe(false);
  });

  it('ne touche pas une liste personnalisée (nom modifié)', () => {
    const custom = LEGACY_DEFAULT_EXERCISES.map((d, i) =>
      i === 0 ? { ...d, name: 'Mon exo' } : { ...d },
    );
    expect(migrateExerciseDefs(custom)).toBe(custom);
  });

  it('est un no-op stable sur les nouveaux défauts', () => {
    const migrated = migrateExerciseDefs(DEFAULT_EXERCISES)!;
    expect(migrated.map((d) => d.name)).toEqual(DEFAULT_EXERCISES.map((d) => d.name));
  });

  it('laisse une liste absente ou vide telle quelle (remplie à l\'exécution)', () => {
    expect(migrateExerciseDefs(undefined)).toBeUndefined();
    expect(migrateExerciseDefs([])).toEqual([]);
  });
});

describe('moveExercise (glisser-déposer)', () => {
  const names = (ds: { name: string }[]) => ds.map((d) => d.name);

  it("déplace un exercice d'un cran vers le haut", () => {
    const defs = DEFAULT_EXERCISES.map((d) => ({ ...d }));
    const moved = moveExercise(defs, 6, 5); // Tractions de 7 vers 6
    expect(names(moved)).toEqual([
      'Jumping jacks', 'Chaise', 'Pompes', 'Crunch', 'Step-up',
      'Tractions', 'Squat', 'Pont fessier', 'Dips triceps', 'Planche',
      'Montées de genoux', 'Fentes', 'Pompes avec rotation',
      'Gainage latéral gauche', 'Gainage latéral droit',
    ]);
    expect(names(defs)).toEqual(names(DEFAULT_EXERCISES)); // pas de mutation
  });

  it('déplace vers le bas et borne les index hors limites', () => {
    const defs = DEFAULT_EXERCISES.map((d) => ({ ...d }));
    expect(names(moveExercise(defs, 0, 99))).toEqual([
      'Chaise', 'Pompes', 'Crunch', 'Step-up', 'Squat', 'Tractions', 'Pont fessier',
      'Dips triceps', 'Planche', 'Montées de genoux', 'Fentes', 'Pompes avec rotation',
      'Gainage latéral gauche', 'Gainage latéral droit', 'Jumping jacks',
    ]);
    expect(names(moveExercise(defs, 14, -5))).toEqual(names(moveExercise(defs, 14, 0)));
    expect(names(moveExercise(defs, 3, 999))).toEqual(names(moveExercise(defs, 3, 14)));
  });

  it('ignore un déplacement depuis une position invalide', () => {
    const defs = DEFAULT_EXERCISES.map((d) => ({ ...d }));
    expect(names(moveExercise(defs, -1, 0))).toEqual(names(defs));
    expect(names(moveExercise(defs, 99, 0))).toEqual(names(defs));
    expect(names(moveExercise([], 0, 0))).toEqual([]);
  });
});

describe('editableDefsFor (édition sans troncature)', () => {
  it('complète une liste courte avec des placeholders, sans toucher à la config', () => {
    const config = { ...baseConfig, exerciseDefs: [{ name: 'Mon exo', countReps: true }] };
    const defs = editableDefsFor(config);
    expect(defs.map((d) => d.name)).toEqual(['Mon exo', 'Exercice 2', 'Exercice 3', 'Exercice 4', 'Exercice 5']);
    expect(config.exerciseDefs).toEqual([{ name: 'Mon exo', countReps: true }]);
  });

  it('garde les définitions au-delà du nombre affiché (anti-troncature)', () => {
    const config = { ...baseConfig, exerciseDefs: DEFAULT_EXERCISES.map((d) => ({ ...d })) };
    const defs = editableDefsFor(config);
    expect(defs).toHaveLength(15); // exercises: 5, mais la liste reste complète
    expect(defs[6].name).toBe('Tractions');
  });

  it('retombe sur les défauts complets si la config ne sauvegarde pas de defs', () => {
    const defs = editableDefsFor(baseConfig);
    // anti-troncation même sans sauvegarde : les 15 défauts restent éditables
    expect(defs).toHaveLength(15);
    expect(defs.map((d) => d.name)).toEqual(DEFAULT_EXERCISES.map((d) => d.name));
    expect(defs[0].name).toBe('Jumping jacks');
  });
});
