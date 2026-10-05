# 🐚 Pronostics de la petite sirène

Un site de pronostics de naissance sur le thème de l'océan, à partager avec la famille et les amis.

## ✨ Ce qu'il y a dedans

- **La surface** : un compte à rebours jusqu'au terme, avec vagues, soleil et nuages animés.
- **🍾 Ta bouteille à la mer** : le formulaire de pronostic avec un avatar marin à choisir. On y donne la date (avec un calendrier où le terme est marqué 🎯), l'heure, le poids, la taille, les cheveux, la ressemblance, où seront papa et maman au début du travail, le prénom en bonus et un petit mot pour bébé.
- **🌊 Les courants de l'équipage** : les statistiques anonymes en direct (date moyenne, heure moyenne, poids moyen, histogramme des dates, prénoms les plus proposés…).
- **💌 Ton mot doux** : chacun peut relire le sien ; seuls les parents lisent tous les mots doux.
- **🧭 Le tableau de bord du capitaine** (visible seulement par les parents) : tous les pronostics avec les noms, triables et exportables en CSV, les statistiques détaillées (qui a répondu quoi, les extrêmes) et tous les mots doux.

### 🔒 Qui voit quoi

| | Avant d'avoir joué | Après avoir joué | Après la naissance | Capitaine |
|---|---|---|---|---|
| Réponses de chaque joueur | 🔒 | 🔒 | dans le récap final | tout |
| Statistiques | 🔒 caché | anonymes | anonymes | détaillées avec les noms |
| Mots doux des autres | 🔒 | 🔒 | 🔒 | tous |

Ces règles sont appliquées par la base de données elle-même (`firestore.rules`), pas seulement masquées à l'écran : un joueur malin ne peut pas les contourner.
- **🎉 Le récap final** : une fois la naissance annoncée, la fiche de naissance, ce que chacun avait vu juste, les trophées des plus proches et les pronostics de tout le monde comparés à la réalité.
- Une jauge de profondeur qui descend jusqu'à la fosse des Mariannes quand on fait défiler la page, des bulles, des poissons qui passent (clique dessus !) et quelques surprises cachées 🧰 (indice : le coffre au fond de la mer, et le mot `sirene` tapé au clavier).

### Sans points, sans pression

Il n'y a ni points ni classement : on joue pour le plaisir. À la naissance, le récap montre à chacun pour quelles questions il avait vu juste (ou presque), les trophées de ceux qui étaient le plus proches, et les pronostics de tout le monde comparés à la réalité.

## ⚙️ Personnaliser

Tout se règle dans **`js/config.js`** : les noms des parents, le surnom de bébé, la **date du terme**, l'activation du jeu « devine le prénom », l'email du capitaine.

## 🚀 Mettre en ligne (gratuit)

Sans configuration, le site fonctionne en **mode démo** : chaque visiteur ne voit que ses propres pronostics. Pour que tout le monde partage les mêmes données, on utilise **Firebase** (gratuit pour cet usage).

### 1. Créer la base de données

1. Va sur <https://console.firebase.google.com> → **Ajouter un projet** (Google Analytics inutile).
2. Menu **Build › Firestore Database** → **Créer une base de données** → mode production, région `europe-west`.
3. Onglet **Règles** : colle le contenu du fichier [`firestore.rules`](firestore.rules) puis **Publier**.
   (Si l'email du capitaine n'est pas `penot.dev@gmail.com`, change-le dans ce fichier.)
4. Menu **Build › Authentication** → **Commencer** → onglet **Mode de connexion** :
   - active **Anonyme** (les invités n'ont pas de compte à créer : c'est ce qui permet de savoir qui a déjà joué) ;
   - active **Adresse e-mail/Mot de passe**, puis onglet **Utilisateurs** → **Ajouter un utilisateur** avec l'email du capitaine et un mot de passe.
5. ⚙️ **Paramètres du projet** → **Vos applications** → icône **Web `</>`** → enregistre l'appli,
   puis copie l'objet `firebaseConfig` dans la partie `firebase` de `js/config.js`.

> Les clés Firebase d'une appli web ne sont pas secrètes : c'est normal qu'elles soient visibles. La sécurité est assurée par les règles Firestore (voir « Qui voit quoi » plus haut).

### 2. Héberger le site

**Option A — GitHub Pages** (le workflow est déjà prêt dans `.github/workflows/pages.yml`)
1. Fusionne cette branche dans `main`.
2. Sur GitHub : **Settings › Pages › Source : GitHub Actions**.
3. Le site sera publié sur `https://<ton-compte>.github.io/pronostic-ocean/`.
4. Dans Firebase › Authentication › **Paramètres › Domaines autorisés**, ajoute `<ton-compte>.github.io`.

> GitHub Pages sur un dépôt privé nécessite un compte payant. Sinon, utilise l'option B.

**Option B — Firebase Hosting**
```bash
npm install -g firebase-tools
firebase login
firebase use --add        # choisis ton projet
firebase deploy           # publie le site + les règles Firestore
```
Le site sera sur `https://<ton-projet>.web.app`.

## ⚓ Le jour J

Tout en bas de la page, clique sur l'ancre **⚓** (ou ajoute `#capitaine` à l'adresse), connecte-toi, puis :
- **Pronostics ouverts** : décoche pour fermer les paris (par exemple au début du travail 😉).
- **Date de fin des votes** : fixe un jour et une heure ; le formulaire se ferme tout seul à ce moment-là, et un compte à rebours s'affiche pour les joueurs.
- **Elle est née !** : saisis les vraies infos puis **🎉 Annoncer la naissance** : le récap final apparaît pour tout le monde.
- Tu peux aussi supprimer un pronostic (doublon, blague…).

## 🧪 Tester en local

```bash
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```

En mode démo, n'importe quel email et mot de passe ouvrent l'espace capitaine ⚓, pour pouvoir tout essayer.
