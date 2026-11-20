import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineSnapshot } from './modules/timer/engine';
import type { Settings, WorkoutConfig } from './types';
import { loadConfig, loadSettings, saveConfig, saveSettings } from './modules/storage/settings';
import { loadFavorites, saveFavorites, type Favorite } from './modules/storage/favorites';
import { loadSession, clearSession, type SavedSession } from './modules/storage/session';
import { addSession, syncSession, type RecordedSession, type RepRecord, type SyncResult } from './modules/storage/history';
import { buildPhases } from './modules/workout/plan';
import { normalizeName } from './modules/workout/exercises';
import { TtsVoiceService } from './modules/voice/VoiceService';
import { BeepService } from './modules/audio/beeps';
import { WakeLockManager } from './modules/wakelock/wakelock';
import { SessionController } from './controller/SessionController';
import ConfigScreen from './screens/ConfigScreen';
import SessionScreen from './screens/SessionScreen';
import DoneScreen from './screens/DoneScreen';

type Screen = 'config' | 'session' | 'done';

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

  const controllerRef = useRef<SessionController | null>(null);
  const voiceRef = useRef(new TtsVoiceService());
  const beepsRef = useRef(new BeepService());
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
  // exact ; les annonces manquées sont sautées au retour (SessionController).
  // On ré-acquiert simplement le wake lock au retour sur l'appli.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        wakeLockRef.current.reacquire();
      }
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
  }, [settings]);

  const recordSession = useCallback(
    (realMs: number, totalMs: number, repRecords: RepRecord[]) => {
      const controllerCfg = controllerRef.current?.workoutConfig;
      controllerRef.current = null;
      const recorded = addSession({ realMs, totalMs, config: controllerCfg ?? config, reps: repRecords });
      setDoneSession(recorded);
      setSyncResult(null);
      if (settings.syncUrl) {
        void syncSession(settings.syncUrl, settings.syncToken, recorded).then(setSyncResult);
      }
    },
    [config, settings.syncUrl, settings.syncToken],
  );

  const startSession = useCallback(() => {
    initAudio();
    const controller = createController((realMs, totalMs, repRecords) => {
      recordSession(realMs, totalMs, repRecords);
      setDoneInfo({ realMs, totalMs });
      setScreen('done');
    });
    controllerRef.current = controller;
    controller.start(config);
    setSnapshot(null);
    setReps({});
    setScreen('session');
  }, [config, createController, initAudio, recordSession]);

  const resumeSavedSession = useCallback(() => {
    const saved = savedSession;
    if (!saved) return;
    initAudio();
    const controller = createController((realMs, totalMs, repRecords) => {
      recordSession(realMs, totalMs, repRecords);
      setDoneInfo({ realMs, totalMs });
      setScreen('done');
    });
    controllerRef.current = controller;
    controller.restore(saved);
    setSavedSession(null);
    setScreen('session');
  }, [savedSession, createController, initAudio, recordSession]);

  const discardSavedSession = useCallback(() => {
    clearSession();
    setSavedSession(null);
  }, []);

  const exitSession = useCallback(() => {
    controllerRef.current?.terminate();
    controllerRef.current = null;
    setSnapshot(null);
    setSavedSession(null);
    setScreen('config');
  }, []);

  const retrySync = useCallback(async () => {
    if (!doneSession) return;
    const res = await syncSession(settings.syncUrl, settings.syncToken, doneSession);
    setSyncResult(res);
  }, [doneSession, settings.syncUrl, settings.syncToken]);

  if (screen === 'session' && snapshot) {
    return (
      <SessionScreen
        snapshot={snapshot}
        config={config}
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

  if (screen === 'done' && doneInfo) {
    return (
      <DoneScreen
        realMs={doneInfo.realMs}
        totalMs={doneInfo.totalMs}
        session={doneSession}
        syncResult={syncResult}
        syncConfigured={Boolean(settings.syncUrl)}
        onRetrySync={retrySync}
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
