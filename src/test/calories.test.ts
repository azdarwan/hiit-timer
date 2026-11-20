import { describe, expect, it } from 'vitest';
import { estimateCalories } from '../modules/workout/calories';
import { DEFAULT_CONFIG } from '../types';

describe('Estimation calorique (méthode MET)', () => {
  it('calcule les calories de la séance par défaut, phase par phase (75 kg)', () => {
    // Par défaut : 1350 s de travail, 420 s de repos courts, 240 s de repos
    // long, 10 s de préparation.
    // (8 × 1350 + 2,5 × 420 + 1,5 × 250) × 75 / 3600 ≈ 255 kcal
    expect(estimateCalories(DEFAULT_CONFIG, 75)).toBe(255);
  });

  it('suit le déroulé exact : travail seul, sans repos ni préparation', () => {
    const config = { work: 60, rest: 0, exercises: 1, rounds: 2, longRest: 0, prepare: 0 };
    // 8 MET × 75 kg × 120 s / 3600 = 20 kcal
    expect(estimateCalories(config, 75)).toBe(20);
  });

  it('est proportionnelle au poids et vaut 0 sans poids', () => {
    const config = { work: 30, rest: 0, exercises: 1, rounds: 1, longRest: 0, prepare: 0 };
    expect(estimateCalories(config, 0)).toBe(0);
    expect(estimateCalories(config, 150)).toBe(2 * estimateCalories(config, 75));
  });
});
