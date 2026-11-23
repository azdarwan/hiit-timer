import { describe, expect, it } from 'vitest';
import { buildCues } from '../modules/announce/cues';
import { buildPhases, phaseOffsets } from '../modules/workout/plan';
import { DEFAULT_CONFIG } from '../types';

describe('File d\'annonces pré-calculée', () => {
  it('génère toutes les annonces du tableau au bon moment sur la séance par défaut', () => {
    const phases = buildPhases(DEFAULT_CONFIG);
    const cues = buildCues(phases, 'fr');
    const offsets = phaseOffsets(phases);

    const says = cues.filter((c) => c.action.say).map((c) => ({ at: c.at, say: c.action.say! }));

    // Début de préparation : "Prépare-toi" à t=0
    expect(says[0]).toEqual({ at: 0, say: 'Prépare-toi' });

    // Décompte 3, 2, 1 de la préparation (fin à 10 s)
    expect(says).toContainEqual({ at: 7000, say: '3' });
    expect(says).toContainEqual({ at: 8000, say: '2' });
    expect(says).toContainEqual({ at: 9000, say: '1' });

    // Fin du décompte avant le premier travail : "Round 1. Go !"
    expect(says).toContainEqual({ at: 10000, say: 'Round 1. Go !' });

    // Milieu du premier travail (30 s -> 15 s)
    expect(says).toContainEqual({ at: 25000, say: 'Moitié' });

    // Décompte avant le premier repos : "Repos" à la transition (t=40 s)
    expect(says).toContainEqual({ at: 40000, say: 'Repos' });

    // Repos long : « Fin du round, pause » à l'entrée (pas de "Round" à l'entrée)
    const longRestIndex = phases.findIndex((p) => p.type === 'longRest' && p.round === 2);
    expect(says).toContainEqual({ at: offsets[longRestIndex] * 1000, say: 'Fin du round, pause' });
    const longRestIndex3 = phases.findIndex((p) => p.type === 'longRest' && p.round === 3);
    expect(says).toContainEqual({ at: offsets[longRestIndex3] * 1000, say: 'Fin du round, pause' });
    expect(says.filter((s) => s.say === 'Round 2' || s.say === 'Round 3')).toHaveLength(0);

    // "Round X" est annoncé EN FIN de repos long, juste avant le round (n°3)
    const longRestEnd = (offsets[longRestIndex] + 120) * 1000;
    expect(says).toContainEqual({ at: longRestEnd, say: 'Round 2. Go !' });
    const longRestEnd3 = (offsets[longRestIndex3] + 120) * 1000;
    expect(says).toContainEqual({ at: longRestEnd3, say: 'Round 3. Go !' });

    // Décompte en jalons (réglage 10 s par défaut, spec 21/11) avant la fin
    // des repos longs : "10", "5", puis 3, 2, 1 (plus de 9, 8, 7...)
    for (const idx of [longRestIndex, longRestIndex3]) {
      const d = phases[idx].duration;
      for (const k of [10, 5, 3, 2, 1]) {
        expect(says).toContainEqual({ at: (offsets[idx] + d - k) * 1000, say: String(k) });
      }
      for (const k of [9, 8, 7, 6, 4]) {
        expect(says).not.toContainEqual({ at: (offsets[idx] + d - k) * 1000, say: String(k) });
      }
    }
    expect(says.filter((s) => s.say === '10')).toHaveLength(2);

    // Fin de séance à 2020 s
    expect(says).toContainEqual({ at: 2020000, say: 'Séance terminée, bravo !' });

    // Comptages : 45 travaux -> 45 "Moitié" ; 42 "Repos" courts + 2 "Fin du round, pause"
    expect(says.filter((s) => s.say === 'Moitié')).toHaveLength(45);
    expect(says.filter((s) => s.say === 'Repos')).toHaveLength(42);
    expect(says.filter((s) => s.say === 'Fin du round, pause')).toHaveLength(2);
    expect(says.filter((s) => s.say === 'Round 1. Go !')).toHaveLength(1);
    expect(says.filter((s) => s.say === 'Round 2. Go !')).toHaveLength(1);
    expect(says.filter((s) => s.say === 'Round 3. Go !')).toHaveLength(1);

    // Décomptes "1" : une par phase >= 4 s (1 + 45 + 42 + 2 = 90 phases)
    expect(says.filter((s) => s.say === '1')).toHaveLength(90);

    // Tous les cues sont triés par instant croissant
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].at).toBeGreaterThanOrEqual(cues[i - 1].at);
    }
  });

  it('ne génère pas de décompte dans une phase < 4 s, seulement le signal de transition', () => {
    const phases = buildPhases({ work: 3, rest: 0, exercises: 2, rounds: 1, longRest: 0, prepare: 2 });
    const cues = buildCues(phases, 'fr');
    const says = cues.map((c) => c.action.say);
    expect(says).toContain('Prépare-toi');
    expect(says).toContain('Go !');
    expect(says).not.toContain('3');
    expect(says).not.toContain('2');
    expect(says).not.toContain('1');
    expect(says).not.toContain('Moitié');
  });

  it('annonce la moitié dès 12 s de travail, avec décompte', () => {
    const phases = buildPhases({ work: 12, rest: 0, exercises: 1, rounds: 1, longRest: 0, prepare: 0 });
    const cues = buildCues(phases, 'fr');
    expect(cues).toEqual([
      { at: 0, action: { say: 'Round 1. Go !', beep: 'transition', vibrate: 100 } },
      { at: 6000, action: { say: 'Moitié' } },
      { at: 9000, action: { say: '3', beep: 'tick' } },
      { at: 10000, action: { say: '2', beep: 'tick' } },
      { at: 11000, action: { say: '1', beep: 'tick' } },
      { at: 12000, action: { say: 'Séance terminée, bravo !', beep: 'finish', vibrate: [200, 100, 200] } },
    ]);
  });

  it('utilise les textes anglais en option', () => {
    const phases = buildPhases({ work: 6, rest: 0, exercises: 1, rounds: 1, longRest: 0, prepare: 2 });
    const says = buildCues(phases, 'en').map((c) => c.action.say);
    expect(says).toContain('Get ready');
    expect(says).toContain('Workout complete, well done !');
  });

  it('décompte standard 3-2-1 sur le repos long quand le décompte étendu est désactivé', () => {
    const phases = buildPhases({ work: 20, rest: 5, exercises: 1, rounds: 2, longRest: 120, prepare: 0 });
    const says = buildCues(phases, 'fr', 0).map((c) => c.action.say!);
    expect(says).not.toContain('10');
    expect(says).toContain('3');
    expect(says).toContain('Repos');
  });

  it('coupe le décompte étendu si le repos long est trop court', () => {
    const phases = buildPhases({ work: 20, rest: 5, exercises: 1, rounds: 2, longRest: 8, prepare: 0 });
    const says = buildCues(phases, 'fr', 10).map((c) => c.action.say!);
    expect(says).not.toContain('10');
    expect(says).not.toContain('8');
    expect(says).toContain('7'); // décompte à duration - 1
  });

  it('jalons sur la pause longue : D=30 -> 30, 10, 5 puis 3, 2, 1 (spec 21/11)', () => {
    const phases = buildPhases({ work: 20, rest: 5, exercises: 1, rounds: 2, longRest: 60, prepare: 0 });
    const cues = buildCues(phases, 'fr', 30);
    const says = cues.filter((c) => c.action.say).map((c) => ({ at: c.at, say: c.action.say! }));
    const idx = phases.findIndex((p) => p.type === 'longRest');
    expect(idx).toBeGreaterThan(-1);
    const offsets = phaseOffsets(phases);
    const d = phases[idx].duration;
    for (const k of [30, 10, 5, 3, 2, 1]) {
      expect(says).toContainEqual({ at: (offsets[idx] + d - k) * 1000, say: String(k) });
    }
    for (const k of [25, 20, 15, 9, 8, 7, 6, 4]) {
      expect(says).not.toContainEqual({ at: (offsets[idx] + d - k) * 1000, say: String(k) });
    }
  });

  it('jalons sur la pause longue : D=15 -> 15, 10, 5 puis 3, 2, 1 (exemple de Wandrille)', () => {
    const phases = buildPhases({ work: 20, rest: 5, exercises: 1, rounds: 2, longRest: 60, prepare: 0 });
    const cues = buildCues(phases, 'fr', 15);
    const says = cues.filter((c) => c.action.say).map((c) => ({ at: c.at, say: c.action.say! }));
    const idx = phases.findIndex((p) => p.type === 'longRest');
    const offsets = phaseOffsets(phases);
    const d = phases[idx].duration;
    for (const k of [15, 10, 5, 3, 2, 1]) {
      expect(says).toContainEqual({ at: (offsets[idx] + d - k) * 1000, say: String(k) });
    }
  });

  it("annonce le nom de l'exercice avec le 'Go !' quand l'option est active", () => {
    const phases = buildPhases({
      work: 20, rest: 0, exercises: 2, rounds: 1, longRest: 0, prepare: 0,
      exerciseDefs: [
        { name: 'Pompes', countReps: true },
        { name: 'Crunchs', countReps: false },
      ],
    });
    const says = buildCues(phases, 'fr', 10, true).map((c) => c.action.say!);
    expect(says).toContain('Round 1. Pompes. Go !');
    expect(says).toContain('Crunchs. Go !');
    // Sans l'option : comportement inchangé
    const plain = buildCues(phases, 'fr', 10, false).map((c) => c.action.say!);
    expect(plain).toContain('Round 1. Go !');
    expect(plain).toContain('Go !');
    expect(plain).not.toContain('Pompes. Go !');
  });
});

