import type { WorkoutConfig } from '../../types';
import type { RepRecord } from '../storage/history';
import { exercisesFor, normalizeName } from './exercises';

/** Une entrée « reps » concernée : nom d'affichage + round. */
export interface RepsEntry {
  name: string;
  round: number;
}

/**
 * Toutes les entrées « reps » d'une config, dans l'ordre du cycle, round
 * par round (Pompes R1, Tractions R1…, Pompes R2…). Base des fiches de
 * saisie (redesign du 23/11 : pavé numérique, bouton « Suivant »).
 */
export function allRepsEntries(config: WorkoutConfig): RepsEntry[] {
  const defs = exercisesFor(config).filter((d) => d.countReps);
  const out: RepsEntry[] = [];
  for (let round = 1; round <= Math.max(1, config.rounds); round++) {
    for (const d of defs) out.push({ name: d.name, round });
  }
  return out;
}

/**
 * Entrées jamais saisies (valeur 0 ou absente) : typiquement celles du
 * DERNIER round, qui n'a pas de pause longue derrière lui. C'est la liste
 * de l'écran de saisie qui précède le récap (demande du 23/11) : on
 * complète l'essentiel au clavier numérique au lieu de viser des petites
 * cellules du tableau.
 */
export function missingRepsEntries(config: WorkoutConfig, records: RepRecord[]): RepsEntry[] {
  const known = new Map(
    records.map((r) => [`${r.round}:${normalizeName(r.exercise)}`, r.reps] as const),
  );
  return allRepsEntries(config).filter(
    (e) => (known.get(`${e.round}:${normalizeName(e.name)}`) ?? 0) === 0,
  );
}
