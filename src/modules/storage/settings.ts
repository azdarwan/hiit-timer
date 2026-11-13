import type { Settings, WorkoutConfig } from '../../types';
import { DEFAULT_CONFIG, DEFAULT_SETTINGS } from '../../types';

const SETTINGS_KEY = 'hiit-timer:settings';
const CONFIG_KEY = 'hiit-timer:config';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // silencieux
  }
}

export function loadConfig(): WorkoutConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<WorkoutConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: WorkoutConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // silencieux
  }
}
