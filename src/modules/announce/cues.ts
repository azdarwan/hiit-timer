import type { Lang } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';
import type { Phase } from '../workout/plan';
import { phaseOffsets } from '../workout/plan';
import { strings } from '../../i18n';

export interface CueAction {
  say?: string;
  beep?: 'tick' | 'transition' | 'finish';
  vibrate?: number | number[];
}

/** Annonce pré-calculée, déclenchée quand le temps écoulé atteint `at` (ms). */
export interface Cue {
  at: number;
  action: CueAction;
}

/**
 * Pré-calcule la file complète des annonces d'une séance à partir du déroulé.
 * Règles :
 * - début de préparation : "Prépare-toi"
 * - 3 dernières secondes de chaque phase >= 4 s : "3", "2", "1" + bip
 * - repos long : décompte en JALONS (spec du 21/11/2026) : le réglage D est
 *   annoncé, puis les multiples de 5 strictement inférieurs en remontant
 *   depuis la fin (10 puis 5), puis le 3-2-1 standard. Total <= 6 annonces.
 *   Ex : D=30 -> "30", "10", "5", 3, 2, 1 ; D=15 -> "15", "10", "5", 3, 2, 1.
 * - transition vers un travail : "Go !", précédé du nom de l'exercice si
 *   `sayExerciseNames` est actif ("Pompes. Go !"), et de "Round X" si nouveau
 *   round. "Round X" est donc prononcé à la FIN du repos long, pas à son début.
 * - moitié d'un travail >= 12 s : "Moitié"
 * - transition vers un repos : "Repos"
 * - fin de séance : "Séance terminée, bravo !"
 *
 * `countdownSec` : jalon de départ du décompte de fin de repos long
 * (0 = décompte standard 3-2-1 seul). Coupé à `duration - 1` si le repos
 * est plus court. `sayExerciseNames` : prononce le nom de chaque exercice.
 */
export function buildCues(
  phases: Phase[],
  lang: Lang,
  countdownSec: number = DEFAULT_SETTINGS.countdownSec,
  sayExerciseNames: boolean = DEFAULT_SETTINGS.sayExerciseNames,
): Cue[] {
  const s = strings(lang).cues;
  const roundText = (n: number) => `${strings(lang).session.round} ${n}`;
  const offsets = phaseOffsets(phases);
  const cues: Cue[] = [];

  phases.forEach((phase, i) => {
    const at = offsets[i] * 1000;
    const d = phase.duration;
    if (phase.type === 'prepare') {
      cues.push({ at, action: { say: s.prepare, beep: 'transition', vibrate: 100 } });
    } else if (phase.type === 'work') {
      const firstOfRound = phase.exercise === 1;
      const name = sayExerciseNames && phase.exerciseName ? `${phase.exerciseName}. ` : '';
      const say = firstOfRound ? `${roundText(phase.round)}. ${name}${s.go}` : `${name}${s.go}`;
      cues.push({ at, action: { say, beep: 'transition', vibrate: 100 } });
    } else if (phase.type === 'rest') {
      cues.push({ at, action: { say: s.rest, beep: 'transition', vibrate: 80 } });
    } else if (phase.type === 'longRest') {
      // Pas de "Round X" à l'entrée du repos long : il est annoncé à la fin
      // de la pause, juste avant le round qui arrive (backlog n°3).
      cues.push({ at, action: { say: s.rest, beep: 'transition', vibrate: 150 } });
    }

    if (phase.type === 'longRest') {
      // Décompte en jalons de fin de pause (spec du 21/11/2026) : le jalon
      // de départ est le réglage (0-30 s), suivi des multiples de 5
      // strictement inférieurs (10 puis 5), puis du 3-2-1 standard ci-dessous.
      // Maximum 6 annonces vocales, chiffres entiers (règle de Wandrille).
      const effective = Math.min(countdownSec, d - 1);
      if (effective >= 4) {
        const milestones = [effective];
        for (const m of [10, 5]) {
          if (m < effective) milestones.push(m);
        }
        for (const m of milestones) {
          cues.push({ at: (offsets[i] + d - m) * 1000, action: { say: String(m) } });
        }
      }
    }

    if (d >= 4) {
      for (let k = 3; k >= 1; k--) {
        cues.push({ at: (offsets[i] + d - k) * 1000, action: { say: String(k), beep: 'tick' } });
      }
    }
    if (phase.type === 'work' && d >= 12) {
      cues.push({ at: (offsets[i] + d / 2) * 1000, action: { say: s.half } });
    }
  });

  const total = (offsets[offsets.length - 1] + phases[phases.length - 1].duration) * 1000;
  cues.push({ at: total, action: { say: s.done, beep: 'finish', vibrate: [200, 100, 200] } });

  cues.sort((a, b) => a.at - b.at);
  return cues;
}
