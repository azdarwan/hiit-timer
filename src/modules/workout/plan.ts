import type { WorkoutConfig } from '../../types';

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
}

export function buildPhases(config: WorkoutConfig): Phase[] {
  const phases: Phase[] = [];
  if (config.prepare > 0) {
    phases.push({ type: 'prepare', duration: config.prepare, round: 1, exercise: 0, exercisesInRound: config.exercises });
  }
  for (let r = 1; r <= config.rounds; r++) {
    for (let e = 1; e <= config.exercises; e++) {
      phases.push({ type: 'work', duration: config.work, round: r, exercise: e, exercisesInRound: config.exercises });
      if (e < config.exercises && config.rest > 0) {
        phases.push({ type: 'rest', duration: config.rest, round: r, exercise: e, exercisesInRound: config.exercises });
      }
    }
    if (r < config.rounds && config.longRest > 0) {
      phases.push({ type: 'longRest', duration: config.longRest, round: r + 1, exercise: 0, exercisesInRound: config.exercises });
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
