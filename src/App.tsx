import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineSnapshot } from './modules/timer/engine';
import type { Settings, WorkoutConfig } from './types';
import { loadConfig, loadSettings, saveConfig, saveSettings } from './modules/storage/settings';
import { loadFavorites, saveFavorites, type Favorite } from './modules/storage/favorites';
import { loadSession, clearSession, type SavedSession } from './modules/storage/session';
import { addSession, syncSession, updateSessionReps, type RecordedSession, type RepRecord, type SyncResult } from './modules/storage/history';
import { buildPhases } from './modules/workout/plan';
import { estimateCalories } from './modules/workout/calories';
import { normalizeName } from './modules/workout/exercises';
import { TtsVoiceService } from './modules/voice/VoiceService';
import { BeepService } from './modules/audio/beeps';
import { BackgroundAudio } from './modules/audio/backgroundAudio';
import { WakeLockManager } from './modules/wakelock/wakelock';
import { strings } from './i18n';
import { SessionController } from './controller/SessionController';
import ConfigScreen from './screens/ConfigScreen';
import SessionScreen from './screens/SessionScreen';
import RepsEntryScreen from './screens/RepsEntryScreen';
import DoneScreen from './screens/DoneScreen';
import { missingRepsEntries } from './modules/workout/reps';

type Screen = 'config' | 'session' | 'repsEntry' | 'done';

function readSimSpeed(): number {
  try {
    const raw = new URLSearchParams(window.location.search).get('sim');
    const v = raw ? Number.parseFloat(raw) : NaN;
    return Number.isFinite(v) && v > 0 ? v : 1;
  } catch {
    return 1;
  }
}

