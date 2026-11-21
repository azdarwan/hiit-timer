import type { Lang } from '../types';
import { fr } from './fr';
import { en } from './en';

/** Dictionnaire complet : le français est la référence, les autres langues surchargent. */
export type Strings = typeof fr;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const OVERLAYS: Partial<Record<Lang, DeepPartial<Strings>>> = { en };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Fusion profonde : les clés de l'overlay gagnent, les absentes retombent sur la base fr. */
function deepMerge(base: unknown, overlay: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    return overlay !== undefined ? overlay : base;
  }
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(overlay)) {
    out[k] = deepMerge(base[k], overlay[k]);
  }
  return out;
}

/**
 * Chaînes pour une langue. `strings('xx')` inconnue = français (base).
 * Les composants composent les interpolations (numéros, noms) eux-mêmes.
 */
export function strings(lang: Lang): Strings {
  const overlay = OVERLAYS[lang];
  if (!overlay) return fr;
  return deepMerge(fr, overlay) as Strings;
}
