import type { EngineSnapshot } from '../modules/timer/engine';
import { TimerEngine } from '../modules/timer/engine';
import type { Phase } from '../modules/workout/plan';
import { buildPhases } from '../modules/workout/plan';
import type { Cue } from '../modules/announce/cues';
import { buildCues } from '../modules/announce/cues';
import type { VoiceService } from '../modules/voice/VoiceService';
import type { BeepService } from '../modules/audio/beeps';
import type { WakeLockManager } from '../modules/wakelock/wakelock';
import type { Settings, WorkoutConfig } from '../types';
import type { SavedSession } from '../modules/storage/session';
import { saveSession, clearSession } from '../modules/storage/session';

export interface SessionControllerDeps {
  voice: VoiceService;
  beeps: BeepService;
  settings: Settings;
  wakeLock: WakeLockManager | null;
  /** Horloge virtuelle du moteur, en ms. Par défaut : Date.now(). */
  clock?: () => number;
  onSnapshot?: (s: EngineSnapshot) => void;
  onFinish?: (realElapsedMs: number, virtualElapsedMs: number) => void;
  onPaused?: () => void;
}

const SAVE_INTERVAL_MS = 1000;

/**
 * Relie le moteur de timer, la file d'annonces pré-calculée, la voix, les
 * bips, la vibration, le wake lock et la persistance de séance.
 */
export class SessionController {
  private engine!: TimerEngine;
  private phases: Phase[] = [];
  private cues: Cue[] = [];
  private cueIndex = 0;
  private config!: WorkoutConfig;
  private realElapsedMs = 0;
  private realAnchor = 0;
  private lastSave = 0;
  private finished = false;

  constructor(private deps: SessionControllerDeps) {}

  start(config: WorkoutConfig): void {
    this.config = config;
    this.setup(config);
    this.realElapsedMs = 0;
    this.realAnchor = Date.now();
    if (this.deps.settings.keepAwake && this.deps.wakeLock) void this.deps.wakeLock.request();
    this.engine.start();
  }

  /** Reprend une séance sauvegardée, en état pause. */
  restore(saved: SavedSession): void {
    this.config = saved.config;
    this.setup(saved.config);
    this.engine.restore(saved.phaseIndex, saved.elapsedMs);
    this.cueIndex = this.cues.findIndex((c) => c.at > saved.elapsedMs + 1);
    if (this.cueIndex < 0) this.cueIndex = this.cues.length;
    this.realElapsedMs = saved.realElapsedMs;
    this.emit();
  }

  resume(): void {
    if (this.finished) return;
    this.realAnchor = Date.now();
    this.engine.resume();
    if (this.deps.settings.keepAwake && this.deps.wakeLock) void this.deps.wakeLock.request();
  }

  pause(): void {
    if (this.finished) return;
    this.engine.pause();
    this.deps.voice.cancel();
    this.realElapsedMs += Date.now() - this.realAnchor;
    this.persist();
    this.deps.onPaused?.();
    this.emit();
  }

  skip(): void {
    if (this.finished) return;
    const next = this.engine.snapshot.phaseIndex + 1;
    if (next < this.phases.length) {
      const target = this.engine.phaseOffsetMs(next);
      while (this.cueIndex < this.cues.length && this.cues[this.cueIndex].at < target - 1) {
        this.cueIndex++;
      }
    }
    this.engine.skip();
    this.pump();
    this.emit();
  }

  /** Arrêt définitif (bouton Terminer). */
  terminate(): void {
    this.engine.stop();
    this.deps.voice.cancel();
    this.deps.wakeLock?.release();
    clearSession();
  }

  updateSettings(settings: Settings): void {
    this.deps.settings = settings;
    this.deps.voice.setLang(settings.lang);
    this.deps.voice.setEnabled(settings.voice);
    this.deps.beeps.setVolume(settings.beepVolume);
  }

  get snapshot(): EngineSnapshot {
    return this.engine.snapshot;
  }

  private setup(config: WorkoutConfig): void {
    this.phases = buildPhases(config);
    this.cues = buildCues(this.phases, this.deps.settings.lang);
    this.cueIndex = 0;
    this.finished = false;
    this.engine = new TimerEngine(
      this.phases,
      {
        onTick: (s) => {
          this.pump();
          this.maybePersist();
          this.deps.onSnapshot?.(s);
        },
        onFinish: () => {
          this.finished = true;
          this.realElapsedMs += Date.now() - this.realAnchor;
          this.pumpAt(this.engine.snapshot.totalMs);
          this.deps.wakeLock?.release();
          clearSession();
          this.deps.onFinish?.(this.realElapsedMs, this.engine.snapshot.totalMs);
        },
      },
      this.deps.clock,
    );
  }

  private pump(): void {
    this.pumpAt(this.engine.elapsed());
  }

  private pumpAt(elapsedMs: number): void {
    while (this.cueIndex < this.cues.length && this.cues[this.cueIndex].at <= elapsedMs + 1) {
      this.fire(this.cues[this.cueIndex]);
      this.cueIndex++;
    }
  }

  private fire(cue: Cue): void {
    const a = cue.action;
    if (a.say) this.deps.voice.speak(a.say);
    if (a.beep === 'tick') this.deps.beeps.tick();
    else if (a.beep === 'transition') this.deps.beeps.transition();
    else if (a.beep === 'finish') this.deps.beeps.finish();
    if (a.vibrate && this.deps.settings.vibrate) {
      try {
        navigator.vibrate?.(a.vibrate);
      } catch {
        // silencieux
      }
    }
  }

  private maybePersist(): void {
    const now = Date.now();
    if (now - this.lastSave < SAVE_INTERVAL_MS) return;
    this.lastSave = now;
    this.persist();
  }

  private persist(): void {
    const s = this.engine.snapshot;
    const running = s.running;
    const realExtra = running ? Date.now() - this.realAnchor : 0;
    saveSession({
      config: this.config,
      phaseIndex: s.phaseIndex,
      elapsedMs: s.elapsedMs,
      realElapsedMs: this.realElapsedMs + realExtra,
      savedAt: Date.now(),
    });
  }

  private emit(): void {
    this.deps.onSnapshot?.(this.engine.snapshot);
  }
}
