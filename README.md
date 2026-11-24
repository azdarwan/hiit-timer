# HIIT Timer

Minuteur HIIT (High Intensity Interval Training) — PWA installable, **100 % hors ligne, gratuite, sans pub, sans tracker, sans compte**.

- Travail / Repos / Rounds / Repos long / Préparation, entièrement configurables
- **Saisie clavier sans clamp brutal** (poids, durées, décompte) : une frappe hors bornes (ex « 9 » pour 92 kg) reste en brouillon le temps de la saisie, seule une valeur valide s'applique en direct, les bornes ne s'appliquent qu'à la sortie du champ (testé, cf. `numericInput.test.ts`)
- **Séance par défaut** (base du Scientific 7-Minute Workout, enrichie) : jumping jacks, chaise, pompes (reps), crunch, step-up, squat, tractions (reps), pont fessier, dips triceps, planche, montées de genoux, fentes, pompes avec rotation (reps), gainage latéral gauche, gainage latéral droit. L'ancien ordre par défaut est migré automatiquement au chargement ; une liste d'exercices personnalisée n'est jamais touchée ; un bouton « Réinitialiser la séance par défaut » remet exactement cette liste, quel que soit l'historique du navigateur
- **Réordonnancement des exercices par glisser-déposer** : poignée dédiée à gauche de chaque ligne de l'écran config (pointer events, aucune dépendance), l'ordre de la liste = l'ordre en séance ; l'édition ne tronque plus la liste sauvegardée
- **Exercices nommés + comptage des reps** (pompes, tractions…) saisis au **pavé numérique**, avec **écran de saisie pour ce qui manque avant le récapitulatif** (en général le dernier round), puis **récapitulatif complet corrigible**
- **Historique des séances** (jour, durées, reps par round, calories estimées) + export CSV Excel
- **Synchro serveur optionnelle** : mini-API PHP à déployer sur un hébergement OVH (cf. `server/README.md`), lisible aussi par un agent (JSON/CSV)
- Annonces vocales (TTS navigateur, FR/EN) et bips Web Audio (aucun fichier son)
- Pause / Passer / Terminer, reprise après fermeture de l'appli
- « Passer » en rafale = silencieux : pas d'annonce d'atterrissage quand on enchaîne les skips (< 2 s), la file vocale est purgée ; un skip isolé garde son annonce
- **Le timer ne se met jamais en pause** quand tu changes d'appli ou verrouilles : le moteur à timestamps rattrape le temps réel. Depuis le fix point 5 : une session audio de lecture (ardoise silencieuse bouclée) garde l'appli vivante **en arrière-plan** ; au premier plan elle cède toujours la place. **Quand une musique externe joue (arbitrage du 24/11)** : elle gagne, jamais de vol de session, la voix se tait et le timer reste audible par les **bips** seuls (mixables par-dessus la musique) ; sans musique, la voix vit en arrière-plan (point 5), et les annonces dues pendant un gel sont rattrapées au retour (une seule annonce d'état). La synthèse vocale est réveillée au retour au premier plan (contournement du TTS muet d'iOS)
- « Round X » annoncé à la **fin** du repos long, décompte de fin de pause **en jalons** : le réglage (0-30 s), puis 10 s et 5 s, puis 3-2-1
- Numéro + nom de l'exercice affichés en grand pendant le travail, exercice suivant affiché pendant le repos ; option « nom des exercices à voix haute »
- Screen Wake Lock pendant la séance, vibration sur les transitions
- Timer basé sur des timestamps réels : dérive nulle par construction, testée

## Lancer en local

```bash
npm install
npm run dev
```

Ouvre l'URL affichée (ex. `http://localhost:5173`).

Autres commandes :

```bash
npm test        # tests unitaires et de précision (vitest)
npm run build   # build de production + génération du service worker
npm run preview # sert le build de production en local
```

## Installation sur iPhone (Safari)

