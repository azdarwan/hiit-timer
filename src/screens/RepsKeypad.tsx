/**
 * Pavé numérique de saisie des reps (redesign du 23/11) : affichage de la
 * valeur, grille 1-9 / effacer / 0 / tout effacer, bouton de confirmation
 * dont le libellé et l'action appartiennent à l'écran hôte (« Suivant »
 * pour l'entrée suivante, « Valider » pour la dernière).
 *
 * Saisie par chiffres : chaque touche complète le nombre (v*10+d), le
 * retour arrière supprime le dernier chiffre. Les compteurs de reps sont
 * des petits entiers (bornés à 999 côté contrôleur) : pas de décimales,
 * pas de signe, clavier 12 touches.
 */

const KEYS: (number | 'back' | 'clear')[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'back', 0, 'clear'];

interface Props {
  /** Valeur courante (0 = rien saisi, affiché « – »). */
  value: number;
  onChange: (value: number) => void;
  /** Libellé du bouton de confirmation (« Suivant » ou « Valider »). */
  confirmLabel: string;
  onConfirm: () => void;
  backspaceLabel: string;
  clearLabel: string;
}

export default function RepsKeypad(props: Props) {
  const { value } = props;
  const press = (d: number) => props.onChange(value > 99 ? value : value * 10 + d);
  const backspace = () => props.onChange(Math.floor(value / 10));
  const clear = () => props.onChange(0);

  return (
    <div className="keypad" data-testid="reps-keypad">
      <div className="reps-value keypad-value">{value > 0 ? value : '–'}</div>
      <div className="keypad-grid">
        {KEYS.map((k, i) =>
          typeof k === 'number' ? (
            <button key={i} className="keypad-key" onClick={() => press(k)}>
              {k}
            </button>
          ) : k === 'back' ? (
            <button key={i} className="keypad-key action" aria-label={props.backspaceLabel} onClick={backspace}>
              ⌫
            </button>
          ) : (
            <button key={i} className="keypad-key action" aria-label={props.clearLabel} onClick={clear}>
              C
            </button>
          ),
        )}
      </div>
      <button className="btn primary big keypad-confirm" onClick={props.onConfirm}>
        {props.confirmLabel}
      </button>
    </div>
  );
}
