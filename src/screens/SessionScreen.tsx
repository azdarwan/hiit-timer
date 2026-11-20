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

function phaseLabel(snapshot: EngineSnapshot): string {
  const p = snapshot.phase;
  switch (p.type) {
    case 'prepare':
      return 'Préparation';
    case 'work':
      return p.exerciseName || `Exercice ${p.exercise}/${p.exercisesInRound}`;
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

  // Saisie des reps à la pause (backlog n°1) : seulement pendant le repos qui
  // suit un exercice marqué "reps". Le repos long couvre le dernier exercice
  // du round. La saisie disparaît à la fin de la pause, sans bloquer le timer.
  const defs = exercisesFor(props.config);
  const p = snapshot.phase;
  let repTarget: { name: string; round: number } | null = null;
  if (!paused && (p.type === 'rest' || p.type === 'longRest')) {
    const index = p.type === 'rest' ? p.exercise : p.exercisesInRound;
    const def = defs[index - 1];
    if (def?.countReps) {
      // Le repos long est rattaché au round qui ARRIVE (plan.ts) :
      // l'exercice saisissable est le dernier du round précédent.
      repTarget = { name: def.name, round: p.type === 'rest' ? p.round : p.round - 1 };
    }
  }
  const repValue = repTarget ? props.reps[`${repTarget.round}:${normalizeName(repTarget.name)}`] ?? 0 : 0;

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

      {repTarget && (
        <div className="reps-input" data-testid="reps-input">
          <div className="reps-label">
            {repTarget.name} <span className="reps-round">(R{repTarget.round})</span>
          </div>
          <div className="reps-row">
            <button
              className="reps-btn"
              aria-label={`Moins de ${repTarget.name}`}
              onClick={() => props.onSetReps(repTarget!.name, repTarget!.round, Math.max(0, repValue - 1))}
            >
              −
            </button>
            <div className="reps-value">{repValue || ''}</div>
            <button
              className="reps-btn"
              aria-label={`Plus de ${repTarget.name}`}
              onClick={() => props.onSetReps(repTarget!.name, repTarget!.round, repValue + 1)}
            >
              +
            </button>
          </div>
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