1. Ouvre l'URL de l'appli dans **Safari** (pas Chrome) — en local : `http://<ip-de-ton-mac>:5173` sur le même Wi-Fi, ou une URL HTTPS (le mode avion complet exige d'avoir chargé l'appli au moins une fois pour que le service worker installe le cache).
2. Bouton **Partager** (carré avec flèche) → **Sur l'écran d'accueil**.
3. Nomme l'icône puis **Ajouter**.
4. Lance-la depuis l'écran d'accueil : elle s'ouvre en plein écran, sans barre Safari.
5. Après la première ouverture, tout est en cache : l'appli fonctionne en **mode avion**, du premier au dernier écran.

## Installation sur Android

Chrome → menu ⋮ → **Ajouter à l'écran d'accueil** (ou « Installer l'application »).

## Mode simulation accéléré (test, non exposé dans l'UI)

Ajoute `?sim=<facteur>` à l'URL pour accélérer l'horloge virtuelle de la séance :

```
http://localhost:5173/?sim=60
```

Avec `?sim=60`, une séance de 33:40 se déroule en ~34 s réelles : toutes les annonces vocales, bips, transitions et écrans s'exécutent exactement comme en vrai. Un badge « SIM ×60 » s'affiche pendant la séance. Sans le paramètre, horloge réelle. Au-delà de ×10, les pumps s'éloignent de plus de 1,5 s d'horloge virtuelle : comme après un gel d'arrière-plan, seules les annonces d'état sont jouées (jamais de rafale);

## Architecture

```
src/
├── types.ts                     # config, réglages, limites de validation
├── App.tsx                      # navigation entre écrans, reprise de séance
├── modules/
│   ├── workout/plan.ts          # déroulé de séance : phases, noms d'exercices, durées
│   ├── workout/exercises.ts     # exercices par défaut, migration d'ordre, noms normalisés (clé des données), réordonnancement
│   ├── workout/reps.ts          # entrées de reps (fiches, écran avant récap)
│   ├── timer/engine.ts          # moteur de timer basé timestamps (aucune accumulation d'intervalles)
│   ├── announce/cues.ts         # file d'annonces pré-calculée (round en fin de pause, décompte)
│   ├── voice/VoiceService.ts    # interface VoiceService + TTS (remplaçable par des MP3)
│   ├── audio/beeps.ts           # bips Web Audio (aucun fichier son)
│   ├── audio/backgroundAudio.ts # session de lecture arrière-plan uniquement, cohabite avec la musique
│   ├── wakelock/wakelock.ts     # Screen Wake Lock, repli silencieux
│   └── storage/                 # réglages, favoris, séance en cours, historique CSV (localStorage)
├── controller/SessionController.ts  # relie moteur, annonces, voix, bips, wake lock, reps, persistance, rattrapage arrière-plan
├── screens/                     # ConfigScreen, SessionScreen, RepsKeypad, RepsEntryScreen, DoneScreen
└── test/                         # tests vitest
server/                           # mini-API PHP (OVH) : stockage des séances, export JSON/CSV
```

### Saisie des reps et continuité des données

Chaque exercice a un **nom** (modifiable dans l'écran config) et une option
« Compter les reps ». Pendant chaque **pause longue**, une fiche de saisie
propose **une entrée à la fois au pavé numérique** (chiffres, retour arrière,
tout effacer) : « Suivant » passe à l'exercice suivant, « Valider » referme
la fiche (rouvrable d'un bouton), et des puces tappables listent le round
avec leurs valeurs. La fiche reste affichée même en pause manuelle.
À la **fin de la séance**, si des reps manquent (en général le dernier
round, sans pause longue derrière lui), un **écran de saisie dédié**
s'intercale **avant** le récapitulatif ; s'il ne manque rien, le récap
arrive directement comme avant. Puis le tableau récapitulatif
(lignes = exercices, colonnes = rounds) montre tout ce qui a été saisi,
corrigible au doigt avant « Valider la séance »
(validation non bloquante : la séance est déjà sauvegardée).
La saisie ne bloque jamais le timer. Les reps sont stockées **par round** avec le **jour** de la séance
(l'heure est inutile). Les données sont rattachées au **nom normalisé** de
l'exercice, pas à sa position : si le cycle change (ordre, nombre
d'exercices), l'historique de chaque exercice reste comparable.

### Précision du timer

Le moteur ne compte **jamais** « 1 tick = 1 seconde ». Le temps écoulé est toujours `ancre + (Date.now() − ancreHorloge)`, et chaque frontière de phase est un offset exact depuis le début de séance. Un tick en retard ou en avance ne peut donc ni accumuler ni perdre du temps : la dérive est nulle par construction et non une limite d'erreur. Pause et reprise ré-ancrent simplement l'horloge ; « Passer » saute à l'offset exact de la phase suivante. `src/test/engine.test.ts` le vérifie avec une horloge irrégulière, une pause réelle et une séance réelle chronométrée.

### Annonces

La file d'annonces est **pré-calculée** au lancement de la séance (`buildCues`) à partir du déroulé : chaque annonce a un instant de déclenchement exact. L'AudioContext et la voix sont débloqués par l'appui sur **Start** (contrainte Safari/iOS). Pour remplacer le TTS par des MP3 enregistrés, écris une autre implémentation de `VoiceService` — rien d'autre ne bouge.

Vocabulaire vocal : « Repos » = repos court mid-round ; « **Fin du round, pause** » = entrée du repos long (décision du 23/11 : la fin d'un round doit s'entendre, le 3-2-1 qui précède est identique à celui d'un repos court) ; « Round X. Go ! » = fin du repos long, le numéro de round arrive juste avant le redémarrage, pas à l'entrée de la pause.

**Son en arrière-plan et musique externe (point 5, arbitrage final du 24/11 : la musique gagne, le timer passe en bips)** : la session audio de lecture n'est active **qu'en arrière-plan** (`src/modules/audio/backgroundAudio.ts`). Son support est un WAV de silence numérique vrai (en PCM 8 bits le silence vaut 128 ; l'ancienne boucle écrivait des 0, soit un signal pleine échelle qui claquait à chaque tour de boucle sur iPhone). Le clic **Start** lance une lecture de déblocage (iOS exige un geste, lecture non muted), immédiatement relâchée : au premier plan, la session est toujours rendue. En passant en arrière-plan pendant une séance, la boucle (re)part et l'appli vit comme une musique (timer, bips et annonces). Si une autre source audio (Spotify…) prend le relais, **on ne lui vole jamais la session** : sa musique gagne, la session repasse en « transient » et la voix se tait tant que l'appli est cachée (`isVoiceMuted` braqué dans `SessionController`) : le timer reste audible par les **bips Web Audio mixables** par-dessus la musique (`navigator.audioSession.type = 'transient'`, Safari 16.4+, approche validée du PR nieminenlinda-del/workout-program#18). L'état se remet à zéro à la prochaine séance ; au premier plan la voix reprend toujours (rewarm + annonce d'état au retour). **Limite iOS** : le TTS (`speechSynthesis`) prend une session audio exclusive, il ne peut pas mixer avec la musique — pas d'option de ducking pour le web (contrairement à Strava et aux applis natives qui utilisent AVAudioSession.duckOthers) ; la piste « voix par-dessus la musique » (fichiers audio préenregistrés joués en Web Audio mixable) est au backlog produit. **Bug iOS contourné (24/11)** : après un arrière-plan interrompu par une autre source audio, la file TTS reste muette (pause/play ne réveillent rien) ; au retour au premier plan, `VoiceService.rewarm()` purge et relance la synthèse (utterance inaudible non vide : une utterance vide peut bloquer toute la file sur iOS), puis la consolidation d'annonces dit où on en est.

### Internationalisation (i18n)

Toutes les chaînes visibles (écrans, cues vocales, aria-labels) sont
centralisées dans `src/i18n/` :

- `fr.ts` : dictionnaire français **complet**, la référence ;
- `en.ts` : surcharge **partielle** en anglais — toute clé absente retombe
  automatiquement sur le français (fusion profonde dans `index.ts`) ;
- `strings(lang)` renvoie le dictionnaire fusionné pour une langue, français
  si la langue est inconnue.

Règle de construction : **aucune nouvelle chaîne visible ne s'écrit en dur
dans un écran**, tout passe par le dictionnaire (les interpolations —
numéros de round, noms d'exercices — restent composées côté composant).
Le réglage **Langue** pilote à la fois la voix et l'interface. L'anglais est
partiel volontairement : on ne traduit que ce qu'un vrai locuteur relit,
au moment où une audience non francophone est visée — le reste bascule
proprement en français en attendant.

Les **formats de données** (CSV, en-têtes `date;exercice;round;reps;...`,
clés de stockage) restent en français : ce sont des formats stables, pas du
texte d'interface.


## Tests

```bash
npm test
```

Couvre notamment :

- durée totale par défaut = **2020 s = 33:40**, somme des phases identique ;
- calories estimées (méthode MET) : 255 kcal sur la séance par défaut à 75 kg, proportionnelles au poids, calculées phase par phase sur le déroulé exact ;
- noms des exercices portés par les phases (travail, repos, repos long) et compatibilité avec les anciennes configs sans définitions ;
- toutes les annonces du tableau au bon instant sur la séance par défaut complète (horloge virtuelle déterministe), « Round X » à la fin du repos long, « Fin du round, pause » à l'entrée du repos long (distinct d'un repos court, décision du 23/11), décompte en jalons (D=15 → 15, 10, 5, 3-2-1 et sa coupure sur un repos long trop court) ;
- historique : stockage par jour (sans heure), CSV Excel fr avec ligne résumé + lignes par exercice/round ;
- session en cours : reps persistées à la pause, restituées à la reprise ; arrière-plan : l'écart entre deux pumps détecte un gel total (seuil 1,5 s), l'arriéré n'est jamais rejeté en rafale : purge de la file vocale puis annonce d'état (la plus récente due), et en marche normale aucune annonce n'est consolidée ; voix muette (musique externe) : le « say » saute, les bips passent toujours ;
- pause puis reprise sans dérive (pause réelle chronométrée) ;
- « Passer » à l'exercice 7/15 → repos suivant direct, annonces de la portion sautée supprimées ; rafale de « Passer » silencieuse (ni annonce ni bip à l'atterrissage, file vocale purgée), skip isolé inchangé ;
- persistance favoris/session en localStorage ;
- session audio d'arrière-plan : WAV de silence numérique vrai (128 partout), déblocage au Start puis pause immédiate au premier plan, claim en arrière-plan, **jamais de re-claim derrière une musique externe** (session repassée en mixable), voix muette cachée derrière une musique (`isVoiceMuted`) et revenue au premier plan ;
- i18n : base fr complète, surcharge en (cues, boutons, session), repli français sur les clés absentes, surcharge sans clé étrangère ;
- séance réelle de 5 s de contenu terminée avec < 100 ms d'écart.

## Réglages

Langue (voix **et** interface, FR interface complète / EN partiel avec repli français), choix de la voix (les meilleures voix sont choisies automatiquement : Google, Natural/Premium, voix locales de qualité ; sélection manuelle possible), voix on/off, nom des exercices à voix haute (off par défaut), volume des bips, décompte de fin de pause en jalons (10 s par défaut, 0 = coupé), poids en kg (estimation des calories par la méthode MET, ±25-40 % sans fréquence cardiaque), garder l'écran allumé (par défaut, repli silencieux si non supporté), vibration sur les transitions, synchro serveur (URL + jeton). Réglages, configuration et favoris sont mémorisés entre deux ouvertures (localStorage).

## Validation des champs

Travail ≥ 5 s, repos ≥ 0 s, exercices ≥ 1, rounds ≥ 1, préparation ≥ 0 s (repos long ≥ 0 s). Les steppers et la saisie clavier appliquent ces bornes.
