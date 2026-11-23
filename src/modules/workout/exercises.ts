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
 * fessier. Comptage des reps pour pompes, tractions et pompes avec rotation
 * (cf. backlog Hit Timer). Les noms sont modifiables dans l'écran config.
 *
 * Ordre voulu par Wandrille (23/11) : tractions en 7, pont fessier en 8,
 * gainage latéral dédoublé gauche/droit en 14 et 15. Les autres conservent
 * leur ordre relatif.
 */
export const DEFAULT_EXERCISES: ExerciseDef[] = [
  { name: 'Jumping jacks', countReps: false },
  { name: 'Chaise', countReps: false },
  { name: 'Pompes', countReps: true },
  { name: 'Crunch', countReps: false },
  { name: 'Step-up', countReps: false },
  { name: 'Squat', countReps: false },
  { name: 'Tractions', countReps: true },
  { name: 'Pont fessier', countReps: false },
  { name: 'Dips triceps', countReps: false },
  { name: 'Planche', countReps: false },
  { name: 'Montées de genoux', countReps: false },
  { name: 'Fentes', countReps: false },
  { name: 'Pompes avec rotation', countReps: true },
  { name: 'Gainage latéral gauche', countReps: false },
  { name: 'Gainage latéral droit', countReps: false },
];

/**
 * Défauts historiques (ordre d'avant le 23/11). Sert uniquement à détecter
 * une config jamais personnalisée, pour la migrer vers le nouvel ordre.
 */
export const LEGACY_DEFAULT_EXERCISES: ExerciseDef[] = [
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
 * Migration de l'ordre par défaut (23/11) : la config est mémorisée en
 * localStorage avec sa liste d'exercices dès le premier lancement, donc
 * changer les défauts ne suffit pas. Si les définitions correspondent
 * exactement aux défauts historiques (mêmes noms, même ordre), on les
 * remplace par les nouveaux, en héritant les réglages de comptage par
 * nom (les gainages gauche/droit héritent de l'ancien « Gainage latéral »).
 * Toute liste personnalisée (au moins un nom modifié) est laissée telle
 * quelle : la migration ne touche jamais un vrai réglage utilisateur.
 */
export function migrateExerciseDefs(defs: ExerciseDef[] | undefined): ExerciseDef[] {
  if (!defs || defs.length === 0) return DEFAULT_EXERCISES;
  const legacyNames = new Set(LEGACY_DEFAULT_EXERCISES.map((d) => normalizeName(d.name)));
  const byName = new Map(defs.map((d) => [normalizeName(d.name), { ...d }]));
  if (defs.length !== legacyNames.size) return defs;
  for (const n of legacyNames) {
    if (!byName.has(n)) return defs;
  }
  const inherit = (name: string, base: string): boolean =>
    byName.get(normalizeName(name))?.countReps ?? byName.get(normalizeName(base))?.countReps ?? false;
  return DEFAULT_EXERCISES.map((d) => ({
    ...d,
    countReps: normalizeName(d.name).startsWith('gainage latéral')
      ? inherit(d.name, 'Gainage latéral')
      : inherit(d.name, d.name),
  }));
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
