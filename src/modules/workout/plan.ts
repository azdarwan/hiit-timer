import type { WorkoutConfig } from '../../types';
import { exercisesFor } from './exercises';

export type PhaseType = 'prepare' | 'work' | 'rest' | 'longRest' | 'done';

export interface Phase {
  type: PhaseType;
  /** Durée de la phase, en secondes */
  duration: number;
  /** Round concerné par la phase (1-based) */
  round: number;
  /** Numéro de l'exercice dans le round (1-based, 0 pour les repos/préparation) */
  exercise: number;
  /** Nombre d'exercices par round */
  exercisesInRound: number;
  /** Nom de l'exercice concerné ('' pour les repos/préparation) */
  exerciseName: string;
  /** L'exercice concerné demande-t-il la saisie des reps ? */
  countReps: boolean;
}

export function buildPhases(config: WorkoutConfig): Phase[] {
  const defs = exercisesFor(config);
  const phases: Phase[] = [];
  if (config.prepare > 0) {
    phases.push({ type: 'prepare', duration: config.prepare, round: 1, exercise: 0, exercisesInRound: config.exercises, exerciseName: '', countReps: false });
  }
  for (let r = 1; r <= config.rounds; r++) {
    for (let e = 1; e <= config.exercises; e++) {
      const def = defs[e - 1];
      phases.push({ type: 'work', duration: config.work, round: r, exercise: e, exercisesInRound: config.exercises, exerciseName: def.name, countReps: def.countReps });
      if (e < config.exercises && config.rest > 0) {
        // Le repos porte le nom de l'exercice qu'il suit : c'est le moment
        // où l'appli propose la saisie des reps de cet exercice.
        phases.push({ type: 'rest', duration: config.rest, round: r, exercise: e, exercisesInRound: config.exercises, exerciseName: def.name, countReps: def.countReps });
      }
    }
    if (r < config.rounds && config.longRest > 0) {
      // Le repos long suit le dernier exercice du round : même convention.
      const last = defs[config.exercises - 1];
      phases.push({ type: 'longRest', duration: config.longRest, round: r + 1, exercise: 0, exercisesInRound: config.exercises, exerciseName: last.name, countReps: last.countReps });
    }
  }
  return phases;
}

/** Durée totale de la séance, en secondes. */
export function totalDuration(config: WorkoutConfig): number {
  const roundDuration = config.exercises * config.work + (config.exercises - 1) * config.rest;
  return config.prepare + config.rounds * roundDuration + (config.rounds - 1) * config.longRest;
}

/** Décalage de début de chaque phase depuis le début de la séance, en secondes. */
export function phaseOffsets(phases: Phase[]): number[] {
  const offsets: number[] = [];
  let o = 0;
  for (const p of phases) {
    offsets.push(o);
    o += p.duration;
  }
  return offsets;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
