/**
 * Saisie numérique au clavier (champs bornés des écrans de config).
 *
 * Bug du 24/11 : appliquer les bornes (min/max) à CHAQUE frappe rend
 * impossibles les valeurs dont un préfixe est hors bornes. Ex poids
 * (30-300) : taper « 9 » pour 92 kilos était immédiatement écrasé en 30,
 * puis « 309 » en 300. Même classe de bug sur les durées de séance
 * (travail min 5 : taper « 3 » pour 35 s).
 *
 * Règle : pendant la frappe, une valeur hors bornes (ou vide, ou non
 * numérique) reste un BROUILLON affiché tel quel ; seule une valeur déjà
 * dans les bornes est appliquée en direct (la séance se met à jour au
 * fil de la saisie). Les bornes ne s'appliquent qu'à la SORTIE du champ
 * (blur) : la valeur est alors resserrée dans [min, max].
 */

/**
 * Une frappe clavier : valeur à appliquer immédiatement si déjà dans les
 * bornes, sinon `null` et le texte à garder en brouillon tel quel.
 */
export function typedNumber(raw: string, min: number, max: number): { value: number | null } {
  if (raw === '') return { value: null };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { value: null };
  if (n < min || n > max) return { value: null };
  return { value: n };
}

/**
 * La saisie est terminée (blur/valider) : clamp dans les bornes. Un champ
 * vidé ou non numérique rend la valeur de repli (rien ne change).
 */
export function commitNumber(raw: string, min: number, max: number, fallback: number): number {
  if (raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
