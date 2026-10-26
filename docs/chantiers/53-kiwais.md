# Chantier 53 — Les kiwaïs : petites planètes en orbite

Acte IV « Au-delà » du [carnet de route](../CARNET_DE_ROUTE.md) (section 9, « Les kiwaïs »).
**Simulation + serveur + client + bot.** Après le **51** (Âge des étoiles). Il peut venir avant
ou après le 52, mais jamais en même temps (deux chantiers de simulation). Il ouvre un domaine :
il crée le skill **`kiwar-orbit`**.

**Skills à charger** : `kiwar-design`, `kiwar-sim`, `kiwar-sky` (comètes, poussière),
`kiwar-expeditions` (vaisseaux, pannes), `kiwar-world` (espace), `kiwar-client`.

## Intention du porteur

« Le kiwaï (_Actinidia arguta_) est un mini-kiwi lisse qu'on mange entier : le modèle idéal
des **petites planètes artificielles** qu'on lance en orbite aux derniers âges. Chacune est une
base spatiale avec un peu de place, une ressource propre et un risque (pannes, comètes). »
(carnet, section 9)

## Décisions déjà prises

1. **Une petite carte en orbite dans l'état de la colonie** (porteur, 26 octobre 2026) :
   - une mini-face d'une vingtaine de tuiles (disque hexagonal de rayon 2, soit 19 tuiles) ;
   - une ressource propre et des risques (pannes, comètes) ;
   - quelques modules à bâtir ; on y envoie des kiwis par navette ;
   - **pas de troisième état de jeu** (contrairement à la seconde colonie).
2. Ils arrivent à **l'Âge des étoiles** (51). Défaut de Claude : 1 kiwaï au niveau 13 du
   chantier orbital, 2 au 14, 3 au 15.
3. Toute menace en orbite est annoncée et a au moins deux parades (charte 4). Un kiwaï
   n'est jamais perdu entièrement : un module abîmé se répare.

## État actuel (code)

- **Une carte = une face** : `faceMapOf(state)` (`sim/territory.ts` ~78), `buildingAt` /
  `occupancy(state)` (`sim/footprint.ts`). Tout suppose aujourd'hui **une seule carte par
  état**. C'est le gros du travail : un champ de site (`Building.site`, ou une carte par
  kiwaï) à trancher en session, avec un test qui empêche de confondre les cartes.
- **Comètes** : le calendrier, les tuiles de poussière, `STARDUST.cap` 50 (`data/comets.ts`,
  skill `kiwar-sky`).
- **Pannes** : la fiabilité des vaisseaux et `SHIP_REPAIR` (la meilleure Dextérité ;
  `data/expeditions.ts`).
- **Espace** : `render/space.ts` (places fixes : la jumelle à `TWIN_DISTANCE` 120, les membres
  sur `ALLY_RING` 210, les comètes à 340), `CameraRig.visit` / `flyTo`,
  `GameRenderer.travelTo`, le niveau de détail de `render/twin.ts`.
- **Livraisons** : `sendCargo` (`sim/deliveries.ts`) pour une navette de ressources.
- **Graines géantes et cristal** : chantier 50.

## Proposition (point de départ)

- **Chantier orbital** (un bâtiment de l'Âge des étoiles, sur 3 tuiles) : il lance un kiwaï
  pour un **noyau** (graines géantes), du cristal, du fer et de la poussière, en 12 à 24 h.
- **Un type par kiwaï**, choisi au lancement :
  - **Moisson d'étoiles** : capte la poussière d'étoile en continu, plafond propre ;
  - **Serre** : du jus et de la fibre au soleil, sans saison ;
  - **Observatoire** : des points de recherche, et il annonce plus tôt les comètes et les
    remontées ;
  - **Quai** : un relais pour les trous de ver (54), qui raccourcit les voyages.
- **Modules** : 3 à 5 emplacements par kiwaï, avec des bâtiments propres de 1 tuile (habitat,
  capteur, panneau, dôme de serre). Chaque kiwaï prend un petit quota de kiwis (ils ne sont plus
  à la surface).
- **Navette** : un aller-retour court (30 min) depuis le chantier orbital, sur le modèle des
  livraisons.
- **Risques** :
  - **pannes** : un module tombe en panne selon sa fiabilité ; un·e mécanicien·ne (Dextérité)
    sur place le répare ; sinon il s'arrête, sans perte ;
  - **comètes** : un essaim annoncé au calendrier des comètes. Parades : relever le bouclier
    (de la poussière), évacuer par la navette, ou réparer ensuite.
- **Rendu** : des petites sphères lisses vert-bronze en orbite autour de notre moitié, avec un
  zoom pour y bâtir (le même rendu de tuiles, en petit) et la navette qui fait l'aller-retour.

## Grille de décision (kiwar-design)

- **Boucles** : économie (une ressource propre), expansion contre sécurité (les kiwis en
  orbite), retour (des pannes réparables).
- **Robinets et puits** : la moisson d'étoiles rend la poussière moins rare. Il faut
  vérifier qu'elle ne rend pas les comètes inutiles (le plafond propre, un débit modeste).
- **Décisions créées** : quel type de kiwaï, qui envoyer en orbite, relever le bouclier ou
  évacuer.
- **Absence** : une panne arrête un module (stagnation) ; une comète non parée abîme sans
  détruire.
- **Mesure** : le premier kiwaï (cible ~jour 22–24), les pannes non réparées, « au plafond » de
  la poussière.

## Découpage proposé

1. **Plusieurs cartes** : le site d'un bâtiment, `occupancy` et `faceMapOf` par carte, la
   sauvegarde ; tests (rien ne change à la surface).
2. **Chantier orbital et lancement** : le noyau, les types, la mini-carte ; tests.
3. **Modules, navette et kiwis en orbite** : les tâches dans `sim/tasks.ts` ; tests
   d'exactitude.
4. **Risques** : pannes, comètes, bouclier, évacuation ; tests.
5. **Client** : les kiwaïs dans l'espace, le zoom et la pose, la navette, l'i18n, `MobileNav` ;
   captures.
6. **Bot, sondes, docs** : création du skill `kiwar-orbit`, `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- À l'Âge des étoiles, on lance un kiwaï, on y bâtit des modules et on y envoie des kiwis.
- Chaque risque en orbite est annoncé et a deux parades ; rien n'est perdu entièrement.
- La surface n'est pas changée par le multi-carte (tests et temps du bot identiques).
- Les deux colonies savent lancer des kiwaïs (règle des deux colonies, skill
  `kiwar-colonies`).
