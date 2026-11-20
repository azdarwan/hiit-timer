import type { Lang } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';
import type { Phase } from '../workout/plan';
import { phaseOffsets } from '../workout/plan';

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

const STRINGS: Record<Lang, Record<string, string>> = {
  fr: {
    prepare: 'Prépare-toi',
    go: 'Go !',
    rest: 'Repos',
    half: 'Moitié',
    done: 'Séance terminée, bravo !',
  },
  en: {
    prepare: 'Get ready',
    go: 'Go !',
    rest: 'Rest',
    half: 'Halfway',
    done: 'Workout complete, well done !',
  },
};

/**
 * Pré-calcule la file complète des annonces d'une séance à partir du déroulé.
 * Règles :
 * - début de préparation : "Prépare-toi"
 * - 3 dernières secondes de chaque phase >= 4 s : "3", "2", "1" + bip
 * - repos long : décompte étendu (par défaut 10 s avant la fin), paramétrable
 * - transition vers un travail : "Go !" (précédé de "Round X" si nouveau round).
 *   "Round X" est donc prononcé à la FIN du repos long, pas à son début.
 * - moitié d'un travail >= 12 s : "Moitié"
 * - transition vers un repos : "Repos"
 * - fin de séance : "Séance terminée, bravo !"
 *
 * `countdownSec` : durée du décompte de fin de repos long (0 = décompte
 * standard 3-2-1). Coupé à `duration - 1` si le repos est plus court.
 */
export function buildCues(phases: Phase[], lang: Lang, countdownSec: number = DEFAULT_SETTINGS.countdownSec): Cue[] {
  const s = STRINGS[lang];
  const offsets = phaseOffsets(phases);
  const cues: Cue[] = [];

  const roundText = (n: number) => `Round ${n}`;

  phases.forEach((phase, i) => {
    const at = offsets[i] * 1000;
    const d = phase.duration;
    if (phase.type === 'prepare') {
      cues.push({ at, action: { say: s.prepare, beep: 'transition', vibrate: 100 } });
    } else if (phase.type === 'work') {
      const firstOfRound = phase.exercise === 1;
      const say = firstOfRound ? `${roundText(phase.round)}. ${s.go}` : s.go;
      cues.push({ at, action: { say, beep: 'transition', vibrate: 100 } });
    } else if (phase.type === 'rest') {
      cues.push({ at, action: { say: s.rest, beep: 'transition', vibrate: 80 } });
    } else if (phase.type === 'longRest') {
      // Pas de "Round X" à l'entrée du repos long : il est annoncé à la fin
      // de la pause, juste avant le round qui arrive (backlog n°3).
      cues.push({ at, action: { say: s.rest, beep: 'transition', vibrate: 150 } });
    }

    if (phase.type === 'longRest') {
      // Décompte étendu de fin de pause (backlog n°4) : remplace le 3-2-1.
      const effective = Math.min(countdownSec, d - 1);
      if (effective >= 4) {
        for (let k = effective; k >= 1; k--) {
          cues.push({ at: (offsets[i] + d - k) * 1000, action: { say: String(k), beep: k <= 3 ? 'tick' : undefined } });
        }
        return;
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
