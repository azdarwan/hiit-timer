import type { Lang } from '../../types';
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
 * - transition vers un travail : "Go !" (précédé de "Round X" si nouveau round)
 * - moitié d'un travail >= 12 s : "Moitié"
 * - transition vers un repos : "Repos"
 * - transition vers un repos long : "Round X" (le round qui arrive)
 * - fin de séance : "Séance terminée, bravo !"
 */
export function buildCues(phases: Phase[], lang: Lang): Cue[] {
  const s = STRINGS[lang];
  const offsets = phaseOffsets(phases);
  const cues: Cue[] = [];

  const roundText = (n: number) => (lang === 'fr' ? `Round ${n}` : `Round ${n}`);

  phases.forEach((phase, i) => {
    const at = offsets[i] * 1000;
    if (phase.type === 'prepare') {
      cues.push({ at, action: { say: s.prepare, beep: 'transition', vibrate: 100 } });
    } else if (phase.type === 'work') {
      const firstOfRound = phase.exercise === 1;
      const say = firstOfRound ? `${roundText(phase.round)}. ${s.go}` : s.go;
      cues.push({ at, action: { say, beep: 'transition', vibrate: 100 } });
    } else if (phase.type === 'rest') {
      cues.push({ at, action: { say: s.rest, beep: 'transition', vibrate: 80 } });
    } else if (phase.type === 'longRest') {
      cues.push({ at, action: { say: roundText(phase.round), beep: 'transition', vibrate: 150 } });
    }

    const d = phase.duration;
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
