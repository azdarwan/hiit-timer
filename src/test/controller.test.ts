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
  const voice: VoiceService = {
    init: () => {},
    setLang: () => {},
    setEnabled: () => {},
    speak: (t: string) => said.push(t),
    cancel: () => {},
  };
  return { voice, said };
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
    expect(said).toContain('Round 2');
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
});
