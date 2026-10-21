# Chantier 26 — Bâtiments sur plusieurs tuiles

Retours de partie de fin octobre 2026. **Simulation + client**, gros changement de la carte. À
lancer **après le chantier 25** (et donc après le 19).

## Intention du porteur

- « Certains bâtiments comme l'**aire d'envol** doivent **prendre plus de place qu'une seule
  tuile**, et **apparaître plus gros**. Surtout pour les bâtiments importants. **Force le joueur
  à gérer son espace.** »

## Réponse du porteur (fin octobre 2026)

- **3 tuiles** (un triangle de trois hexagones) pour les importants : aire d'envol,
  Bibliothèque, École, laboratoire, Mairie (chantier 27), entrepôt.
- **7 tuiles** (un hexagone complet) pour le **monument**.
- Les producteurs (pulperie, atelier à fibre, puits, carrière), les huttes, les tourelles et
  le Nid restent sur une tuile.

## État actuel (code)

- Grille hexagonale axiale (q, r), pointe en haut (`packages/shared/src/hex/hex.ts`) ; clés
  `"q,r"` ; `FaceMap` a `tiles` et un `index`.
- `state.buildings: Building[]` avec `{id, type, q, r, level, …}` (`sim/state.ts`). **Chaque
  bâtiment occupe une seule tuile.** `buildingAt` est une recherche linéaire sur q/r
  (`sim/selectors.ts` ~43).
- Validité de pose : `siteError` (`sim/describe.ts` ~240-256) : type de tuile, bâtiment ou
  chantier déjà là, obstacle, titan au travail, cratère, inondation, rempart pour les
  tourelles ; `buildLock` côté client (`game/placement.ts`). Les commandes de construction
  revérifient (`sim/commands.ts` ~659, 679).
- Utilisateurs de « une tuile = un bâtiment » : `buildingAt`/`queuedBuildAt` et leurs
  appelants, zones de récolte (`catchmentPlan`, `sim/territory.ts`), obstacles, chemins et
  recherche de chemin (Dijkstra), dégâts des vagues, terraformation, picking 3D,
  `BuildingsView`, le fantôme de pose (chantier 16), les enseignes (`render/signs.ts`), la face
  d'un·e ami·e, le bot.

## Proposition

### Règles

- Donnée `footprint` par type : `1`, `3` ou `7`. Le bâtiment garde une **tuile d'ancrage**
  (q, r) et une **orientation** (0-5 pour le triangle) ; ses tuiles se calculent
  (`footprintTiles(b)`).
- Toutes les tuiles doivent être constructibles (même règle de type de tuile, sans obstacle,
  hors inondation…). Les tuiles couvertes ne se récoltent pas et ne portent pas de chemin.
- La marche contourne le bâtiment ; les kiwis entrent par la tuile d'ancrage.
- **Index d'occupation** (`Map<HexKey, buildingId>`) mis en cache par état, comme les autres
  caches partagés (remplacé, jamais muté) : `buildingAt` devient O(1).
- Pose : le fantôme couvre ses tuiles ; une touche (R) ou un bouton tourne le triangle ; sur
  téléphone, un bouton « Tourner ».
- Gros bâtiments **plus gros à l'écran** : modèles redessinés à l'échelle de leur empreinte
  (aire d'envol avec piste, Bibliothèque avec ailes, monument monumental).

### Sauvegardes existantes

- Proposé : à la migration, chaque gros bâtiment cherche une orientation dont les tuiles sont
  libres et s'y étend ; s'il n'en trouve pas, il reste **sur une tuile** (marqué
  « à l'étroit ») jusqu'à sa prochaine amélioration, qui demande de libérer la place.
  Jamais de bâtiment détruit par la migration.

## Impact technique

- Simulation (skills `kiwar-sim`, `kiwar-titans`, `kiwar-tasks`) : données des bâtiments,
  `Building.rot`, `footprintTiles`, index d'occupation, `siteError`, commandes (`build`,
  `queueBuild`, démolition qui libère toutes les tuiles), territoire et chemins, dégâts,
  terraformation (`splitsLand` doit compter les bâtiments), migration de schéma, tests.
- Serveur : la simulation embarquée (`pnpm build:functions`) ; protocole de la commande de
  construction (orientation). Pas de SQL a priori (l'état est en JSON).
- Client : fantôme multi-tuiles, rotation, picking (toute tuile couverte sélectionne le
  bâtiment), modèles plus grands, enseignes, zones, face d'un·e ami·e.
- Bot : choisir un emplacement à trois tuiles sans gâcher les gisements (skill
  `kiwar-balance`).

## Découpage proposé

1. Simulation : empreinte, orientation, index d'occupation, `siteError`, commandes, marche,
   migration ; tests (pose, démolition, collisions, migration d'une vieille sauvegarde).
2. Client : fantôme multi-tuiles et rotation, picking, zones.
3. Modèles agrandis (aire d'envol, Bibliothèque, École, laboratoire, entrepôt, monument).
4. Bot, équilibrage, captures desktop + téléphone, docs, skills.

## Critères d'acceptation

- L'aire d'envol occupe trois tuiles et se voit de loin ; le monument en occupe sept.
- Une vieille sauvegarde se charge sans perdre de bâtiment.
- On ne peut pas poser un gros bâtiment à cheval sur un obstacle, un gisement occupé ou le
  jus.
- Le rapport d'équilibrage reste à ±10 %.

## Questions ouvertes

1. Migration : extension automatique, et « à l'étroit » sinon (proposé), ou rembourser et
   demander de reconstruire ?
2. L'entrepôt sur 3 tuiles dès le niveau 1, ou seulement à partir du niveau 3 ?
3. Le Nid (cœur de la colonie) reste-t-il sur une tuile ?
4. Les tuiles couvertes d'un gisement : gisement perdu, ou on interdit la pose sur un gisement
   riche ?
