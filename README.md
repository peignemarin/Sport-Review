# Sport Review

Site personnel qui présente mes performances sportives (records, volume d'entraînement, dernières sorties) à partir de mes données Garmin.

Site 100 % statique (HTML / CSS / JavaScript, sans dépendance) : il peut être hébergé gratuitement sur **GitHub Pages**.

## Structure

```
Sport Review/
├── index.html            # Page principale
├── css/style.css         # Styles (thème clair/sombre automatique)
├── js/main.js            # Chargement des données et affichage
├── data/activities.json  # Données affichées (exemple pour l'instant)
└── data/raw/             # Exports Garmin bruts — ignorés par Git, jamais publiés
```

## Lancer le site en local

Le site charge `data/activities.json`, il faut donc l'ouvrir via un petit serveur (pas en double-cliquant sur `index.html`) :

- **VS Code** : installe l'extension *Live Server*, puis clic droit sur `index.html` → *Open with Live Server*.
- **Terminal** : `python3 -m http.server 8000` puis ouvre http://localhost:8000

## Format des données

`data/activities.json` contient :

- `updated_at` — date de la dernière mise à jour
- `records` — liste `{ label, time_s, date, event }`
- `activities` — liste `{ id, date, sport, name, distance_km, duration_s, elevation_m }`, avec `sport` parmi `run`, `bike`, `swim`, `hike`

## Confidentialité

Le dépôt est public. Ne publie que des données agrégées : pas de traces GPS brutes (elles révèlent ton domicile et tes horaires). Les exports Garmin vont dans `data/raw/`, qui est exclu par `.gitignore`.

## Prochaines étapes

- [ ] Importer les vraies données Garmin (export CSV / Garmin Connect)
- [ ] Script de conversion export Garmin → `activities.json`
- [ ] Pages détaillées par sport, parcours, courses
