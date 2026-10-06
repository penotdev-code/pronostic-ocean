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

## 🚀 Hébergement

Le site tourne sur le VPS (https://petite-sirene.paulpenot.fr) : un petit serveur Node sans dépendance (`server/server.js`) sert les pages et stocke les pronostics dans une base SQLite, avec les mêmes règles de confidentialité que `firestore.rules`.

- **Déploiement automatique** : chaque push sur la branche `claude/ocean-baby-prediction-site-izm4mi` déclenche `.github/workflows/deploy.yml`, qui reconstruit le site sur le VPS (secret `VPS_SSH_KEY`).
- **Capitaine** : son email et l'empreinte de son mot de passe sont dans le `.env` du serveur (`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`), jamais dans le dépôt. Pour générer une empreinte : `echo "mot de passe" | node server/server.js hash-password`.
- **Codes de bouteille** : chaque pronostic reçoit un code unique qui permet au joueur de retrouver ses réponses sur un autre appareil ; le capitaine les voit dans `/stats`.
- **Statistiques détaillées du capitaine** : https://petite-sirene.paulpenot.fr/stats
- **Sauvegardes** : la base est dans le volume Docker `petite-sirene_data`, sauvegardé chaque nuit sur le VPS.

> Firebase reste possible (prioritaire si `firebase` est rempli dans `js/config.js`), mais n'est plus utilisé.

## ⚓ Le jour J

Tout en bas de la page, clique sur l'ancre **⚓** (ou ajoute `#capitaine` à l'adresse), connecte-toi, puis :
- **Pronostics ouverts** : décoche pour fermer les paris (par exemple au début du travail 😉).
- **Date de fin des votes** : fixe un jour et une heure ; le formulaire se ferme tout seul à ce moment-là, et un compte à rebours s'affiche pour les joueurs.
- **Elle est née !** : saisis les vraies infos puis **🎉 Annoncer la naissance** : le récap final apparaît pour tout le monde.
- Tu peux aussi supprimer un pronostic (doublon, blague…).

## 🧪 Tester en local

Avec Node ≥ 22.13 (pour `node:sqlite`) :

```bash
node server/server.js
# puis ouvre http://localhost:3000
```

Sans Node, en mode démo : mettre `api: ""` dans `js/config.js` puis `python3 -m http.server 8000`.
