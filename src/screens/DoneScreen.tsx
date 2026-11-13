import { formatDuration } from '../modules/workout/plan';

interface Props {
  realMs: number;
  totalMs: number;
  onBack: () => void;
}

export default function DoneScreen({ realMs, totalMs, onBack }: Props) {
  return (
    <div className="screen done">
      <div className="done-title">Séance terminée</div>
      <div className="done-sub">Bravo !</div>
      <div className="done-stats">
        <div className="done-stat">
          <span className="done-stat-label">Temps écoulé</span>
          <span className="done-stat-value">{formatDuration(realMs / 1000)}</span>
        </div>
        <div className="done-stat">
          <span className="done-stat-label">Séance prévue</span>
          <span className="done-stat-value">{formatDuration(totalMs / 1000)}</span>
        </div>
      </div>
      <button className="btn primary big" onClick={onBack}>Retour</button>
    </div>
  );
}
