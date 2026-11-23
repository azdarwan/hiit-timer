import { useMemo, useState } from 'react';
import type { Lang, WorkoutConfig } from '../types';
import type { RepRecord } from '../modules/storage/history';
import { missingRepsEntries } from '../modules/workout/reps';
import { normalizeName } from '../modules/workout/exercises';
import { strings } from '../i18n';
import RepsKeypad from './RepsKeypad';

interface Props {
  lang: Lang;
  config: WorkoutConfig;
  /** Reps déjà saisies pendant la séance (rounds 1..n-1 en général). */
  records: RepRecord[];
  /** Termine la saisie : enregistre la séance avec les reps complétées et passe au récap. */
  onComplete: (records: RepRecord[]) => void;
}

/**
 * Écran de saisie des reps manquantes, AVANT le récapitulatif (demande du
 * 23/11) : le dernier round n'a pas de pause longue derrière lui, il ne
 * faut pas viser des petites cellules d'un tableau pour le compléter.
 * Une entrée à la fois au pavé numérique, « Suivant » pour la suivante,
 * « Valider » pour la dernière, « Passer » pour aller au récap tel quel
 * (le récap reste corrigible après). Écran sauté par App quand rien ne
 * manque : fin de séance habituelle → récap direct.
 */
export default function RepsEntryScreen(props: Props) {
  const s = strings(props.lang);
  const entries = useMemo(
    () => missingRepsEntries(props.config, props.records),
    [props.config, props.records],
  );
  const [values, setValues] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);

  const idx = entries.length > 0 ? Math.min(index, entries.length - 1) : 0;
  const entry = entries.length > 0 ? entries[idx] : null;
  const key = entry ? `${entry.round}:${normalizeName(entry.name)}` : '';
  const value = entry ? (values[key] ?? 0) : 0;

  const merged = (): RepRecord[] => {
    const out = new Map(
      props.records.map((r) => [`${r.round}:${normalizeName(r.exercise)}`, { ...r }] as const),
    );
    for (const e of entries) {
      const k = `${e.round}:${normalizeName(e.name)}`;
      const v = values[k] ?? 0;
      if (v > 0) out.set(k, { exercise: e.name, round: e.round, reps: v });
    }
    return [...out.values()];
  };

  if (!entry) return null;

  return (
    <div className="screen entry" data-testid="reps-entry">
      <div className="done-title">{s.session.entryTitle}</div>
      <p className="entry-hint">{s.session.entryHint}</p>
      <div className="reps-input">
        <div className="entry-name-row">
          <span className="re-entry-name">{entry.name}</span>
          <span className="re-entry-round">{`${s.session.roundShort}${entry.round}`}</span>
          <span className="re-progress">{`${idx + 1}/${entries.length}`}</span>
        </div>
        <RepsKeypad
          value={value}
          onChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
          confirmLabel={idx < entries.length - 1 ? s.common.next : s.common.validate}
          onConfirm={() => {
            if (idx < entries.length - 1) setIndex(idx + 1);
            else props.onComplete(merged());
          }}
          backspaceLabel={s.common.backspace}
          clearLabel={s.common.clear}
        />
        <button className="btn ghost entry-skip" onClick={() => props.onComplete(merged())}>
          {s.common.skip}
        </button>
      </div>
    </div>
  );
}
