import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXERCISES,
  LEGACY_DEFAULT_EXERCISES,
  migrateExerciseDefs,
} from '../modules/workout/exercises';

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
