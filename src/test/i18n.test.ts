import { describe, expect, it } from 'vitest';
import { strings } from '../i18n';
import { fr } from '../i18n/fr';
import { en } from '../i18n/en';

describe('i18n', () => {
  it('retourne le dictionnaire français complet comme base', () => {
    expect(strings('fr')).toEqual(fr);
  });

  it('surcharge les clés anglaises déclarées', () => {
    expect(strings('en').cues.go).toBe('Go !');
    expect(strings('en').cues.prepare).toBe('Get ready');
    expect(strings('en').session.round).toBe('Round');
    expect(strings('en').common.resume).toBe('Resume');
  });

  it('retombe sur le français pour les clés absentes de la surcharge', () => {
    expect(strings('en').done.title).toBe(fr.done.title);
    expect(strings('en').config.settings).toBe(fr.config.settings);
    expect(strings('en').done.exportCsv).toBe(fr.done.exportCsv);
  });

  it('retombe sur le français pour une langue inconnue', () => {
    expect(strings('xx' as never).cues.go).toBe(fr.cues.go);
  });

  it('garde les cues vocales françaises exactes (les tests de cues en dépendent)', () => {
    expect(fr.cues.prepare).toBe('Pr\u00e9pare-toi');
    expect(fr.cues.go).toBe('Go !');
    expect(fr.cues.done).toBe('S\u00e9ance termin\u00e9e, bravo !');
  });

  it('la surcharge ne déclare que des clés connues de la base', () => {
    // deepMerge ne copy que les clés de l'overlay ; on vérifie qu'aucune clé
    // de l'overlay n'est étrangère au dictionnaire (typographie silencieuse).
    const check = (base: Record<string, unknown>, overlay: Record<string, unknown>) => {
      for (const k of Object.keys(overlay)) {
        expect(Object.keys(base)).toContain(k);
        if (typeof overlay[k] === 'object' && overlay[k] !== null && typeof base[k] === 'object' && base[k] !== null) {
          check(base[k] as Record<string, unknown>, overlay[k] as Record<string, unknown>);
        }
      }
    };
    check(fr, en);
  });
});
