import { useEffect, useState } from 'react';
import type { EngineSnapshot } from '../modules/timer/engine';
import type { WorkoutConfig, Lang } from '../types';
import { exercisesFor, normalizeName } from '../modules/workout/exercises';
import { formatDuration } from '../modules/workout/plan';
import { strings } from '../i18n';
import type { Strings } from '../i18n';
import RepsKeypad from './RepsKeypad';

interface Props {
  snapshot: EngineSnapshot;
  config: WorkoutConfig;
  /** Langue des libellés et annonces (réglage unique). */
  lang: Lang;
  /** Reps saisies, clé "round:nom normalisé" */
  reps: Record<string, number>;
  onSetReps: (name: string, round: number, value: number) => void;
  onResume: () => void;
  onPause: () => void;
  onSkip: () => void;
  onExit: () => void;
  simSpeed: number;
}

function phaseLabel(snapshot: EngineSnapshot, defs: { name: string }[], s: Strings['session']): string {
  const p = snapshot.phase;
  switch (p.type) {
    case 'prepare':
      return s.preparation;
    case 'work':
      // Numéro + nom de l'exercice en cours, bien visibles (spec 21/11).
      return p.exerciseName
        ? `${s.exercise} ${p.exercise}/${p.exercisesInRound} · ${p.exerciseName}`
        : `${s.exercise} ${p.exercise}/${p.exercisesInRound}`;
    case 'rest':
      // Nom de l'exercice qui arrive (spec 21/11) : un repos n'existe
      // qu'entre deux exercices, le suivant est defs[p.exercise] (0-based).
      return p.exercise < defs.length ? `${s.rest} · ${s.upNext} ${defs[p.exercise].name}` : s.rest;
    case 'longRest':
      return s.longRest;
    case 'done':
      return s.finished;
  }
}

export default function SessionScreen(props: Props) {
  const { snapshot } = props;
  const s = strings(props.lang);
  const [confirmExit, setConfirmExit] = useState(false);
  const paused = !snapshot.running && !snapshot.finished;
  const remainingSec = Math.ceil(snapshot.remainingMs / 1000);
  const phaseClass = `phase-${snapshot.phase.type}`;

  // Saisie des reps à la fin de chaque round (spec du 21/11, redesign du
  // 23/11) : pendant chaque pause longue, une fiche propose UNE entrée à
  // la fois au pavé numérique, avec « Suivant » pour l'exercice suivant,
  // « Valider » pour refermer la fiche (rouvrable d'un bouton). Des puces
  // listent les exercices du round avec leur valeur, tappables pour
  // corriger à la volée. Elle reste affichée pendant toute la pause, y
  // compris en pause manuelle, ne bloque pas le timer, et repart à zéro
  // au round suivant. Les manquantes du dernier round (pas de pause
  // longue après lui) se complètent sur l'écran de saisie avant le récap.
  const defs = exercisesFor(props.config);
  const p = snapshot.phase;
  const finishedRound = p.type === 'longRest' ? p.round - 1 : 0;
  const repDefs = finishedRound > 0 ? defs.filter((d) => d.countReps) : [];
  const [entryIndex, setEntryIndex] = useState(0);
  const [validatedRound, setValidatedRound] = useState(0);
  useEffect(() => {
    setEntryIndex(0);
  }, [finishedRound]);
  const ficheOpen = finishedRound > 0 && repDefs.length > 0 && validatedRound !== finishedRound;
  const idx = repDefs.length > 0 ? Math.min(entryIndex, repDefs.length - 1) : 0;
  const entryDef = repDefs[idx];
  const repValue = (name: string) => props.reps[`${finishedRound}:${normalizeName(name)}`] ?? 0;

  return (
    <div className={`screen session ${phaseClass}`}>
      {props.simSpeed !== 1 && <div className="sim-badge">SIM ×{props.simSpeed}</div>}

      <div className="session-round">
        {`${s.session.round} ${snapshot.phase.round}/${props.config.rounds}`}
      </div>

      <div className="session-phase-label">{phaseLabel(snapshot, defs, s.session)}</div>

      <div className="session-clock">{formatDuration(remainingSec)}</div>

      <div className="progress-track" role="progressbar" aria-valuenow={Math.round(snapshot.phaseProgress * 100)}>
        <div className="progress-fill" style={{ width: `${snapshot.phaseProgress * 100}%` }} />
      </div>

      {finishedRound > 0 && repDefs.length > 0 && (
        ficheOpen && entryDef ? (
          <div className="reps-input" data-testid="reps-input">
            <div className="reps-title">{`${s.session.repsOfRound} ${finishedRound}`}</div>
            <div className="entry-name-row">
              <span className="re-entry-name">{entryDef.name}</span>
              <span className="re-progress">{`${idx + 1}/${repDefs.length}`}</span>
            </div>
            <RepsKeypad
              value={repValue(entryDef.name)}
              onChange={(v) => props.onSetReps(entryDef.name, finishedRound, v)}
              confirmLabel={idx < repDefs.length - 1 ? s.common.next : s.common.validate}
              onConfirm={() => {
                if (idx < repDefs.length - 1) setEntryIndex(idx + 1);
                else setValidatedRound(finishedRound);
              }}
              backspaceLabel={s.common.backspace}
              clearLabel={s.common.clear}
            />
            <div className="reps-chips">
              {repDefs.map((d, i) => {
                const v = repValue(d.name);
                return (
                  <button
                    key={d.name}
                    className={`reps-chip${i === idx ? ' current' : ''}`}
                    onClick={() => setEntryIndex(i)}
                  >
                    {`${d.name} ${v > 0 ? v : '–'}`}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <button
            className="reps-reopen"
            onClick={() => {
              setValidatedRound(0);
              setEntryIndex(0);
            }}
          >
            {s.session.repsReopen}
          </button>
        )
      )}

      <div className="session-total">
        {s.session.remaining} {formatDuration(Math.ceil(snapshot.totalRemainingMs / 1000))}
      </div>

      <div className="session-controls">
        {paused ? (
          <button className="btn primary big" onClick={props.onResume}>
            {s.common.resume}
          </button>
        ) : (
          <button className="btn primary big" onClick={props.onPause}>
            {s.common.pause}
          </button>
        )}
        <div className="controls-row">
          <button className="btn ghost big" onClick={props.onSkip}>
            {s.common.skip}
          </button>
          <button className="btn danger big" onClick={() => setConfirmExit(true)}>
            {s.common.finish}
          </button>
        </div>
      </div>

      {paused && <div className="paused-hint">{s.session.paused}</div>}

      {confirmExit && (
        <div className="overlay">
          <div className="overlay-card">
            <p>{s.session.exitConfirm}</p>
            <div className="overlay-actions">
              <button className="btn danger" onClick={props.onExit}>
                {s.common.finish}
              </button>
              <button className="btn ghost" onClick={() => setConfirmExit(false)}>
                {s.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
