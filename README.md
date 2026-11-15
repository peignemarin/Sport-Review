# Sport Review

Site personnel qui présente mes performances sportives (records, volume d'entraînement, dernières sorties) à partir de mes données Garmin.

Site 100 % statique (HTML / CSS / JavaScript, sans dépendance) : il peut être hébergé gratuitement sur **GitHub Pages**.

## Structure

```
Sport Review/
├── index.html            # Page 1 — Suivi (board)
├── import.html           # Page 2 — Import des activités Garmin
├── server.py             # Serveur local : sert le site + enregistre les imports
├── css/style.css         # Styles (thème clair/sombre automatique)
├── js/format.js          # Fonctions de formatage partagées
├── js/main.js            # Page Suivi
├── js/import.js          # Page Import
├── data/activities.json  # Données d'exemple de la page Suivi
├── data/imports.json     # Imports enregistrés (créé au premier import, publié)
└── data/raw/             # Fichiers .zip importés — ignorés par Git, jamais publiés
```

## Lancer le site en local

Dans VS Code, ouvre le terminal (**Terminal › New Terminal**) et tape :

```
python3 server.py
```

Puis ouvre http://localhost:8000 dans ton navigateur. `Ctrl+C` dans le terminal pour arrêter.

## Importer une activité

1. Dans Garmin Connect, ouvre l'activité › ⚙︎ › **Exporter l'original** → tu obtiens un `.zip`.
2. Sur http://localhost:8000/import.html, dépose le `.zip`, saisis le **nom officiel** et le **temps officiel** (`h:mm:ss`), clique **Importer**.
3. Le site lit le fichier `.fit` contenu dans le zip (date, sport, distance, durée, FC, dénivelé…) et enregistre :
   - le zip original dans `data/raw/imports/` (reste sur ton Mac) ;
   - le résumé chiffré dans `data/imports.json`.
4. Pour publier : dans VS Code, **Source Control › Commit › Sync Changes**.

L'import ne fonctionne qu'avec le serveur local : sur GitHub Pages, la page Import affiche un message d'avertissement.

## Format des données

`data/activities.json` contient :

- `updated_at` — date de la dernière mise à jour
- `records` — liste `{ label, time_s, date, event }`
- `activities` — liste `{ id, date, sport, name, distance_km, duration_s, elevation_m }`, avec `sport` parmi `run`, `bike`, `swim`, `hike`

## Confidentialité

Le dépôt est public. Ne publie que des données agrégées : pas de traces GPS brutes (elles révèlent ton domicile et tes horaires). Les exports Garmin vont dans `data/raw/`, qui est exclu par `.gitignore`.

## Prochaines étapes

- [x] Page Import (zip Garmin + nom et temps officiels)
- [ ] Brancher la page Suivi sur `data/imports.json`
- [ ] Pages détaillées par sport, parcours, courses
