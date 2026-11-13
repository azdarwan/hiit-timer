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
}

export type Lang = 'fr' | 'en';

export interface Settings {
  lang: Lang;
  voice: boolean;
  beepVolume: number;
  keepAwake: boolean;
  vibrate: boolean;
}

export const DEFAULT_CONFIG: WorkoutConfig = {
  work: 30,
  rest: 10,
  exercises: 15,
  rounds: 3,
  longRest: 120,
  prepare: 10,
};

export const DEFAULT_SETTINGS: Settings = {
  lang: 'fr',
  voice: true,
  beepVolume: 0.7,
  keepAwake: true,
  vibrate: true,
};

export const CONFIG_LIMITS = {
  work: { min: 5, step: 5 },
  rest: { min: 0, step: 5 },
  exercises: { min: 1, step: 1 },
  rounds: { min: 1, step: 1 },
  longRest: { min: 0, step: 15 },
  prepare: { min: 0, step: 5 },
} as const;
