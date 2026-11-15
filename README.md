# Sport Review

Site personnel qui présente mes performances sportives (records, volume d'entraînement, dernières sorties) à partir de mes données Garmin.

Site 100 % statique (HTML / CSS / JavaScript, sans dépendance) : il peut être hébergé gratuitement sur **GitHub Pages**.

## Structure

```
Sport Review/
├── index.html            # Page Track Record : carte de France + tracés GPS des courses
├── courses.html          # Page Race settings : nom et temps officiels
├── Start Sport Review.command  # Double-clic : lance le serveur et ouvre le site
├── server.py             # Serveur local : sert le site + enregistre les courses
├── tracks.py             # Lit les .zip Garmin → data/tracks.json (lancé au démarrage du serveur)
├── css/style.css         # DA : beige, anthracite, bleu électrique
├── js/format.js          # Fonctions de formatage partagées
├── js/france.js          # Contour simplifié de la France (Natural Earth)
├── js/main.js            # Page Track Record
├── js/courses.js         # Page Race settings
├── data/garmin/          # Fichiers .zip exportés de Garmin Connect
├── data/courses.json     # Liste des courses + nom et temps officiels
└── data/tracks.json      # Tracés GPS simplifiés (généré)
```

## Ajouter une course

Dépose le `.zip` exporté de Garmin Connect dans `data/garmin/`, puis lance le serveur :
la course apparaît automatiquement sur la carte et dans Race settings.

## Lancer le site en local

**Double-clique sur `Start Sport Review.command`** dans le dossier du projet : le serveur démarre
dans une fenêtre Terminal et le site s'ouvre dans ton navigateur. Ferme la fenêtre Terminal pour l'arrêter.

(Alternative : `python3 server.py` dans le terminal de VS Code, puis http://localhost:8000.)

## Paramètre des courses

Chaque course de `data/courses.json` a un nom et un temps officiels, modifiables sur
http://localhost:8000/courses.html (enregistrement automatique en quittant le champ).
Sur GitHub Pages, la page est en lecture seule.

## Confidentialité

Le dépôt est public : les fichiers de `data/garmin/` et les tracés de `data/tracks.json` sont visibles par tous.
N'y mets que des courses (parcours publics), pas d'entraînements qui partent de chez toi.

## Prochaines étapes

- [x] Page Race settings
- [x] Carte des tracés de courses (Track Record)
- [ ] Enregistrer les modifications directement depuis le site en ligne
