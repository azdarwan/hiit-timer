# HIIT Timer

Minuteur HIIT (High Intensity Interval Training) — PWA installable, **100 % hors ligne, gratuite, sans pub, sans tracker, sans compte**.

- Travail / Repos / Rounds / Repos long / Préparation, entièrement configurables
- **Exercices nommés + comptage des reps** (pompes, tractions…) saisi à la pause
- **Historique des séances** (jour, durées, reps par round) + export CSV Excel
- **Synchro serveur optionnelle** : mini-API PHP à déployer sur un hébergement OVH (cf. `server/README.md`), lisible aussi par un agent (JSON/CSV)
- Annonces vocales (TTS navigateur, FR/EN) et bips Web Audio (aucun fichier son)
- Pause / Passer / Terminer, reprise après fermeture de l'appli
- **Le timer ne se met jamais en pause** quand tu changes d'appli ou discutes avec un agent : le moteur à timestamps rattrape le temps réel ; les annonces manquées ne sont pas rejouées en rafale
- « Round X » annoncé à la **fin** du repos long, décompte de fin de pause paramétrable (10 s par défaut)
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

Avec `?sim=60`, une séance de 33:40 se déroule en ~34 s réelles : toutes les annonces vocales, bips, transitions et écrans s'exécutent exactement comme en vrai. Un badge « SIM ×60 » s'affiche pendant la séance. Sans le paramètre, horloge réelle.

## Architecture

```
src/
├── types.ts                     # config, réglages, limites de validation
├── App.tsx                      # navigation entre écrans, reprise de séance
├── modules/
│   ├── workout/plan.ts          # déroulé de séance : phases, noms d'exercices, durées
│   ├── workout/exercises.ts     # exercices par défaut, noms normalisés (clé des données)
│   ├── timer/engine.ts          # moteur de timer basé timestamps (aucune accumulation d'intervalles)
│   ├── announce/cues.ts         # file d'annonces pré-calculée (round en fin de pause, décompte)
│   ├── voice/VoiceService.ts    # interface VoiceService + TTS (remplaçable par des MP3)
│   ├── audio/beeps.ts           # bips Web Audio (aucun fichier son)
│   ├── wakelock/wakelock.ts     # Screen Wake Lock, repli silencieux
│   └── storage/                 # réglages, favoris, séance en cours, historique CSV (localStorage)
├── controller/SessionController.ts  # relie moteur, annonces, voix, bips, wake lock, reps, persistance
├── screens/                     # ConfigScreen, SessionScreen, DoneScreen
└── test/                         # tests vitest
server/                           # mini-API PHP (OVH) : stockage des séances, export JSON/CSV
```

### Saisie des reps et continuité des données

Chaque exercice a un **nom** (modifiable dans l'écran config) et une option
« Compter les reps ». À la pause qui suit un exercice compté, un stepper
apparaît ; la saisie disparaît à la fin de la pause sans jamais bloquer le
timer. Les reps sont stockées **par round** avec le **jour** de la séance
(l'heure est inutile). Les données sont rattachées au **nom normalisé** de
l'exercice, pas à sa position : si le cycle change (ordre, nombre
d'exercices), l'historique de chaque exercice reste comparable.

### Précision du timer

Le moteur ne compte **jamais** « 1 tick = 1 seconde ». Le temps écoulé est toujours `ancre + (Date.now() − ancreHorloge)`, et chaque frontière de phase est un offset exact depuis le début de séance. Un tick en retard ou en avance ne peut donc ni accumuler ni perdre du temps : la dérive est nulle par construction et non une limite d'erreur. Pause et reprise ré-ancrent simplement l'horloge ; « Passer » saute à l'offset exact de la phase suivante. `src/test/engine.test.ts` le vérifie avec une horloge irrégulière, une pause réelle et une séance réelle chronométrée.

### Annonces

La file d'annonces est **pré-calculée** au lancement de la séance (`buildCues`) à partir du déroulé : chaque annonce a un instant de déclenchement exact. L'AudioContext et la voix sont débloqués par l'appui sur **Start** (contrainte Safari/iOS). Pour remplacer le TTS par des MP3 enregistrés, écris une autre implémentation de `VoiceService` — rien d'autre ne bouge.

## Tests

```bash
npm test
```

Couvre notamment :

- durée totale par défaut = **2020 s = 33:40**, somme des phases identique ;
- noms des exercices portés par les phases (travail, repos, repos long) et compatibilité avec les anciennes configs sans définitions ;
- toutes les annonces du tableau au bon instant sur la séance par défaut complète (horloge virtuelle déterministe), « Round X » à la fin du repos long, décompte étendu (et sa coupure sur un repos long trop court) ;
- historique : stockage par jour (sans heure), CSV Excel fr avec ligne résumé + lignes par exercice/round ;
- session en cours : reps persistées à la pause, restituées à la reprise, annonces manquées en arrière-plan sautées sans rafale ;
- pause puis reprise sans dérive (pause réelle chronométrée) ;
- « Passer » à l'exercice 7/15 → repos suivant direct, annonces de la portion sautée supprimées ;
- persistance favoris/session en localStorage ;
- séance réelle de 5 s de contenu terminée avec < 100 ms d'écart.

## Réglages

Langue de la voix (FR/EN), choix de la voix (les meilleures voix sont choisies automatiquement : Google, Natural/Premium, voix locales de qualité ; sélection manuelle possible), voix on/off, volume des bips, décompte de fin de pause (10 s par défaut, 0 = coupé), garder l'écran allumé (par défaut, repli silencieux si non supporté), vibration sur les transitions, synchro serveur (URL + jeton). Réglages, configuration et favoris sont mémorisés entre deux ouvertures (localStorage).

## Validation des champs

Travail ≥ 5 s, repos ≥ 0 s, exercices ≥ 1, rounds ≥ 1, préparation ≥ 0 s (repos long ≥ 0 s). Les steppers et la saisie clavier appliquent ces bornes.
