import { DEFAULT_EXERCISES } from './modules/workout/exercises';
import type { ExerciseDef } from './modules/workout/exercises';

export interface WorkoutConfig {
  /** Durée d'un exercice, en secondes (>= 5) */
  work: number;
  /** Repos entre deux exercices, en secondes (>= 0) */
  rest: number;
  /** Nombre d'exercices par round (>= 1) */
  exercises: number;
  /** Nombre de rounds (>= 1) */
  rounds: number;
  /** Repos long entre deux rounds, en secondes (>= 0) */
  longRest: number;
  /** Préparation avant la séance, en secondes (>= 0) */
  prepare: number;
  /**
   * Définitions des exercices (nom visible, comptage des reps).
   * Alignée sur `exercises` à l'exécution : tronquée/complétée si nécessaire,
   * pour rester compatible avec les anciennes configs et favoris.
   */
  exerciseDefs?: ExerciseDef[];
}

export type Lang = 'fr' | 'en';

export interface Settings {
  lang: Lang;
  voice: boolean;
  /** Voix spécifique sélectionnée (null = choix automatique) */
  voiceName: string | null;
  beepVolume: number;
  keepAwake: boolean;
  vibrate: boolean;
  /** Décompte vocal avant la fin du repos long, en secondes (0 = désactivé) */
  countdownSec: number;
  /** URL du serveur de stockage (ex. https://domaine.tld/hiit/api.php). Vide = pas de synchro. */
  syncUrl: string;
  /** Jeton d'authentification du serveur de stockage */
  syncToken: string;
}

export const DEFAULT_CONFIG: WorkoutConfig = {
  work: 30,
  rest: 10,
  exercises: 15,
  rounds: 3,
  longRest: 120,
  prepare: 10,
  exerciseDefs: DEFAULT_EXERCISES,
};

export const DEFAULT_SETTINGS: Settings = {
  lang: 'fr',
  voice: true,
  voiceName: null,
  beepVolume: 0.7,
  keepAwake: true,
  vibrate: true,
  countdownSec: 10,
  syncUrl: '',
  syncToken: '',
};

export const CONFIG_LIMITS = {
  work: { min: 5, step: 5 },
  rest: { min: 0, step: 5 },
  exercises: { min: 1, step: 1 },
  rounds: { min: 1, step: 1 },
  longRest: { min: 0, step: 15 },
  prepare: { min: 0, step: 5 },
} as const;

/** Bornes du décompte de fin de repos long, en secondes. */
export const COUNTDOWN_LIMITS = { min: 0, max: 30, step: 5 } as const;
