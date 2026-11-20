import type { WorkoutConfig } from '../../types';

/** Définition d'un exercice : nom libre + comptage des reps. */
export interface ExerciseDef {
  name: string;
  /** Si vrai, l'appli demande le nombre de reps à la pause suivante. */
  countReps: boolean;
}

/**
 * Séance PPG par défaut : base du Scientific 7-Minute Workout (Klika & Jordan
 * 2013, cf. le topic entrainement-sportif), enrichie de tractions et du pont
 * fessier. Comptage des reps pour pompes, pompes avec rotation et tractions
 * (cf. backlog Hit Timer). Les noms sont modifiables dans l'écran config.
 */
export const DEFAULT_EXERCISES: ExerciseDef[] = [
  { name: 'Jumping jacks', countReps: false },
  { name: 'Chaise', countReps: false },
  { name: 'Pompes', countReps: true },
  { name: 'Crunch', countReps: false },
  { name: 'Step-up', countReps: false },
  { name: 'Squat', countReps: false },
  { name: 'Dips triceps', countReps: false },
  { name: 'Planche', countReps: false },
  { name: 'Montées de genoux', countReps: false },
  { name: 'Fentes', countReps: false },
  { name: 'Pompes avec rotation', countReps: true },
  { name: 'Gainage latéral', countReps: false },
  { name: 'Tractions', countReps: true },
  { name: 'Pont fessier', countReps: false },
  { name: 'Exercice 15', countReps: false },
];

/** Nom normalisé : clé stable pour les données, indépendante de la casse. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Liste des exercices d'une config, toujours alignée sur `exercises` :
 * tronquée si trop longue, complétée avec "Exercice N" si trop courte.
 * Compatibilité : une ancienne config (favori, séance sauvegardée) sans
 * `exerciseDefs` récupère les noms par défaut dans l'ordre.
 */
export function exercisesFor(config: WorkoutConfig): ExerciseDef[] {
  const n = Math.max(1, config.exercises);
  const defs = (config.exerciseDefs ?? DEFAULT_EXERCISES).slice(0, n);
  while (defs.length < n) {
    defs.push({ name: `Exercice ${defs.length + 1}`, countReps: false });
  }
  return defs;
}
