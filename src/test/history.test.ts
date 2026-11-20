import { describe, expect, it, beforeEach } from 'vitest';
import './localStorage.mock';
import { addSession, listSessions, clearHistory, toCSV } from '../modules/storage/history';
import { DEFAULT_CONFIG } from '../types';

describe('Historique des séances', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stocke les séances avec le jour, sans l\'heure', () => {
    addSession({ realMs: 2020000, totalMs: 2020000, config: DEFAULT_CONFIG, day: '2026-11-19', reps: [] });
    addSession({
      realMs: 1500000, totalMs: 2020000, config: DEFAULT_CONFIG, day: '2026-11-20',
      reps: [{ exercise: 'Pompes', round: 1, reps: 14 }],
    });
    const all = listSessions();
    expect(all.map((s) => s.day)).toEqual(['2026-11-19', '2026-11-20']);
    expect(all[1].reps).toEqual([{ exercise: 'Pompes', round: 1, reps: 14 }]);
    // pas d'heure stockée : le jour est jour-jour
    expect(all[0]).not.toHaveProperty('hour');
    clearHistory();
    expect(listSessions()).toEqual([]);
  });

  it('exporte un CSV lisible par Excel fr : résumé par séance + lignes par exercice/round', () => {
    addSession({
      realMs: 2020000, totalMs: 2020000, config: DEFAULT_CONFIG, day: '2026-11-19',
      reps: [
        { exercise: 'Pompes', round: 1, reps: 14 },
        { exercise: 'Pompes', round: 2, reps: 12 },
        { exercise: 'Tractions', round: 1, reps: 6 },
      ],
    });
    addSession({ realMs: 1500000, totalMs: 2020000, config: DEFAULT_CONFIG, day: '2026-11-20', reps: [] });
    const csv = toCSV(listSessions());
    const lines = csv.split('\\r\\n').filter(Boolean);
    expect(lines[0]).toBe('date;exercice;round;reps;duree_min');
    // ligne résumé de la 1re séance (permet de compter séances et minutes/semaine)
    expect(lines[1]).toBe('2026-11-19;Séance;0;;33.7');
    expect(lines).toContain('2026-11-19;Pompes;1;14;');
    expect(lines).toContain('2026-11-19;Pompes;2;12;');
    expect(lines).toContain('2026-11-19;Tractions;1;6;');
    // séance sans reps : juste sa ligne résumé (25 min)
    expect(lines[5]).toBe('2026-11-20;Séance;0;;25');
  });
});
