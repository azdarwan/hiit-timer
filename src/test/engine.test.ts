import { describe, expect, it, vi } from 'vitest';
import { TimerEngine } from '../modules/timer/engine';
import { buildPhases, phaseOffsets } from '../modules/workout/plan';
import type { EngineCallbacks } from '../modules/timer/engine';
import type { WorkoutConfig } from '../types';

function makeEngine(config: WorkoutConfig, cb: EngineCallbacks = {}, now: () => number = Date.now) {
  const phases = buildPhases(config);
  return { phases, engine: new TimerEngine(phases, cb, now) };
}

describe('TimerEngine', () => {
  it('les transitions de phase arrivent aux offsets exacts, même avec un tick irrégulier', () => {
    let t = 0;
    const cfg = { work: 5, rest: 2, exercises: 3, rounds: 2, longRest: 7, prepare: 3 };
    const phases = buildPhases(cfg);
    const offsets = phaseOffsets(phases);
    const engine = new TimerEngine(phases, {}, () => t);
    engine.restore(0, 0);
    engine.resume();
    // durée totale : 3 + 2*(3*5+2*2) + 7 = 48 s

    // horloge irrégulière : pas de 137 ms (non multiple des durées)
    const seen: number[] = [];
    while (!engine.snapshot.finished && t < 100000) {
      t += 137;
      engine.tick();
      const s = engine.snapshot;
      if (!seen.includes(s.phaseIndex)) {
        seen.push(s.phaseIndex);
        expect(s.elapsedMs).toBeGreaterThanOrEqual(offsets[s.phaseIndex] * 1000);
      }
    }
    expect(engine.snapshot.finished).toBe(true);
    expect(engine.elapsed()).toBe(48000);
  });

  it("Pause puis reprise : la phase reprend exactement où elle s'était arrêtée, sans dérive", async () => {
    // contenu total : 0,5 + (2*1 + 1*0,5) = 3 s
    const { engine } = makeEngine({ work: 1, rest: 0.5, exercises: 2, rounds: 1, longRest: 0, prepare: 0.5 });
    const onFinish = vi.fn();
    (engine as unknown as { cb: { onFinish?: typeof onFinish } }).cb = { onFinish };

    engine.start();
    await vi.waitFor(() => engine.elapsed() >= 700, { timeout: 3000 });
    const before = engine.snapshot.remainingMs;
    engine.pause();
    const pausedRemaining = engine.snapshot.remainingMs;
    expect(pausedRemaining).toBeLessThanOrEqual(before);
    expect(engine.snapshot.running).toBe(false);

    // pause réelle de 1 s
    await new Promise((r) => setTimeout(r, 1000));
    const elapsedDuringPause = engine.elapsed();
    engine.resume();
    await new Promise((r) => setTimeout(r, 200));

    // le temps écoulé n'a pas bougé pendant la pause, puis la séance finit sans dérive
    expect(Math.abs(engine.elapsed() - elapsedDuringPause)).toBeLessThan(400);
    const finishAt = new Promise<number>((resolve) => {
      const anyEngine = engine as unknown as { cb: { onFinish?: (ms: number) => void } };
      anyEngine.cb.onFinish = (ms) => resolve(ms);
    });
    const total = await finishAt;
    // durée du contenu : 3 s ; dérive < 0,5 s
    expect(Math.abs(total - 3000)).toBeLessThan(500);
    expect(onFinish).not.toHaveBeenCalled();
  }, 15000);

  it("Passer pendant l'exercice 7/15 envoie directement au repos suivant", () => {
    const cfg = { work: 30, rest: 10, exercises: 15, rounds: 3, longRest: 120, prepare: 10 };
    const { phases, engine } = makeEngine(cfg);
    engine.start();
    // avance jusqu'à l'exercice 7 du round 1
    const idx = phases.findIndex((p) => p.type === 'work' && p.round === 1 && p.exercise === 7);
    (engine as unknown as { phaseIndex: number }).phaseIndex = idx;
    (engine as unknown as { anchorElapsed: number }).anchorElapsed = engine.phaseOffsetMs(idx);
    engine.skip();
    const s = engine.snapshot;
    expect(s.phase.type).toBe('rest');
    expect(s.phase.round).toBe(1);
    expect(s.phase.exercise).toBe(7);
  });

  it('Passer pendant la dernière phase termine la séance', () => {
    const { phases, engine } = makeEngine({ work: 2, rest: 1, exercises: 2, rounds: 1, longRest: 0, prepare: 1 });
    let finished = false;
    const e = engine as unknown as { cb: { onFinish?: () => void } };
    e.cb = { onFinish: () => (finished = true) };
    engine.start();
    (engine as unknown as { phaseIndex: number }).phaseIndex = phases.length - 1;
    engine.skip();
    expect(finished).toBe(true);
  });

  it('une séance réelle de 5 s de contenu se termine avec une dérive < 100 ms', async () => {
    let finishedAt = 0;
    const startAt = Date.now();
    const phases = buildPhases({ work: 1, rest: 0, exercises: 5, rounds: 1, longRest: 0, prepare: 0 });
    const engine = new TimerEngine(phases, {
      onFinish: () => (finishedAt = Date.now()),
    });
    engine.start();
    await vi.waitFor(() => finishedAt > 0, { timeout: 5000 });
    expect(finishedAt - startAt - 5000).toBeLessThan(100);
  });
});
