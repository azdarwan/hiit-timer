import type { Phase } from '../workout/plan';

export interface EngineSnapshot {
  phaseIndex: number;
  phase: Phase;
  /** Temps restant dans la phase, en ms */
  remainingMs: number;
  /** Progression de la phase, entre 0 et 1 */
  phaseProgress: number;
  /** Temps virtuel écoulé depuis le début de la séance, en ms */
  elapsedMs: number;
  totalMs: number;
  totalRemainingMs: number;
  running: boolean;
  finished: boolean;
}

export interface EngineCallbacks {
  onTick?: (s: EngineSnapshot) => void;
  onPhaseStart?: (phase: Phase, index: number) => void;
  onFinish?: (elapsedMs: number) => void;
}

const TICK_MS = 100;

/**
 * Moteur de timer basé sur des timestamps réels : le temps écoulé est
 * toujours recalculé par delta d'horloge (now - ancre), jamais par
 * accumulation d'intervalles. Les frontières de phases sont des offsets
 * exacts depuis le début de séance, donc la dérive ne s'accumule pas,
 * quel que soit le jitter des ticks.
 */
export class TimerEngine {
  private offsets: number[] = [];
  private totalMs: number;
  private anchorElapsed = 0;
  private anchorTime = 0;
  private phaseIndex = 0;
  private running = false;
  private finished = false;
  private started = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private phases: Phase[],
    private cb: EngineCallbacks,
    private now: () => number = Date.now,
    /** Rythme des ticks (pumps). Injecté uniquement par les tests avec horloge accélérée ; défaut production 100 ms. */
    private tickMs: number = TICK_MS,
  ) {
    let o = 0;
    for (const p of phases) {
      this.offsets.push(o);
      o += p.duration * 1000;
    }
    this.totalMs = o;
  }

  /** Temps virtuel écoulé depuis le début de la séance, en ms. */
  elapsed(): number {
    if (!this.running) return this.anchorElapsed;
    return this.anchorElapsed + (this.now() - this.anchorTime);
  }

  phaseOffsetMs(index: number): number {
    return this.offsets[index];
  }

  start(): void {
    this.started = true;
    this.phaseIndex = 0;
    this.anchorElapsed = 0;
    this.anchorTime = this.now();
    this.running = true;
    this.cb.onPhaseStart?.(this.phases[0], 0);
    this.loop();
    this.emit();
  }

  /** Restaure une séance sauvegardée, en état pause. */
  restore(phaseIndex: number, elapsedMs: number): void {
    this.started = true;
    this.phaseIndex = Math.max(0, Math.min(phaseIndex, this.phases.length - 1));
    this.anchorElapsed = Math.max(0, Math.min(elapsedMs, this.totalMs));
    this.running = false;
  }

  resume(): void {
    if (this.finished || this.running || !this.started) return;
    this.anchorTime = this.now();
    this.running = true;
    this.loop();
    this.emit();
  }

  pause(): void {
    if (!this.running) return;
    this.anchorElapsed = this.elapsed();
    this.running = false;
    this.stopLoop();
  }

  /** Passe directement à la phase suivante. */
  skip(): void {
    if (this.finished || !this.started) return;
    const next = this.phaseIndex + 1;
    if (next >= this.phases.length) {
      this.emit();
      this.finish();
      return;
    }
    this.phaseIndex = next;
    this.anchorElapsed = this.offsets[next];
    this.anchorTime = this.now();
    this.cb.onPhaseStart?.(this.phases[next], next);
    if (this.running) this.emit();
  }

  stop(): void {
    this.stopLoop();
    this.running = false;
  }

  get snapshot(): EngineSnapshot {
    return this.compute();
  }

  tick(): void {
    if (this.finished || !this.started) return;
    if (!this.running) {
      this.emit();
      return;
    }
    const e = this.elapsed();
    while (this.phaseIndex < this.phases.length) {
      const end = this.offsets[this.phaseIndex] + this.phases[this.phaseIndex].duration * 1000;
      if (e < end) break;
      const next = this.phaseIndex + 1;
      if (next >= this.phases.length) {
        this.emit();
        this.finish();
        return;
      }
      this.phaseIndex = next;
      this.cb.onPhaseStart?.(this.phases[next], next);
    }
    this.emit();
  }

  private finish(): void {
    this.running = false;
    this.finished = true;
    this.stopLoop();
    this.anchorElapsed = this.totalMs;
    this.cb.onFinish?.(this.totalMs);
  }

  private loop(): void {
    this.stopLoop();
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  private stopLoop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private compute(): EngineSnapshot {
    const phase = this.phases[Math.min(this.phaseIndex, this.phases.length - 1)];
    const start = this.offsets[this.phaseIndex];
    const durMs = phase.duration * 1000;
    const e = this.elapsed();
    return {
      phaseIndex: this.phaseIndex,
      phase,
      remainingMs: Math.max(0, start + durMs - e),
      phaseProgress: durMs > 0 ? Math.min(1, Math.max(0, (e - start) / durMs)) : 1,
      elapsedMs: Math.min(e, this.totalMs),
      totalMs: this.totalMs,
      totalRemainingMs: Math.max(0, this.totalMs - e),
      running: this.running,
      finished: this.finished,
    };
  }

  private emit(): void {
    this.cb.onTick?.(this.compute());
  }
}
