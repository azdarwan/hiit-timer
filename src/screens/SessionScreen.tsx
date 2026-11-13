import { useState } from 'react';
import type { EngineSnapshot } from '../modules/timer/engine';
import type { WorkoutConfig } from '../types';
import { formatDuration } from '../modules/workout/plan';

interface Props {
  snapshot: EngineSnapshot;
  config: WorkoutConfig;
  pausedByBackground: boolean;
  onResume: () => void;
  onPause: () => void;
  onSkip: () => void;
  onExit: () => void;
  simSpeed: number;
}

function phaseLabel(snapshot: EngineSnapshot): string {
  const p = snapshot.phase;
  switch (p.type) {
    case 'prepare':
      return 'Préparation';
    case 'work':
      return `Exercice ${p.exercise}/${p.exercisesInRound}`;
    case 'rest':
      return 'Repos';
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

  return (
    <div className={`screen session ${phaseClass}`}>
      {props.simSpeed !== 1 && <div className="sim-badge">SIM ×{props.simSpeed}</div>}

      <div className="session-round">
        Round {snapshot.phase.round}/{props.config.rounds}
      </div>

      <div className="session-phase-label">{phaseLabel(snapshot)}</div>

      <div className="session-clock">{formatDuration(remainingSec)}</div>

      <div className="progress-track" role="progressbar" aria-valuenow={Math.round(snapshot.phaseProgress * 100)}>
        <div className="progress-fill" style={{ width: `${snapshot.phaseProgress * 100}%` }} />
      </div>

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

      {paused && (
        <div className="paused-hint">
          {props.pausedByBackground ? "Séance en pause — reprends où tu t'es arrêté." : 'En pause'}
        </div>
      )}

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
