import type { WorkoutConfig } from '../../types';
import { buildPhases } from './plan';

/**
 * Estimation calorique de la séance, méthode MET (Compendium of Physical
 * Activities) : kcal = MET × poids (kg) × heures, sommé phase par phase
 * sur le déroulé exact (suit donc les vraies durées de la config).
 *
 * Valeurs retenues pour un circuit training vigoureux poids du corps :
 * - travail ≈ 8 MET (calisthénies/circuit vigoureux),
 * - repos court ≈ 2,5 MET (debout, léger mouvement),
 * - repos long et préparation ≈ 1,5 MET.
 *
 * Sans fréquence cardiaque, la précision est de l'ordre de ±25-40 % : la
 * valeur sert aux totaux hebdomadaires et à l'export, pas à la mesure
 * exacte d'une séance (same méthode que les montres sans ceinture cardio).
 */
export const MET = { work: 8, rest: 2.5, idle: 1.5 } as const;

/** Calories estimées d'une séance (entier kcal), à partir du déroulé. */
export function estimateCalories(config: WorkoutConfig, weightKg: number): number {
  const phases = buildPhases(config);
  let kcal = 0;
  for (const p of phases) {
    const met = p.type === 'work' ? MET.work : p.type === 'rest' ? MET.rest : MET.idle;
    kcal += (met * Math.max(0, weightKg) * p.duration) / 3600;
  }
  return Math.round(kcal);
}
