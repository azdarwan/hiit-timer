import type { WorkoutConfig } from '../../types';

const HISTORY_KEY = 'hiit-timer:history';
const MAX_SESSIONS = 500;

/** Une ligne de reps réalisées : exercice, round, nombre. */
export interface RepRecord {
  exercise: string;
  round: number;
  reps: number;
}

/** Séance terminée, archivée avec le jour (l'heure est inutile). */
export interface RecordedSession {
  id: string;
  /** Jour local de la séance, YYYY-MM-DD */
  day: string;
  /** Durée réelle passée dans la séance, en ms */
  realMs: number;
  /** Durée virtuelle prévue, en ms */
  totalMs: number;
  config: WorkoutConfig;
  reps: RepRecord[];
}

/** Jour local au format YYYY-MM-DD. */
export function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addSession(session: Omit<RecordedSession, 'id' | 'day'> & { day?: string }): RecordedSession {
  const full: RecordedSession = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    day: session.day ?? today(),
    realMs: session.realMs,
    totalMs: session.totalMs,
    config: session.config,
    reps: session.reps,
  };
  const all = listSessions();
  all.push(full);
  while (all.length > MAX_SESSIONS) all.shift();
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  } catch {
    // silencieux : le quota peut être plein, la séance reste affichée
  }
  return full;
}

export function listSessions(): RecordedSession[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecordedSession[]) : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // silencieux
  }
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}` : s;
}

/**
 * CSV longue durée, séparateur ';' (Excel fr) :
 * une ligne par reps saisie, plus une ligne résumé "Séance" par séance
 * (round 0), ce qui permet de compter les séances et les minutes/semaine
 * même sans aucune saisie de reps.
 */
export function toCSV(sessions: RecordedSession[]): string {
  const rows: (string | number)[][] = [['date', 'exercice', 'round', 'reps', 'duree_min']];
  for (const s of [...sessions].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    const minutes = (s.realMs / 60000).toFixed(1);
    rows.push([s.day, 'Séance', 0, '', minutes]);
    for (const r of [...s.reps].sort((a, b) => a.exercise.localeCompare(b.exercise) || a.round - b.round)) {
      rows.push([s.day, r.exercise, r.round, r.reps, '']);
    }
  }
  return rows.map((r) => r.map(csvEscape).join(';')).join('\r\n') + '\r\n';
}

/** Télécharge un CSV via le navigateur. */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type SyncResult = { ok: true } | { ok: false; error: string };

/**
 * Envoie une séance au serveur de stockage (API PHP OVH, cf. server/).
 * Silencieusement rejeté si pas d'URL configurée.
 */
export async function syncSession(
  url: string,
  token: string,
  session: RecordedSession,
): Promise<SyncResult> {
  if (!url) return { ok: false, error: 'no-server' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hit-Token': token },
      body: JSON.stringify({
        day: session.day,
        realMs: session.realMs,
        totalMs: session.totalMs,
        config: {
          work: session.config.work,
          rest: session.config.rest,
          exercises: session.config.exercises,
          rounds: session.config.rounds,
          longRest: session.config.longRest,
          prepare: session.config.prepare,
        },
        reps: session.reps,
      }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'erreur réseau' };
  }
}
