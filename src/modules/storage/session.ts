import type { WorkoutConfig } from '../../types';

const SESSION_KEY = 'hiit-timer:session';

/** État minimal pour reprendre une séance après fermeture de l'appli. */
export interface SavedSession {
  config: WorkoutConfig;
  phaseIndex: number;
  /** Temps virtuel écoulé au moment de la sauvegarde, en ms. */
  elapsedMs: number;
  /** Durée réelle déjà passée dans la séance (hors pauses), en ms. */
  realElapsedMs: number;
  /**
   * Reps saisies, par round. Clé : normalisation du nom d'exercice + round,
   * pour que les données suivent l'exercice même si le cycle change.
   */
  reps?: Record<string, number>;
  savedAt: number;
}

export function saveSession(session: SavedSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // silencieux
  }
}

export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // silencieux
  }
}
