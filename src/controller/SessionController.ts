import type { EngineSnapshot } from '../modules/timer/engine';
import { TimerEngine } from '../modules/timer/engine';
import type { Phase } from '../modules/workout/plan';
import { buildPhases } from '../modules/workout/plan';
import { normalizeName } from '../modules/workout/exercises';
import type { Cue } from '../modules/announce/cues';
import { buildCues } from '../modules/announce/cues';
import type { VoiceService } from '../modules/voice/VoiceService';
import type { BeepService } from '../modules/audio/beeps';
import type { WakeLockManager } from '../modules/wakelock/wakelock';
import type { Settings, WorkoutConfig } from '../types';
import type { SavedSession } from '../modules/storage/session';
import type { RepRecord } from '../modules/storage/history';
import { saveSession, clearSession } from '../modules/storage/session';

export interface SessionControllerDeps {
  voice: VoiceService;
  beeps: BeepService;
  settings: Settings;
  wakeLock: WakeLockManager | null;
  /** Horloge virtuelle du moteur, en ms. Par défaut : Date.now(). */
  clock?: () => number;
  /** Rythme de pump du moteur, en ms (défaut 100). Tests avec horloge très accélérée uniquement. */
  tickMs?: number;
  /**
   * La voix doit-elle se taire ? (musique externe pendant que l'appli
   * est cachée : le TTS la couperait à chaque annonce ; les bips
   * mixables parlent à sa place, arbitrage du 24/11.)
   */
  isVoiceMuted?: () => boolean;
  onSnapshot?: (s: EngineSnapshot) => void;
  onFinish?: (realElapsedMs: number, virtualElapsedMs: number, reps: RepRecord[]) => void;
  onPaused?: () => void;
}

const SAVE_INTERVAL_MS = 1000;

/**
 * Écart d'horloge virtuelle entre deux pumps au-delà duquel on considère
 * que l'appli a été figée (gel total de l'onglet en arrière-plan sans
 * session audio, verrouillage brutal, etc.) : les annonces dues pendant
 * le gel sont caduques, on n'en rejoue que la plus récente (spec du
 * point 5, 20/11 : plus aucune annonce sautée, mais jamais de rafale).
 * Une séance vivante pompe toutes les ~100 ms (écart 0,1 s), même en
 * simulation ×10 (écart 1 s) : ce seuil ne l'attrape donc jamais.
 */
const FROZEN_PUMP_GAP_MS = 1500;

/**
 * Fenêtre de détection de rafale de « Passer » : deux skips à moins de 2 s
 * d'intervalle = l'utilisateur défile, pas d'annonce d'atterrissage (spec du
 * 22/11/2026). Un skip isolé garde son annonce (« Go ! », « Repos », « Round
 * X. Go ! »), feedback utile d'un vrai changement de phase.
 */
const SKIP_BURST_MS = 2000;

/**
 * Relie le moteur de timer, la file d'annonces pré-calculée, la voix, les
 * bips, la vibration, le wake lock et la persistance de séance.
 */
export class SessionController {
  private engine!: TimerEngine;
  private phases: Phase[] = [];
  private cues: Cue[] = [];
  private cueIndex = 0;
  /** Horloge du dernier « Passer » (détection de rafale). */
  private lastSkipClock: number | null = null;
  /** Temps virtuel déjà pompé (détection de gel : écart entre deux pumps). */
  private lastPumpedElapsedMs = 0;
  private config!: WorkoutConfig;
  private realElapsedMs = 0;
  private realAnchor = 0;
  private lastSave = 0;
  private finished = false;
  /** Reps saisies, clé "round:nom normalisé". */
  private reps = new Map<string, number>();

  constructor(private deps: SessionControllerDeps) {}

