import type { WorkoutConfig } from '../../types';
import { migrateExerciseDefs } from '../workout/exercises';

const FAVORITES_KEY = 'hiit-timer:favorites';

export interface Favorite {
  name: string;
  config: WorkoutConfig;
}

export function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Même migration d'ordre que la config (uniquement les favoris jamais
    // personnalisés, cf. migrateExerciseDefs).
    return (parsed as Favorite[]).map((f) => ({
      ...f,
      config: { ...f.config, exerciseDefs: migrateExerciseDefs(f.config.exerciseDefs) },
    }));
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: Favorite[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // silencieux
  }
}
