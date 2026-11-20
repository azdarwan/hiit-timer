import { useState } from 'react';
import type { EngineSnapshot } from '../modules/timer/engine';
import type { WorkoutConfig } from '../types';
import { exercisesFor, normalizeName } from '../modules/workout/exercises';
import { formatDuration } from '../modules/workout/plan';

interface Props {
  snapshot: EngineSnapshot;
  config: WorkoutConfig;
  /** Reps saisies, clé "round:nom normalisé" */
  reps: Record<string, number>;
  onSetReps: (name: string, round: number, value: number) => void;
  onResume: () => void;
  onPause: () => void;
  onSkip: () => void;
  onExit: () => void;
  simSpeed: number;
}

function phaseLabel(snapshot: EngineSnapshot, defs: { name: string }[]): string {
  const p = snapshot.phase;
  switch (p.type) {
    case 'prepare':
      return 'Préparation';
    case 'work':
      // Numéro + nom de l'exercice en cours, bien visibles (spec 21/11).
      return p.exerciseName
        ? `Exercice ${p.exercise}/${p.exercisesInRound} · ${p.exerciseName}`
        : `Exercice ${p.exercise}/${p.exercisesInRound}`;
    case 'rest':
      // Nom de l'exercice qui arrive (spec 21/11) : un repos n'existe
      // qu'entre deux exercices, le suivant est defs[p.exercise] (0-based).
      return p.exercise < defs.length ? `Repos · à suivre : ${defs[p.exercise].name}` : 'Repos';
    case 'longRest':
      return 'Repos long';
    case 'done':
      return 'Terminé';
  }
}

export default function SessionScreen(props: Props) {
  const { snapshot } = props;
  const [confirmExit, setConfirmExit] = useState(false);
  const paused = !snapshot.running && !snapshot.finished;
  const remainingSec = Math.ceil(snapshot.remainingMs / 1000);
  const phaseClass = `phase-${snapshot.phase.type}`;

  // Saisie des reps à la fin de chaque round (spec du 21/11/2026) : pendant
  // chaque pause longue, une fiche liste tous les exercices "reps" du round
  // qui vient de finir. Elle reste affichée pendant toute la pause, ne
  // bloque pas le timer, et disparaît au round suivant avec ce qui a été
  // rempli. Les éventuelles manquantes du dernier round (pas de pause longue
  // après lui) se complètent sur l'écran de fin.
  const defs = exercisesFor(props.config);
  const p = snapshot.phase;
  const finishedRound = !paused && p.type === 'longRest' ? p.round - 1 : 0;
  const repDefs = finishedRound > 0 ? defs.filter((d) => d.countReps) : [];

  return (
    <div className={`screen session ${phaseClass}`}>
      {props.simSpeed !== 1 && <div className="sim-badge">SIM ×{props.simSpeed}</div>}

      <div className="session-round">
        Round {snapshot.phase.round}/{props.config.rounds}
      </div>

      <div className="session-phase-label">{phaseLabel(snapshot, defs)}</div>

      <div className="session-clock">{formatDuration(remainingSec)}</div>

      <div className="progress-track" role="progressbar" aria-valuenow={Math.round(snapshot.phaseProgress * 100)}>
        <div className="progress-fill" style={{ width: `${snapshot.phaseProgress * 100}%` }} />
      </div>

      {finishedRound > 0 && repDefs.length > 0 && (
        <div className="reps-input" data-testid="reps-input">
          <div className="reps-title">Reps du round {finishedRound}</div>
          <ul className="reps-list">
            {repDefs.map((def) => {
              const value = props.reps[`${finishedRound}:${normalizeName(def.name)}`] ?? 0;
              return (
                <li className="reps-item" key={def.name}>
                  <span className="reps-label">
                    {def.name} <span className="reps-round">(R{finishedRound})</span>
                  </span>
                  <div className="reps-row">
                    <button
                      className="reps-btn"
                      aria-label={`Moins de ${def.name}`}
                      onClick={() => props.onSetReps(def.name, finishedRound, Math.max(0, value - 1))}
                    >
                      −
                    </button>
                    <div className="reps-value">{value || ''}</div>
                    <button
                      className="reps-btn"
                      aria-label={`Plus de ${def.name}`}
                      onClick={() => props.onSetReps(def.name, finishedRound, value + 1)}
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="session-total">
        Restant&nbsp;: {formatDuration(Math.ceil(snapshot.totalRemainingMs / 1000))}
      </div>

      <div className="session-controls">
        {paused ? (
          <button className="btn primary big" onClick={props.onResume}>Reprendre</button>
        ) : (
          <button className="btn primary big" onClick={props.onPause}>Pause</button>
        )}
        <div className="controls-row">
          <button className="btn ghost big" onClick={props.onSkip}>Passer</button>
          <button className="btn danger big" onClick={() => setConfirmExit(true)}>Terminer</button>
        </div>
      </div>

      {paused && <div className="paused-hint">En pause</div>}

      {confirmExit && (
        <div className="overlay">
          <div className="overlay-card">
            <p>Terminer la séance maintenant&nbsp;?</p>
            <div className="overlay-actions">
              <button className="btn danger" onClick={props.onExit}>Terminer</button>
              <button className="btn ghost" onClick={() => setConfirmExit(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
