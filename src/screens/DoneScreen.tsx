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
  /** Modifie les reps de la séance enregistrée (section dernier round). */
  onSetReps: (name: string, round: number, value: number) => void;
  onBack: () => void;
}

export default function DoneScreen(props: Props) {
  const { session } = props;

  // Résumé : total par exercice + détail par round.
  const byExercise = new Map<string, { total: number; perRound: Map<number, number> }>();
  for (const r of session?.reps ?? []) {
    let e = byExercise.get(r.exercise);
    if (!e) {
      e = { total: 0, perRound: new Map() };
      byExercise.set(r.exercise, e);
    }
    e.total += r.reps;
    e.perRound.set(r.round, r.reps);
  }
  const exercises = [...byExercise.entries()].sort((a, b) => b[1].total - a[1].total);

  // Dernier round : pas de pause longue après lui, ses reps se complètent
  // ici (steppers pré-remplis, 0 = non saisi). Spec du 21/11/2026.
  const lastRound = session?.config.rounds ?? 0;
  const editDefs =
    lastRound > 0 && session ? exercisesFor(session.config).filter((d) => d.countReps) : [];
  const editValues = new Map(editDefs.map((d) => [d.name, 0]));
  for (const r of session?.reps ?? []) {
    if (r.round !== lastRound) continue;
    const def = editDefs.find((d) => normalizeName(d.name) === normalizeName(r.exercise));
    if (def) editValues.set(def.name, r.reps);
  }

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
      </div>

      {exercises.length > 0 && (
        <section className="section done-reps">
          <h2>Reps réalisées</h2>
          <ul className="done-rep-list">
            {exercises.map(([name, e]) => (
              <li className="done-rep-row" key={name}>
                <span className="done-rep-name">{name}</span>
                <span className="done-rep-detail">
                  {[...e.perRound.entries()]
                    .sort((a, b) => a[0] - b[0])
                    .map(([round, reps]) => `R${round} : ${reps}`)
                    .join(' · ')}
                </span>
                <span className="done-rep-total">{e.total}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editDefs.length > 0 && (
        <section className="section done-reps" data-testid="reps-last-round">
          <h2>Reps du dernier round</h2>
          <p className="section-hint">
            Pas de pause longue après le dernier round : complète ou corrige ici avant l'export.
          </p>
          <ul className="done-rep-list">
            {editDefs.map((d) => {
              const value = editValues.get(d.name) ?? 0;
              return (
                <li className="done-rep-row" key={d.name}>
                  <span className="done-rep-name">{d.name}</span>
                  <div className="reps-row">
                    <button
                      className="reps-btn"
                      aria-label={`Moins de ${d.name}`}
                      onClick={() => props.onSetReps(d.name, lastRound, Math.max(0, value - 1))}
                    >
                      −
                    </button>
                    <div className="reps-value">{value || ''}</div>
                    <button
                      className="reps-btn"
                      aria-label={`Plus de ${d.name}`}
                      onClick={() => props.onSetReps(d.name, lastRound, value + 1)}
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
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

      <button className="btn primary big" onClick={props.onBack}>Retour</button>
    </div>
  );
}
