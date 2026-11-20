import { useState } from 'react';
import { formatDuration } from '../modules/workout/plan';
import { exercisesFor, normalizeName } from '../modules/workout/exercises';
import { toCSV, downloadCSV, type RecordedSession, type SyncResult } from '../modules/storage/history';

interface Props {
  realMs: number;
  totalMs: number;
  session: RecordedSession | null;
  syncResult: SyncResult | null;
  syncConfigured: boolean;
  onRetrySync: () => void;
  /** Modifie les reps de la séance enregistrée (récap éditable, tous rounds). */
  onSetReps: (name: string, round: number, value: number) => void;
  onBack: () => void;
}

export default function DoneScreen(props: Props) {
  const { session } = props;
  // Cellule sélectionnée du récap (steppers −/+ inline, spec 21/11/2026).
  const [editCell, setEditCell] = useState<{ name: string; round: number } | null>(null);

  // Récap complet : lignes = exercices "reps", colonnes = R1..Rn, + total.
  const rounds = session?.config.rounds ?? 0;
  const defs = session ? exercisesFor(session.config).filter((d) => d.countReps) : [];
  const values = new Map<string, number>();
  for (const r of session?.reps ?? []) {
    values.set(`${r.round}:${normalizeName(r.exercise)}`, r.reps);
  }
  const valueOf = (name: string, round: number) => values.get(`${round}:${normalizeName(name)}`) ?? 0;
  const totalOf = (name: string) => {
    let total = 0;
    for (let rd = 1; rd <= rounds; rd++) total += valueOf(name, rd);
    return total;
  };

  const exportSession = () => {
    if (!session) return;
    downloadCSV(toCSV([session]), `hiit-${session.day}.csv`);
  };

  return (
    <div className="screen done">
      <div className="done-title">Séance terminée</div>
      <div className="done-sub">Bravo !</div>
      <div className="done-stats">
        <div className="done-stat">
          <span className="done-stat-label">Temps écoulé</span>
          <span className="done-stat-value">{formatDuration(props.realMs / 1000)}</span>
        </div>
        <div className="done-stat">
          <span className="done-stat-label">Séance prévue</span>
          <span className="done-stat-value">{formatDuration(props.totalMs / 1000)}</span>
        </div>
        {session && session.kcal !== undefined && (
          <div className="done-stat">
            <span className="done-stat-label">Calories (estimation)</span>
            <span className="done-stat-value">{session.kcal} kcal</span>
          </div>
        )}
      </div>

      {defs.length > 0 && rounds > 0 && (
        <section className="section done-reps" data-testid="reps-recap">
          <h2>Reps de la séance</h2>
          <p className="section-hint">
            Tout ce qui a été saisi pendant les pauses, corrigé au besoin avant de valider. « – » = non saisi.
          </p>
          <table className="recap-table">
            <thead>
              <tr>
                <th aria-label="Exercice"></th>
                {Array.from({ length: rounds }, (_, i) => (
                  <th key={i}>R{i + 1}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => (
                <tr key={d.name}>
                  <th className="recap-name">{d.name}</th>
                  {Array.from({ length: rounds }, (_, i) => {
                    const round = i + 1;
                    const value = valueOf(d.name, round);
                    const selected = editCell?.name === d.name && editCell?.round === round;
                    return selected ? (
                      <td className="recap-cell selected" key={round}>
                        <div className="reps-row">
                          <button
                            className="reps-btn"
                            aria-label={`Moins de ${d.name} round ${round}`}
                            onClick={() => props.onSetReps(d.name, round, Math.max(0, value - 1))}
                          >
                            −
                          </button>
                          <div className="reps-value">{value || ''}</div>
                          <button
                            className="reps-btn"
                            aria-label={`Plus de ${d.name} round ${round}`}
                            onClick={() => props.onSetReps(d.name, round, value + 1)}
                          >
                            +
                          </button>
                        </div>
                      </td>
                    ) : (
                      <td className="recap-cell" key={round}>
                        <button
                          className="recap-tap"
                          aria-label={`Reps de ${d.name} round ${round}`}
                          onClick={() => setEditCell({ name: d.name, round })}
                        >
                          {value || '–'}
                        </button>
                      </td>
                    );
                  })}
                  <td className="recap-total">{totalOf(d.name) || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {session && (
        <div className="done-actions">
          <button className="btn ghost" onClick={exportSession}>Exporter CSV</button>
          {props.syncConfigured && props.syncResult?.ok && (
            <span className="sync-ok">Enregistré sur le serveur ✓</span>
          )}
          {props.syncConfigured && props.syncResult && !props.syncResult.ok && (
            <span className="sync-err">
              Synchro échouée ({props.syncResult.error})
              <button className="btn ghost small" onClick={props.onRetrySync}>Réessayer</button>
            </span>
          )}
          {props.syncConfigured && !props.syncResult && (
            <span className="sync-err">
              Synchro à renvoyer (reps modifiées)
              <button className="btn ghost small" onClick={props.onRetrySync}>Renvoyer</button>
            </span>
          )}
        </div>
      )}

      <button className="btn primary big" onClick={props.onBack}>Valider la séance</button>
    </div>
  );
}