  start(config: WorkoutConfig): void {
    this.config = config;
    this.setup(config);
    this.realElapsedMs = 0;
    this.realAnchor = Date.now();
    this.reps.clear();
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
    this.lastPumpedElapsedMs = saved.elapsedMs;
    this.realElapsedMs = saved.realElapsedMs;
    this.reps.clear();
    for (const [k, v] of Object.entries(saved.reps ?? {})) this.reps.set(k, v);
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
    const now = this.deps.clock ? this.deps.clock() : Date.now();
    // Rafale = un autre skip il y a moins de SKIP_BURST_MS : on défile,
    // l'atterrissage n'annonce rien et la file vocale en cours est purgée.
    const burst = this.lastSkipClock !== null && now - this.lastSkipClock < SKIP_BURST_MS;
    this.lastSkipClock = now;
    const next = this.engine.snapshot.phaseIndex + 1;
    if (next < this.phases.length) {
      const target = this.engine.phaseOffsetMs(next);
      while (this.cueIndex < this.cues.length && this.cues[this.cueIndex].at < target - 1) {
        this.cueIndex++;
      }
      if (burst) {
        while (this.cueIndex < this.cues.length && this.cues[this.cueIndex].at <= target + 1) {
          this.cueIndex++; // avale aussi l'annonce d'entrée de la phase d'atterrissage
        }
        this.deps.voice.cancel();
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

  /** Saisie des reps d'un exercice pour le round en cours. */
  setReps(name: string, round: number, value: number): void {
    const v = Math.max(0, Math.min(999, Math.round(value)));
    if (!name || round < 1) return;
    this.reps.set(`${round}:${normalizeName(name)}`, v);
    this.persist();
  }

  /** Valeur saisie pour un exercice/round (0 si rien). */
  getReps(name: string, round: number): number {
    return this.reps.get(`${round}:${normalizeName(name)}`) ?? 0;
  }

  /** Les reps saisies, sous forme d'enregistrements exportables. */
  getRepRecords(): RepRecord[] {
    return [...this.reps.entries()]
      .map(([key, reps]) => {
        const sep = key.indexOf(':');
        return { exercise: key.slice(sep + 1), round: Number(key.slice(0, sep)), reps };
      })
      .map((r) => ({ ...r, exercise: this.displayName(r.exercise, r.round) ?? r.exercise }))
      .filter((r) => r.reps > 0)
      .sort((a, b) => a.round - b.round || a.exercise.localeCompare(b.exercise));
  }

  private displayName(normalized: string, round: number): string | null {
    const phase = this.phases.find(
      (p) => p.type === 'work' && p.round === round && normalizeName(p.exerciseName) === normalized,
    );
    return phase?.exerciseName ?? null;
  }

  get snapshot(): EngineSnapshot {
    return this.engine.snapshot;
  }

  /** Config de la séance en cours. */
  get workoutConfig(): WorkoutConfig {
    return this.config;
  }

  private setup(config: WorkoutConfig): void {
    this.phases = buildPhases(config);
    this.cues = buildCues(this.phases, this.deps.settings.lang, this.deps.settings.countdownSec, this.deps.settings.sayExerciseNames);
    this.cueIndex = 0;
    this.lastPumpedElapsedMs = 0;
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
          this.deps.onFinish?.(this.realElapsedMs, this.engine.snapshot.totalMs, this.getRepRecords());
        },
      },
      this.deps.clock,
      this.deps.tickMs,
    );
  }

  private pump(): void {
    this.pumpAt(this.engine.elapsed());
  }

  /**
   * Déclenche toutes les annonces dues, dans l'ordre (spec point 5 : une
   * annonce due N'est JAMAIS sautée). Cas particulier d'un gel total de
   * l'appli (écart entre deux pumps > FROZEN_PUMP_GAP_MS) : rejouer tout
   * l'arriéré d'un coup serait une rafale caduque ; on purge la file
   * vocale et on joue la plus récente, qui décrit l'état actuel de la
   * séance (« 1 », « Repos », « Round 2. Go ! »…). En marche normale,
   * chaque annonce part exactement à son instant.
   */
  private pumpAt(elapsedMs: number): void {
    const frozenGap = elapsedMs - this.lastPumpedElapsedMs;
    this.lastPumpedElapsedMs = elapsedMs;
    const due: Cue[] = [];
    while (this.cueIndex < this.cues.length && this.cues[this.cueIndex].at <= elapsedMs + 1) {
      due.push(this.cues[this.cueIndex]);
      this.cueIndex++;
    }
    if (due.length === 0) return;
    if (due.length > 1 && frozenGap > FROZEN_PUMP_GAP_MS) {
      this.deps.voice.cancel();
      this.fire(due[due.length - 1]);
      return;
    }
    for (const cue of due) this.fire(cue);
  }

  private fire(cue: Cue): void {
    const a = cue.action;
    // Voix muette (musique externe en arrière-plan) : le « say » saute,
    // les bips et vibrations passent toujours (mixables par-dessus).
    if (a.say && !this.deps.isVoiceMuted?.()) this.deps.voice.speak(a.say);
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
    const reps: Record<string, number> = {};
    for (const [k, v] of this.reps) reps[k] = v;
    saveSession({
      config: this.config,
      phaseIndex: s.phaseIndex,
      elapsedMs: s.elapsedMs,
      realElapsedMs: this.realElapsedMs + realExtra,
      reps,
      savedAt: Date.now(),
    });
  }

  private emit(): void {
    this.deps.onSnapshot?.(this.engine.snapshot);
  }
}
