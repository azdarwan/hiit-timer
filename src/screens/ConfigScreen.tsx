import type { Settings, WorkoutConfig } from '../types';
import { CONFIG_LIMITS, COUNTDOWN_LIMITS, WEIGHT_LIMITS } from '../types';
import { formatDuration, totalDuration } from '../modules/workout/plan';
import { exercisesFor } from '../modules/workout/exercises';
import type { Favorite } from '../modules/storage/favorites';
import type { SavedSession } from '../modules/storage/session';
import { listSessions, clearHistory, toCSV, downloadCSV } from '../modules/storage/history';
import type { VoiceOption } from '../modules/voice/VoiceService';
import { useState } from 'react';

interface Props {
  config: WorkoutConfig;
  onConfigChange: (c: WorkoutConfig) => void;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  voices: VoiceOption[];
  favorites: Favorite[];
  onFavoritesChange: (f: Favorite[]) => void;
  onStart: () => void;
  savedSession: SavedSession | null;
  onResumeSaved: () => void;
  onDiscardSaved: () => void;
}

const FIELDS: { key: keyof WorkoutConfig; label: string; unit: string }[] = [
  { key: 'work', label: 'Travail', unit: 's' },
  { key: 'rest', label: 'Repos', unit: 's' },
  { key: 'exercises', label: 'Exercices', unit: '' },
  { key: 'rounds', label: 'Rounds', unit: '' },
  { key: 'longRest', label: 'Repos long', unit: 's' },
  { key: 'prepare', label: 'Préparation', unit: 's' },
];

