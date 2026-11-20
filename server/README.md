# Déploiement du stockage des séances (hébergement OVH)

L'appli Hit Timer (PWA) enregistre chaque séance terminée :

- **localement** (localStorage de l'iPhone/Android) : historique, export CSV ;
- **sur ton serveur OVH** (optionnel, réglage « Synchro serveur ») : une
  mini-API PHP sans base de données, un simple fichier JSONL protégé par
  jeton. L'objectif : la donnée est exportable, analysable (Excel/Sheets,
  scripts, agent Mistral) et prête pour de futurs rapports dans l'appli.

## Installation sur un hébergement mutualisé OVH (offre avec PHP)

1. **Copie le dossier `server/`** sur ton hébergement via le FTP OVH
   (Module `FTP` du manager), par exemple sous `www/hiit/`.
   Fichiers présents : `api.php`, `config.example.php`, `data/.htaccess`.
2. **Crée `config.php`** à côté de `api.php` (copie de
   `config.example.php`) et mets un jeton secret. Pour en générer un :
   ```bash
   php -r "echo bin2hex(random_bytes(24));"
   ```
3. **Vérifie les permissions** : OVH rend `www/` accessible ; le dossier
   `data/` est protégé par le `.htaccess` fourni (`Require all denied`).
   Si l'écriture échoue, passe le dossier `data/` en 775 depuis le FTP.
4. **Vérifie HTTPS** : active le certificat SSL (inclus chez OVH,
   « Certificat SSL Let's Encrypt » dans le manager) pour que la PWA
   puisse appeler l'API.

L'URL de l'API ressemble alors à :
`https://ton-domaine.tld/hiit/api.php`

## Dans l'appli (Réglages → Synchro serveur)

- URL du serveur : `https://ton-domaine.tld/hiit/api.php`
- Jeton : le jeton défini dans `config.php`

Chaque séance terminée est envoyée automatiquement (jour, durées,
exercices, reps par round). En cas d'échec (réseau, serveur), l'appli le
signale sur l'écran de fin avec un bouton « Réessayer » ; la séance reste
toujours dans l'historique local.

## Lire les données

- **JSON** : `https://ton-domaine.tld/hiit/api.php?token=JETON`
- **CSV** (Excel fr, séparateur `;`) :
  `https://ton-domaine.tld/hiit/api.php?token=JETON&format=csv`
- Le CSV contient une ligne résumé « Séance » par séance (permet de
  compter les séances et les minutes/semaine même sans reps) puis une
  ligne par exercise/round : `date;exercice;round;reps;duree_min;kcal`
  (la colonne `kcal`, estimation MET, est vide pour les séances anciennes).

## Tester en ligne de commande

```bash
JETON="ton-jeton"
URL="https://ton-domaine.tld/hiit/api.php"

# enregistre une séance de test
curl -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "X-Hit-Token: $JETON" \
  -d '{"day":"2026-11-20","realMs":2020000,"totalMs":2020000,
       "config":{"work":30,"rest":10,"exercises":15,"rounds":3,"longRest":120,"prepare":10},
       "reps":[{"exercise":"Pompes","round":1,"reps":14}]}'

# relis toutes les séances
curl "$URL?token=$JETON"
curl "$URL?token=$JETON&format=csv"
```

## Sécurité

- Le jeton est obligatoire (en-tête `X-Hit-Token` ou `?token=`).
- Comparaison à temps constant (`hash_equals`), aucune exécution de
  données reçues ; seuls les champs attendus sont conservés, avec
  normalisation des types.
- `data/` est bloqué pour le web par `.htaccess` : seul `api.php` lit le
  fichier (attention : si ton hébergement n'utilise pas Apache, bloque le
  dossier `data/` autrement ou déplace-le hors du web).

## Évolutions prévues (backlog)

- Rapports dans l'appli (évolution par exercice, séances et minutes par
  semaine) : l'appli lira l'endpoint JSON et calculera localement.
- Export vers Garmin/Strava.
