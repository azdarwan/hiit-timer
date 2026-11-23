import type { Strings, DeepPartial } from './index';

/**
 * Surcharge anglaise : PARTIELLE volontairement. Le français est la base,
 * toute clé absente ici retombe sur la valeur française (mécanisme de
 * fallback dans strings()). Compléter ce fichier = traduire l'appli, sans
 * toucher aux écrans. Règle : ne traduire que ce qui est relu par un vrai
 * locuteur, au moment où une audience non francophone est visée.
 */
export const en: DeepPartial<Strings> = {
  cues: {
    prepare: 'Get ready',
    go: 'Go !',
    rest: 'Rest',
    roundEnd: 'End of round, rest',
    half: 'Halfway',
    done: 'Workout complete, well done !',
  },
  common: {
    start: 'Start',
    resume: 'Resume',
    pause: 'Pause',
    skip: 'Skip',
    finish: 'Finish',
    cancel: 'Cancel',
    ignore: 'Dismiss',
    save: 'Save',
  },
  session: {
    round: 'Round',
    preparation: 'Get ready',
    rest: 'Rest',
    longRest: 'Long rest',
    paused: 'Paused',
    inProgressTitle: 'Workout in progress',
    remaining: 'Remaining\u00A0:',
  },
};
