import { describe, expect, it, beforeEach } from 'vitest';
import './localStorage.mock';
import { SessionController } from '../controller/SessionController';
import type { VoiceService } from '../modules/voice/VoiceService';
import type { BeepService } from '../modules/audio/beeps';
import type { Settings, WorkoutConfig } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { loadFavorites, saveFavorites } from '../modules/storage/favorites';
import { loadSession, clearSession } from '../modules/storage/session';

function makeVoice() {
  const said: string[] = [];
  let cancels = 0;
  const voice: VoiceService = {
    init: () => {},
    setLang: () => {},
    setEnabled: () => {},
    speak: (t: string) => said.push(t),
    cancel: () => {
      cancels++;
    },
  };
  return { voice, said, cancels: () => cancels };
}

function makeBeeps() {
  const played: string[] = [];
  const beeps = {
    init: () => {},
    setVolume: () => {},
    tick: () => void played.push('tick'),
    transition: () => void played.push('transition'),
    finish: () => void played.push('finish'),
  } as unknown as BeepService;
  return { beeps, played };
}

const settings: Settings = { ...DEFAULT_SETTINGS, keepAwake: false, vibrate: false };

describe('SessionController', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('déroule une séance complète avec toutes les annonces, via horloge virtuelle', async () => {
    const { voice, said } = makeVoice();
    const { beeps } = makeBeeps();
    let virtual = 0;
    const config: WorkoutConfig = { work: 12, rest: 5, exercises: 2, rounds: 2, longRest: 20, prepare: 2 };
    // total : 2 + 2*(2*12+5) + 20 = 80 s
    const controller = new SessionController({
      voice,
      beeps,
      settings,
      wakeLock: null,
      clock: () => virtual,
    });
    controller.start(config);

    // avance la séance virtuelle par pas de 250 ms, tick réel toutes les 100 ms
    let finished = false;
    const p = new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        virtual += 250;
        if (virtual >= 80000) {
          clearInterval(interval);
          setTimeout(() => {
            finished = true;
            resolve();
          }, 300);
        }
      }, 5);
    });
    await p;
    controller.terminate();
    expect(finished).toBe(true);
    expect(said[0]).toBe('Prépare-toi');
    expect(said).toContain('Round 1. Go !');
    expect(said).toContain('Moitié');
    expect(said).toContain('Repos');
    // "Round 2" est annoncé à la FIN du repos long, pas à son entrée (n°3)
    expect(said).not.toContain('Round 2');
    expect(said).toContain('Round 2. Go !');
    expect(said[said.length - 1]).toBe('Séance terminée, bravo !');
  });

  it('Passer saute les annonces de la portion sautée et annonce la nouvelle phase', async () => {
    const { voice, said } = makeVoice();
    const { beeps } = makeBeeps();
    let virtual = 0;
    const config: WorkoutConfig = { work: 10, rest: 5, exercises: 2, rounds: 1, longRest: 0, prepare: 2 };
    const controller = new SessionController({
      voice,
      beeps,
      settings,
      wakeLock: null,
      clock: () => virtual,
    });
    controller.start(config);
    // avance au milieu du premier travail (offset 2 s, milieu à 7 s)
    virtual = 7000;
    await new Promise((r) => setTimeout(r, 200));
    controller.skip();
    // le décompte 3/2/1 du travail (à 9, 10, 11 s) ne doit pas être annoncé
    expect(said).not.toContain('3');
    expect(said).toContain('Repos');
    controller.terminate();
  });

  it('rafale de Passer : ni annonce ni bip à l\'atterrissage, file vocale purgée ; skip isolé inchangé', async () => {
    const { voice, said, cancels } = makeVoice();
    const { beeps, played } = makeBeeps();
    let virtual = 0;
    // prepare 2 s, puis travail/repos × 4 exercices, sans repos long
    const config: WorkoutConfig = { work: 10, rest: 5, exercises: 4, rounds: 1, longRest: 0, prepare: 2 };
    const controller = new SessionController({ voice, beeps, settings, wakeLock: null, clock: () => virtual });
    controller.start(config);
    virtual = 7000; // milieu du premier travail
    await new Promise((r) => setTimeout(r, 200));

    // Skip isolé : l'atterrissage sur le repos annonce « Repos » (inchangé)
    controller.skip();
    expect(said).toContain('Repos');
    const saidAfterIsolated = said.length;
    const playedAfterIsolated = played.length;

    // Rafale : 3 skips à moins de 2 s d'intervalle (horloge virtuelle figée)
    controller.skip(); // atterrit sur travail 2 : « Go ! » avalé
    controller.skip(); // atterrit sur repos : « Repos » avalé
    controller.skip(); // atterrit sur travail 3 : « Go ! » avalé
    expect(said.length).toBe(saidAfterIsolated);
    expect(played.length).toBe(playedAfterIsolated);
    expect(cancels()).toBe(3); // la file vocale est purgée à chaque skip de rafale

    // Après plus de 2 s d'horloge virtuelle : retour au comportement normal
    virtual += 2500;
    controller.skip(); // atterrit sur le repos qui suit le travail 3
    expect(said.length).toBe(saidAfterIsolated + 1);
    expect(said[said.length - 1]).toBe('Repos');
    controller.terminate();
  });

  it('persiste la séance pour reprise et l\'efface à la fin', async () => {
    const { voice } = makeVoice();
    const { beeps } = makeBeeps();
    let virtual = 0;
    const config: WorkoutConfig = { work: 10, rest: 5, exercises: 2, rounds: 1, longRest: 0, prepare: 2 };
    const controller = new SessionController({ voice, beeps, settings, wakeLock: null, clock: () => virtual });
    controller.start(config);
    virtual = 3000;
    await new Promise((r) => setTimeout(r, 200));
    controller.pause();
    const saved = loadSession();
    expect(saved).not.toBeNull();
    expect(saved!.config).toEqual(config);
    expect(saved!.phaseIndex).toBe(1); // phase travail n°1 (offset 2 s)

    // reprise : un nouveau contrôleur restaure et continue sans dérive
    const said2: string[] = [];
    const voice2: VoiceService = {
      init: () => {},
      setLang: () => {},
      setEnabled: () => {},
      speak: (t: string) => said2.push(t),
      cancel: () => {},
    };
    const controller2 = new SessionController({
      voice: voice2,
      beeps,
      settings,
      wakeLock: null,
      clock: () => virtual,
    });
    controller2.restore(saved!);
    expect(controller2.snapshot.phaseIndex).toBe(1);
    expect(controller2.snapshot.elapsedMs).toBe(3000);
    controller2.terminate();

    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('un favori survit à une fermeture/réouverture (localStorage)', () => {
    const fav = { name: 'Tabata', config: { work: 20, rest: 10, exercises: 8, rounds: 6, longRest: 60, prepare: 5 } };
    saveFavorites([fav]);
    // "réouverture" : on relit depuis le stockage
    const loaded = loadFavorites();
    expect(loaded).toEqual([fav]);
    localStorage.removeItem('hiit-timer:favorites');
    expect(loadFavorites()).toEqual([]);
  });

  it('stocke les reps par round, les persiste à la pause et les restitue', async () => {
    const { voice } = makeVoice();
    const { beeps } = makeBeeps();
    let virtual = 0;
    const config: WorkoutConfig = {
      work: 30, rest: 10, exercises: 2, rounds: 2, longRest: 30, prepare: 0,
      exerciseDefs: [
        { name: 'Pompes', countReps: true },
        { name: 'Chaise', countReps: true },
      ],
    };
    const controller = new SessionController({ voice, beeps, settings, wakeLock: null, clock: () => virtual });
    controller.start(config);
    virtual = 35_000; // repos qui suit les pompes du round 1
    await new Promise((r) => setTimeout(r, 150));
    controller.setReps('Pompes', 1, 14);
    expect(controller.getReps('Pompes', 1)).toBe(14);
    controller.pause();
    const saved = loadSession();
    expect(saved?.reps?.['1:pompes']).toBe(14);

    const controller2 = new SessionController({ voice, beeps, settings, wakeLock: null, clock: () => virtual });
    controller2.restore(saved!);
    expect(controller2.getReps('Pompes', 1)).toBe(14);
    const records = controller2.getRepRecords();
    expect(records).toEqual([{ exercise: 'Pompes', round: 1, reps: 14 }]);
    controller2.terminate();
    controller.terminate();
  });

  it('rattrape ce qui est dû au retour d\'arrière-plan : pas de rafale, l\'état actuel', async () => {
    const { voice, said, cancels } = makeVoice();
    const { beeps } = makeBeeps();
    let virtual = 0;
    const config: WorkoutConfig = { work: 30, rest: 10, exercises: 2, rounds: 2, longRest: 120, prepare: 0 };
    const controller = new SessionController({ voice, beeps, settings, wakeLock: null, clock: () => virtual });
    controller.start(config);
    virtual = 2_000;
    await new Promise((r) => setTimeout(r, 150));
    const before = said.length;
    // Gel total de l'onglet : l'horloge saute 67 s d'un coup (aucun tick
    // pendant le gel), comme un premier tick de retour d'arrière-plan.
    virtual = 69_000;
    await new Promise((r) => setTimeout(r, 150));
    // Spec point 5 : plus RIEN n'est sauté, mais rien n'est rejoué en
    // rafale non plus : une seule annonce, la plus récente due (le « 1 »
    // du décompte en cours), après purge de la file vocale.
    expect(said.slice(before)).toEqual(['1']);
    expect(cancels()).toBe(1);
    expect(controller.snapshot.finished).toBe(false);
    controller.terminate();
  });

  it('pump rapproche (ecart faible) : toutes les annonces dues partent, aucune consolidation', async () => {
    const { voice, said } = makeVoice();
    const { beeps } = makeBeeps();
    let virtual = 0;
    // travail 30 s unique : moitie a 15 s, 3-2-1 a 27, 28, 29 s
    const config: WorkoutConfig = { work: 30, rest: 5, exercises: 1, rounds: 1, longRest: 0, prepare: 0 };
    const controller = new SessionController({ voice, beeps, settings, wakeLock: null, clock: () => virtual });
    controller.start(config);
    // Pump 1 (ecart 27,5 s : detecte comme gel) : « Moitie » et « 3 » sont
    // dues -> consolidation, seule la plus recente (« 3 ») part.
    virtual = 27_500;
    await new Promise((r) => setTimeout(r, 150));
    expect(said).toContain('3');
    // Pump 2, ecart 1,5 s seulement : PAS un gel -> « 2 » et « 1 » partent TOUTES LES DEUX.
    virtual = 28_999;
    await new Promise((r) => setTimeout(r, 150));
    expect(said).toContain('2');
    expect(said).toContain('1');
    controller.terminate();
  });
});
