import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineSnapshot } from './modules/timer/engine';
import type { Settings, WorkoutConfig } from './types';
import { loadConfig, loadSettings, saveConfig, saveSettings } from './modules/storage/settings';
import { loadFavorites, saveFavorites, type Favorite } from './modules/storage/favorites';
import { loadSession, clearSession, type SavedSession } from './modules/storage/session';
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

export default function App() {
  const [screen, setScreen] = useState<Screen>('config');
  const [config, setConfig] = useState<WorkoutConfig>(() => loadConfig());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [favorites, setFavorites] = useState<Favorite[]>(() => loadFavorites());
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ realMs: number; totalMs: number } | null>(null);
  const [pausedByBackground, setPausedByBackground] = useState(false);

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
    voiceRef.current.setEnabled(settings.voice);
    controllerRef.current?.updateSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  useEffect(() => {
    const onVisibility = () => {
      const controller = controllerRef.current;
      if (!controller) return;
      if (document.visibilityState === 'hidden') {
        if (controller.snapshot.running) {
          controller.pause();
          setPausedByBackground(true);
        }
      } else {
        wakeLockRef.current.reacquire();
      }
    };
    const onPageHide = () => {
      const controller = controllerRef.current;
      if (controller && controller.snapshot.running) controller.pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  const createController = useCallback(
    (onFinish: (realMs: number, totalMs: number) => void) => {
      const deps = {
        voice: voiceRef.current,
        beeps: beepsRef.current,
        settings,
        wakeLock: wakeLockRef.current,
        clock: simSpeed !== 1 ? makeSimClock(simSpeed) : undefined,
        onSnapshot: setSnapshot,
        onFinish,
      };
      return new SessionController(deps);
    },
    [settings, simSpeed],
  );

  const initAudio = useCallback(() => {
    beepsRef.current.init();
    beepsRef.current.setVolume(settings.beepVolume);
    voiceRef.current.init();
    voiceRef.current.setLang(settings.lang);
    voiceRef.current.setEnabled(settings.voice);
  }, [settings]);

  const startSession = useCallback(() => {
    initAudio();
    const controller = createController((realMs, totalMs) => {
      setDoneInfo({ realMs, totalMs });
      controllerRef.current = null;
      setScreen('done');
    });
    controllerRef.current = controller;
    controller.start(config);
    setScreen('session');
  }, [config, createController, initAudio]);

  const resumeSavedSession = useCallback(() => {
    const saved = savedSession;
    if (!saved) return;
    initAudio();
    const controller = createController((realMs, totalMs) => {
      setDoneInfo({ realMs, totalMs });
      controllerRef.current = null;
      setScreen('done');
    });
    controllerRef.current = controller;
    controller.restore(saved);
    setSavedSession(null);
    setScreen('session');
  }, [savedSession, createController, initAudio]);

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

  if (screen === 'session' && snapshot) {
    return (
      <SessionScreen
        snapshot={snapshot}
        config={config}
        pausedByBackground={pausedByBackground}
        onResume={() => {
          setPausedByBackground(false);
          controllerRef.current?.resume();
        }}
        onPause={() => controllerRef.current?.pause()}
        onSkip={() => controllerRef.current?.skip()}
        onExit={exitSession}
        simSpeed={simSpeed}
      />
    );
  }

  if (screen === 'done' && doneInfo) {
    return <DoneScreen realMs={doneInfo.realMs} totalMs={doneInfo.totalMs} onBack={exitSession} />;
  }

  return (
    <ConfigScreen
      config={config}
      onConfigChange={setConfig}
      settings={settings}
      onSettingsChange={setSettings}
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