export default function ConfigScreen(props: Props) {
  const { config, onConfigChange, settings, onSettingsChange, favorites, voices } = props;
  const [historyCount, setHistoryCount] = useState(() => listSessions().length);
  const total = totalDuration(config);
  const defs = exercisesFor(config);

  const setField = (key: keyof WorkoutConfig, value: number) => {
    const { min } = CONFIG_LIMITS[key as keyof typeof CONFIG_LIMITS];
    if (!Number.isFinite(value) || value < min) value = min;
    onConfigChange({ ...config, [key]: value });
  };

  /** Met à jour la définition d'un exercice (nom ou comptage de reps). */
  const setExercise = (index: number, patch: Partial<{ name: string; countReps: boolean }>) => {
    const next = defs.map((d, i) => (i === index ? { ...d, ...patch } : { ...d }));
    onConfigChange({ ...config, exerciseDefs: next });
  };

  const setCountdown = (value: number) => {
    if (!Number.isFinite(value)) value = COUNTDOWN_LIMITS.min;
    onSettingsChange({
      ...settings,
      countdownSec: Math.min(COUNTDOWN_LIMITS.max, Math.max(COUNTDOWN_LIMITS.min, value)),
    });
  };

  /** Poids utilisateur (kg) : unique donnée nécessaire aux calories (MET). */
  const setWeight = (value: number) => {
    if (!Number.isFinite(value)) value = WEIGHT_LIMITS.min;
    onSettingsChange({
      ...settings,
      weightKg: Math.min(WEIGHT_LIMITS.max, Math.max(WEIGHT_LIMITS.min, value)),
    });
  };

  const saveFavorite = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = favorites.filter((f) => f.name !== trimmed);
    next.push({ name: trimmed, config });
    props.onFavoritesChange(next);
  };

  const exportHistory = () => {
    const sessions = listSessions();
    if (sessions.length === 0) return;
    downloadCSV(toCSV(sessions), 'hiit-historique.csv');
  };

  const wipeHistory = () => {
    if (window.confirm('Effacer tout l\'historique des séances enregistrées ?')) {
      clearHistory();
      setHistoryCount(0);
    }
  };

  return (
    <div className="screen config">
      {props.savedSession && (
        <div className="resume-banner">
          <div className="resume-text">Séance en cours (pause)</div>
          <div className="resume-actions">
            <button className="btn primary" onClick={props.onResumeSaved}>Reprendre</button>
            <button className="btn ghost" onClick={props.onDiscardSaved}>Ignorer</button>
          </div>
        </div>
      )}

      <div className="total-duration">
        <div className="total-label">Durée totale</div>
        <div className="total-value">{formatDuration(total)}</div>
      </div>

      <div className="fields">
        {FIELDS.map((f) => {
          const { min, step } = CONFIG_LIMITS[f.key as keyof typeof CONFIG_LIMITS];
          const value = config[f.key] as number;
          return (
            <div className="stepper" key={f.key}>
              <div className="stepper-label">
                {f.label}
                {f.unit && <span className="stepper-unit"> ({f.unit})</span>}
              </div>
              <div className="stepper-row">
                <button className="step-btn" onClick={() => setField(f.key, value - step)} aria-label={`Moins ${f.label}`}>
                  −
                </button>
                <input
                  className="step-input"
                  type="number"
                  inputMode="numeric"
                  min={min}
                  value={value}
                  onChange={(e) => setField(f.key, Number(e.target.value))}
                />
                <button className="step-btn" onClick={() => setField(f.key, value + step)} aria-label={`Plus ${f.label}`}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button className="btn primary start-btn" onClick={props.onStart}>
        Start
      </button>

      <section className="section">
        <h2>Exercices &amp; reps</h2>
        <p className="section-hint">
          Le comptage est demandé pendant la pause longue, à la fin de chaque
          round ; l'écran de fin montre le récapitulatif complet de la séance,
          corrigible avant validation. Les données suivent le nom : si tu
          changes d'exercice dans le cycle, l'historique reste comparable.
        </p>
        <ul className="exercise-list">
          {defs.map((def, i) => (
            <li className="exercise-row" key={i}>
              <span className="exercise-index">{i + 1}</span>
              <input
                className="exercise-name"
                type="text"
                value={def.name}
                maxLength={30}
                aria-label={`Nom de l'exercice ${i + 1}`}
                onChange={(e) => setExercise(i, { name: e.target.value })}
              />
              <label className="exercise-reps">
                <input
                  type="checkbox"
                  checked={def.countReps}
                  aria-label={`Compter les reps : ${def.name}`}
                  onChange={(e) => setExercise(i, { countReps: e.target.checked })}
                />
                reps
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>Favoris</h2>
        <form
          className="fav-form"
          onSubmit={(e) => {
            e.preventDefault();
            const input = (e.currentTarget.elements.namedItem('favName') as HTMLInputElement) ?? null;
            if (input) {
              saveFavorite(input.value);
              input.value = '';
            }
          }}
        >
          <input className="fav-input" name="favName" placeholder="Nom de la séance" maxLength={40} />
          <button className="btn ghost" type="submit">Sauver</button>
        </form>
        <ul className="fav-list">
          {favorites.map((f) => (
            <li className="fav-item" key={f.name}>
              <button className="fav-load" onClick={() => onConfigChange(f.config)}>
                <span className="fav-name">{f.name}</span>
                <span className="fav-detail">
                  {formatDuration(totalDuration(f.config))} · {f.config.exercises}×{f.config.rounds} · {f.config.work}/{f.config.rest}
                </span>
              </button>
              <button
                className="fav-delete"
                aria-label={`Supprimer ${f.name}`}
                onClick={() => {
                  if (window.confirm(`Supprimer le favori « ${f.name} » ?`)) {
                    props.onFavoritesChange(favorites.filter((x) => x.name !== f.name));
                  }
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>Réglages</h2>
        <label className="setting-row">
          <span>Langue de la voix</span>
          <select
            value={settings.lang}
            onChange={(e) => onSettingsChange({ ...settings, lang: e.target.value as Settings['lang'] })}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>
        {voices.length > 0 && (
          <label className="setting-row">
            <span>Voix</span>
            <select
              value={settings.voiceName ?? ''}
              onChange={(e) => onSettingsChange({ ...settings, voiceName: e.target.value || null })}
            >
              <option value="">Choix automatique</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="setting-row">
          <span>Annonces vocales</span>
          <input
            type="checkbox"
            checked={settings.voice}
            onChange={(e) => onSettingsChange({ ...settings, voice: e.target.checked })}
          />
        </label>
        <label className="setting-row">
          <span>Nom des exercices à voix haute</span>
          <input
            type="checkbox"
            checked={settings.sayExerciseNames}
            onChange={(e) => onSettingsChange({ ...settings, sayExerciseNames: e.target.checked })}
          />
        </label>
        <label className="setting-row">
          <span>Volume des bips</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.beepVolume}
            onChange={(e) => onSettingsChange({ ...settings, beepVolume: Number(e.target.value) })}
          />
        </label>
        <div className="setting-row">
          <span>Décompte de fin de pause</span>
          <div className="stepper-row setting-stepper">
            <button className="step-btn" onClick={() => setCountdown(settings.countdownSec - COUNTDOWN_LIMITS.step)} aria-label="Moins de décompte">
              −
            </button>
            <input
              className="step-input"
              type="number"
              inputMode="numeric"
              min={COUNTDOWN_LIMITS.min}
              max={COUNTDOWN_LIMITS.max}
              value={settings.countdownSec}
              onChange={(e) => setCountdown(Number(e.target.value))}
            />
            <button className="step-btn" onClick={() => setCountdown(settings.countdownSec + COUNTDOWN_LIMITS.step)} aria-label="Plus de décompte">
              +
            </button>
          </div>
        </div>
        <p className="section-hint">
          Fin de pause longue en jalons : le nombre réglé, puis 10 s et 5 s
          (si inférieurs), puis 3, 2, 1.
        </p>
        <div className="setting-row">
          <span>Poids (kg)</span>
          <div className="stepper-row setting-stepper">
            <button className="step-btn" onClick={() => setWeight(settings.weightKg - WEIGHT_LIMITS.step)} aria-label="Moins de poids">
              −
            </button>
            <input
              className="step-input"
              type="number"
              inputMode="numeric"
              min={WEIGHT_LIMITS.min}
              max={WEIGHT_LIMITS.max}
              value={settings.weightKg}
              onChange={(e) => setWeight(Number(e.target.value))}
            />
            <button className="step-btn" onClick={() => setWeight(settings.weightKg + WEIGHT_LIMITS.step)} aria-label="Plus de poids">
              +
            </button>
          </div>
        </div>
        <p className="section-hint">
          Sert uniquement à l'estimation des calories en fin de séance (méthode
          MET, précision de l'ordre de ±25-40 % sans fréquence cardiaque).
        </p>
        <label className="setting-row">
          <span>Garder l'écran allumé</span>
          <input
            type="checkbox"
            checked={settings.keepAwake}
            onChange={(e) => onSettingsChange({ ...settings, keepAwake: e.target.checked })}
          />
        </label>
        <label className="setting-row">
          <span>Vibration</span>
          <input
            type="checkbox"
            checked={settings.vibrate}
            onChange={(e) => onSettingsChange({ ...settings, vibrate: e.target.checked })}
          />
        </label>
      </section>

      <section className="section">
        <h2>Historique</h2>
        <p className="section-hint">
          {historyCount > 0
            ? `${historyCount} séance${historyCount > 1 ? 's' : ''} enregistrée${historyCount > 1 ? 's' : ''} sur cet appareil.`
            : 'Aucune séance enregistrée pour l\'instant.'}
        </p>
        <div className="history-actions">
          <button className="btn ghost" onClick={exportHistory} disabled={historyCount === 0}>
            Exporter CSV
          </button>
          <button className="btn ghost" onClick={wipeHistory} disabled={historyCount === 0}>
            Vider
          </button>
        </div>
      </section>

      <section className="section">
        <h2>Synchro serveur (optionnel)</h2>
        <p className="section-hint">
          Stocke chaque séance sur ton serveur (cf. dossier <code>server/</code> du dépôt, hébergement OVH).
        </p>
        <label className="setting-row">
          <span>URL du serveur</span>
          <input
            type="url"
            className="sync-input"
            placeholder="https://ton-domaine.tld/hiit/api.php"
            value={settings.syncUrl}
            onChange={(e) => onSettingsChange({ ...settings, syncUrl: e.target.value.trim() })}
          />
        </label>
        <label className="setting-row">
          <span>Jeton</span>
          <input
            type="text"
            className="sync-input"
            placeholder="Jeton secret"
            value={settings.syncToken}
            onChange={(e) => onSettingsChange({ ...settings, syncToken: e.target.value.trim() })}
          />
        </label>
      </section>
    </div>
  );
}
