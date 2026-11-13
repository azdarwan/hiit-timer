import type { WorkoutConfig } from '../../types';

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
    return Array.isArray(parsed) ? (parsed as Favorite[]) : [];
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
