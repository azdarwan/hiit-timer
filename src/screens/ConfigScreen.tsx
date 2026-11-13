import type { Settings, WorkoutConfig } from '../types';
import { CONFIG_LIMITS } from '../types';
import { formatDuration, totalDuration } from '../modules/workout/plan';
import type { Favorite } from '../modules/storage/favorites';
import type { SavedSession } from '../modules/storage/session';

interface Props {
  config: WorkoutConfig;
  onConfigChange: (c: WorkoutConfig) => void;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
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
  const { config, onConfigChange, settings, onSettingsChange, favorites } = props;
  const total = totalDuration(config);

  const setField = (key: keyof WorkoutConfig, value: number) => {
    const { min } = CONFIG_LIMITS[key];
    if (!Number.isFinite(value) || value < min) value = min;
    onConfigChange({ ...config, [key]: value });
  };

  const saveFavorite = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = favorites.filter((f) => f.name !== trimmed);
    next.push({ name: trimmed, config });
    props.onFavoritesChange(next);
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
          const { min, step } = CONFIG_LIMITS[f.key];
          const value = config[f.key];
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
        <label className="setting-row">
          <span>Annonces vocales</span>
          <input
            type="checkbox"
            checked={settings.voice}
            onChange={(e) => onSettingsChange({ ...settings, voice: e.target.checked })}
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
    </div>
  );
}
