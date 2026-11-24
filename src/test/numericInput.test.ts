import { describe, expect, it } from 'vitest';
import { commitNumber, typedNumber } from '../modules/workout/numericInput';

describe('typedNumber (frappe intermédiaire, poids 30-300)', () => {
  const MIN = 30;
  const MAX = 300;

  it('valeur dans les bornes : appliquée immédiatement', () => {
    expect(typedNumber('92', MIN, MAX)).toEqual({ value: 92 });
  });

  it('préfixe hors bornes : gardé en brouillon, rien d’appliqué', () => {
    // « 9 » pour 92 kilos ne doit pas partir en 30.
    expect(typedNumber('9', MIN, MAX)).toEqual({ value: null });
    // « 309 » pendant la frappe ne doit pas être écrasé en 300.
    expect(typedNumber('309', MIN, MAX)).toEqual({ value: null });
  });

  it('valeur exactement aux bornes : appliquée', () => {
    expect(typedNumber('30', MIN, MAX)).toEqual({ value: 30 });
    expect(typedNumber('300', MIN, MAX)).toEqual({ value: 300 });
  });

  it('champ vidé ou non numérique : brouillon, rien d’appliqué', () => {
    expect(typedNumber('', MIN, MAX)).toEqual({ value: null });
    expect(typedNumber('abc', MIN, MAX)).toEqual({ value: null });
  });
});

describe('commitNumber (sortie de champ)', () => {
  const MIN = 30;
  const MAX = 300;
  const FALLBACK = 80;

  it('resserre dans les bornes au blur', () => {
    expect(commitNumber('9', MIN, MAX, FALLBACK)).toBe(30);
    expect(commitNumber('309', MIN, MAX, FALLBACK)).toBe(300);
    expect(commitNumber('92', MIN, MAX, FALLBACK)).toBe(92);
  });

  it('bornes exactes conservées', () => {
    expect(commitNumber('30', MIN, MAX, FALLBACK)).toBe(30);
    expect(commitNumber('300', MIN, MAX, FALLBACK)).toBe(300);
  });

  it('champ vidé ou non numérique : repli sur la valeur courante', () => {
    expect(commitNumber('', MIN, MAX, FALLBACK)).toBe(FALLBACK);
    expect(commitNumber('abc', MIN, MAX, FALLBACK)).toBe(FALLBACK);
  });
});