/** Instantané des reps du contrôleur, pour affichage temps réel. */
function controllerReps(controller: SessionController): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of buildPhases(controller.workoutConfig)) {
    if (p.type !== 'work' || !p.countReps) continue;
    const v = controller.getReps(p.exerciseName, p.round);
    if (v > 0) out[`${p.round}:${normalizeName(p.exerciseName)}`] = v;
  }
  return out;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('config');
  const [config, setConfig] = useState<WorkoutConfig>(() => loadConfig());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [favorites, setFavorites] = useState<Favorite[]>(() => loadFavorites());
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ realMs: number; totalMs: number } | null>(null);
  const [doneSession, setDoneSession] = useState<RecordedSession | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [reps, setReps] = useState<Record<string, number>>({});
  const [, setVoicesTick] = useState(0);
  /**
   * Fin de séance en attente de saisie (demande du 23/11) : quand il
   * manque des reps (en général le dernier round, sans pause longue
   * derrière lui), l'écran de saisie au pavé numérique s'intercale AVANT
   * le récapitulatif. La séance y est enregistrée à la validation.
   */
  const [pendingEntry, setPendingEntry] = useState<{
    realMs: number;
    totalMs: number;
    config: WorkoutConfig;
    records: RepRecord[];
  } | null>(null);

  const controllerRef = useRef<SessionController | null>(null);
  const voiceRef = useRef(new TtsVoiceService());
  const beepsRef = useRef(new BeepService());
  const bgAudioRef = useRef(new BackgroundAudio());
  const wakeLockRef = useRef(new WakeLockManager());
  const simSpeed = useRef(readSimSpeed()).current;

  useEffect(() => {
    setSavedSession(loadSession());
  }, []);

  useEffect(() => {
    saveSettings(settings);
    beepsRef.current.setVolume(settings.beepVolume);
    voiceRef.current.setLang(settings.lang);
    voiceRef.current.setVoiceName(settings.voiceName);
    voiceRef.current.setEnabled(settings.voice);
    controllerRef.current?.updateSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  // Le timer ne se met JAMAIS en pause quand l'appli passe en arrière-plan
  // (backlog n°5) : le moteur est ancré sur des timestamps réels, il reste
  // exact. La session audio de lecture ne vit qu'en ARRIÈRE-PLAN
  // (BackgroundAudio, cf. backgroundAudio.ts) : au premier plan elle cède
  // toujours la place, revenir sur l'appli ne coupe jamais la musique de
  // l'utilisateur. Si l'OS fige quand même tout (gel total), l'arriéré
  // d'annonces est rattrapé au premier tick de retour en une seule
  // annonce d'état, pas une rafale (SessionController). On ré-acquiert
  // simplement le wake lock au retour sur l'appli.
  useEffect(() => {
    const onVisibility = () => {
      const visible = document.visibilityState === 'visible';
      if (visible) {
        wakeLockRef.current.reacquire();
        // Bug iOS du 24/11 : après un arrière-plan interrompu par une
        // autre source audio (Spotify…), la file TTS reste muette, pause
        // et play ne réveillent rien. On purge et relance la synthèse au
        // retour, la consolidation d'annonces (SessionController) dit
        // alors où on en est.
        if (controllerRef.current) voiceRef.current.rewarm();
      }
      bgAudioRef.current.onAppVisibility(visible);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Les voix TTS arrivent de façon asynchrone : on rafraîchit les réglages.
  useEffect(() => {
    const upd = () => setVoicesTick((t) => t + 1);
    voiceRef.current.onVoicesChanged(upd);
    return () => voiceRef.current.offVoicesChanged(upd);
  }, []);

  const createController = useCallback(
    (onFinish: (realMs: number, totalMs: number, repRecords: RepRecord[]) => void) => {
      return new SessionController({
        voice: voiceRef.current,
        beeps: beepsRef.current,
        settings,
        wakeLock: wakeLockRef.current,
        clock: simSpeed !== 1 ? makeSimClock(simSpeed) : undefined,
        // Musique externe + appli cachée : voix muette, bips mixables à la
        // place (arbitrage du 24/11, cf. backgroundAudio.ts).
        isVoiceMuted: () => bgAudioRef.current.isVoiceMuted(),
        onSnapshot: (s) => {
          setSnapshot(s);
          const controller = controllerRef.current;
          if (controller) setReps(controllerReps(controller));
        },
        onFinish,
      });
    },
    [settings, simSpeed],
  );

  const initAudio = useCallback(() => {
    beepsRef.current.init();
    beepsRef.current.setVolume(settings.beepVolume);
    voiceRef.current.init();
    voiceRef.current.setLang(settings.lang);
    voiceRef.current.setVoiceName(settings.voiceName);
    voiceRef.current.setEnabled(settings.voice);
    // Session audio « playback » : garde l'appli vivante en arrière-plan
    // (doit partir d'un geste utilisateur, cf. backgroundAudio.ts). Si une
    // musique externe prend le relais, elle gagne : bips seuls alors.
    bgAudioRef.current.start(strings(settings.lang).session.inProgressTitle);
  }, [settings]);

  const recordSession = useCallback(
    (realMs: number, totalMs: number, repRecords: RepRecord[]) => {
      const controllerCfg = controllerRef.current?.workoutConfig;
      controllerRef.current = null;
      const cfg = controllerCfg ?? config;
      const recorded = addSession({
        realMs,
        totalMs,
        config: cfg,
        reps: repRecords,
        kcal: estimateCalories(cfg, settings.weightKg),
      });
      setDoneSession(recorded);
      setSyncResult(null);
      if (settings.syncUrl) {
        void syncSession(settings.syncUrl, settings.syncToken, recorded).then(setSyncResult);
      }
    },
    [config, settings.syncUrl, settings.syncToken, settings.weightKg],
  );

  /**
   * Fin de séance (redesign du 23/11) : si des reps manquent (en général
   * le dernier round, pas de pause longue derrière lui), l'écran de
   * saisie au pavé numérique s'intercale AVANT le récapitulatif, avec les
   * records de la séance ; la séance est enregistrée à sa validation.
   * Sinon (rien ne manque), récap direct comme avant.
   */
  const finishFlow = useCallback(
    (realMs: number, totalMs: number, repRecords: RepRecord[]) => {
      bgAudioRef.current.stop();
      const cfg = controllerRef.current?.workoutConfig ?? config;
      if (missingRepsEntries(cfg, repRecords).length === 0) {
        recordSession(realMs, totalMs, repRecords);
        setDoneInfo({ realMs, totalMs });
        setScreen('done');
        return;
      }
      setPendingEntry({ realMs, totalMs, config: cfg, records: repRecords });
      setSnapshot(null);
      setScreen('repsEntry');
    },
    [config, recordSession],
  );

  const startSession = useCallback(() => {
    initAudio();
    const controller = createController((realMs, totalMs, repRecords) => {
      finishFlow(realMs, totalMs, repRecords);
    });
    controllerRef.current = controller;
    controller.start(config);
    setSnapshot(null);
    setReps({});
    setScreen('session');
  }, [config, createController, initAudio, finishFlow]);

  const resumeSavedSession = useCallback(() => {
    const saved = savedSession;
    if (!saved) return;
    initAudio();
    const controller = createController((realMs, totalMs, repRecords) => {
      finishFlow(realMs, totalMs, repRecords);
    });
    controllerRef.current = controller;
    controller.restore(saved);
    setSavedSession(null);
    setScreen('session');
  }, [savedSession, createController, initAudio, finishFlow]);

  const discardSavedSession = useCallback(() => {
    clearSession();
    setSavedSession(null);
  }, []);

  const exitSession = useCallback(() => {
    controllerRef.current?.terminate();
    controllerRef.current = null;
    bgAudioRef.current.stop();
    setSnapshot(null);
    setSavedSession(null);
    setPendingEntry(null);
    setScreen('config');
  }, []);

  const retrySync = useCallback(async () => {
    if (!doneSession) return;
    const res = await syncSession(settings.syncUrl, settings.syncToken, doneSession);
    setSyncResult(res);
  }, [doneSession, settings.syncUrl, settings.syncToken]);

  /**
   * Retouche des reps sur l'écran de fin (spec du 21/11, récap éditable,
   * tous rounds) : met à jour la séance en mémoire ET dans l'historique
   * local. Une valeur à 0 retire la ligne (non saisi ≠ zéro). La synchro
   * précédente devient obsolète.
   */
  const setDoneReps = useCallback((name: string, round: number, value: number) => {
    setDoneSession((prev) => {
      if (!prev) return prev;
      const v = Math.max(0, Math.min(999, Math.round(value)));
      const norm = normalizeName(name);
      const others = prev.reps.filter((r) => !(r.round === round && normalizeName(r.exercise) === norm));
      const reps = v > 0
        ? [...others, { exercise: name, round, reps: v }].sort((a, b) => a.round - b.round || a.exercise.localeCompare(b.exercise))
        : others;
      updateSessionReps(prev.id, reps);
      return { ...prev, reps };
    });
    setSyncResult(null);
  }, []);

  if (screen === 'session' && snapshot) {
    return (
      <SessionScreen
        snapshot={snapshot}
        config={config}
        lang={settings.lang}
        reps={reps}
        onSetReps={(name, round, value) => {
          const controller = controllerRef.current;
          if (!controller) return;
          controller.setReps(name, round, value);
          setReps(controllerReps(controller));
        }}
        onResume={() => controllerRef.current?.resume()}
        onPause={() => controllerRef.current?.pause()}
        onSkip={() => controllerRef.current?.skip()}
        onExit={exitSession}
        simSpeed={simSpeed}
      />
    );
  }

  if (screen === 'repsEntry' && pendingEntry) {
    return (
      <RepsEntryScreen
        lang={settings.lang}
        config={pendingEntry.config}
        records={pendingEntry.records}
        onComplete={(merged) => {
          recordSession(pendingEntry.realMs, pendingEntry.totalMs, merged);
          setDoneInfo({ realMs: pendingEntry.realMs, totalMs: pendingEntry.totalMs });
          setPendingEntry(null);
          setScreen('done');
        }}
      />
    );
  }

  if (screen === 'done' && doneInfo) {
    return (
      <DoneScreen
        realMs={doneInfo.realMs}
        totalMs={doneInfo.totalMs}
        lang={settings.lang}
        session={doneSession}
        syncResult={syncResult}
        syncConfigured={Boolean(settings.syncUrl)}
        onRetrySync={retrySync}
        onSetReps={setDoneReps}
        onBack={exitSession}
      />
    );
  }

  return (
    <ConfigScreen
      config={config}
      onConfigChange={setConfig}
      settings={settings}
      onSettingsChange={setSettings}
      voices={voiceRef.current.listVoices(settings.lang)}
      favorites={favorites}
      onFavoritesChange={setFavorites}
      onStart={startSession}
      savedSession={savedSession}
      onResumeSaved={resumeSavedSession}
      onDiscardSaved={discardSavedSession}
    />
  );
}

function makeSimClock(speed: number): () => number {
  const t0 = Date.now();
  return () => (Date.now() - t0) * speed;
}
