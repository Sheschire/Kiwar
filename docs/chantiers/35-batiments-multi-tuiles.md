# Chantier 35 — Bâtiments sur plusieurs tuiles

Acte II « La guerre des faces » du [carnet de route](../CARNET_DE_ROUTE.md) (ex-chantier 26,
adapté). **Simulation + client + bot**, gros changement de la carte. À lancer **après le 30**
(niveaux 1–12) et **le 33** (kit de modèles par âge). Il passe **avant le moteur de bataille
(36)**, qui a besoin des empreintes pour la marche et les positions.

**Skills à charger** : `kiwar-sim`, `kiwar-titans` (carte remodelée), `kiwar-client` (+
`kiwar-tasks` pour les postes, `kiwar-balance` pour la partie 4).

## Intention du porteur

- « Certains bâtiments comme l'**aire d'envol** doivent **prendre plus de place qu'une seule
  tuile**, et **apparaître plus gros**. Surtout pour les bâtiments importants. **Force le joueur
  à gérer son espace.** »

## Décisions déjà prises

- **3 tuiles** (un triangle de trois hexagones) : aire d'envol, Bibliothèque, École, laboratoire,
  entrepôt (dès le niveau 1), et les futurs camp d'entraînement (37), Forge (38), Mairie (43) et
  cabaret (44).
- **7 tuiles** (un hexagone complet) : le **monument**.
- **1 tuile** : le Nid, les producteurs (pulperie, atelier à fibre, puits, carrière), les huttes,
  les tourelles, et les futurs feu de camp et décorations.
- Questions de l'ancien chantier 26, tranchées par défaut (modifiables) :
  1. **Migration** : chaque gros bâtiment cherche une orientation dont les tuiles sont libres et
     s'y étend. S'il n'en trouve pas, il reste sur une tuile, marqué « à l'étroit », jusqu'à sa
     prochaine amélioration, qui demande de libérer la place. Aucun bâtiment n'est détruit ni
     remboursé.
  2. **Entrepôt** sur 3 tuiles dès le niveau 1.
  3. **Le Nid** reste sur une tuile.
  4. **Gisement couvert** : la pose est permise, mais le gisement devient inutilisable ; le
     fantôme l'annonce en rouge avec la récolte perdue.

## État actuel (code)

- La grille est hexagonale axiale (q, r), pointe en haut (`packages/shared/src/hex/hex.ts`). Les
  clés sont `"q,r"` ; `FaceMap` a `tiles` et un `index`.
- `state.buildings: Building[]` contient `{id, type, q, r, level, …}` (`sim/state.ts`). **Chaque
  bâtiment occupe une seule tuile.** `buildingAt` fait une recherche linéaire sur q/r
  (`sim/selectors.ts` ~43).
- Validité de la pose : `siteError` (`sim/describe.ts` ~240-256) vérifie le type de tuile, un
  bâtiment ou un chantier déjà là, un obstacle, un titan au travail, un cratère, une inondation,
  et le rempart pour les tourelles. Côté client, c'est `buildLock` (`game/placement.ts`). Les
  commandes de construction revérifient (`sim/commands.ts` ~659, 679).
- Tout ce qui suppose « une tuile = un bâtiment » :
  - `buildingAt` / `queuedBuildAt` et leurs appelants ;
  - les zones de récolte (`catchmentPlan`, `sim/territory.ts`), les obstacles ;
  - les chemins et la recherche de chemin (Dijkstra) ;
  - les dégâts des vagues, la terraformation (`splitsLand`) ;
  - côté client : le picking 3D, `BuildingsView`, le fantôme de pose (chantier 16), les
    enseignes (`render/signs.ts`), la face d'un·e ami·e ;
  - le bot.

## Proposition

### Règles

- Une donnée `footprint` par type : `1`, `3` ou `7`. Le bâtiment garde une **tuile d'ancrage**
  (q, r) et une **orientation** (0-5 pour le triangle) ; `footprintTiles(b)` calcule ses tuiles.
- Toutes les tuiles doivent être constructibles : même type de tuile, sans obstacle, hors
  inondation… Les tuiles couvertes ne se récoltent pas et ne portent pas de chemin.
- La marche contourne le bâtiment ; les kiwis entrent par la tuile d'ancrage.
- Un **index d'occupation** (`Map<HexKey, buildingId>`) est mis en cache par état, comme les
  autres caches partagés (remplacé, jamais muté) : `buildingAt` devient O(1). Le moteur de
  bataille (36) s'en servira pour la marche des unités.
- Pose : le fantôme couvre toutes ses tuiles. La touche R ou un bouton tourne le triangle ; sur
  téléphone, il y a un bouton « Tourner » dans la barre de pose.
- Les modèles des gros bâtiments sont redessinés à l'échelle de leur empreinte, avec le kit du
  33 : aire d'envol avec piste, Bibliothèque avec ailes, monument monumental.

## Impact technique

- Simulation (skills `kiwar-sim`, `kiwar-titans`, `kiwar-tasks`) :
  - données des bâtiments, `Building.rot`, `footprintTiles`, index d'occupation, `siteError` ;
  - commandes : `build`, `queueBuild`, et la démolition qui libère toutes les tuiles ;
  - territoire et chemins, dégâts, terraformation (`splitsLand` compte les bâtiments) ;
  - migration de schéma, tests.
- Serveur : la simulation embarquée (`pnpm build:functions`) et le protocole de la commande de
  construction (orientation). Pas de SQL (l'état est en JSON).
- Client : fantôme multi-tuiles et rotation, picking (toute tuile couverte sélectionne le
  bâtiment), modèles plus grands, enseignes, zones, face d'un·e ami·e.
- Bot : choisir un emplacement à trois tuiles sans gâcher les gisements (skill `kiwar-balance`).

## Découpage proposé

1. Simulation : empreinte, orientation, index d'occupation, `siteError`, commandes, marche,
   migration. Tests : pose, démolition, collisions, migration d'une vieille sauvegarde.
2. Client : fantôme multi-tuiles et rotation (desktop et téléphone), picking, zones.
3. Modèles agrandis : aire d'envol, Bibliothèque, École, laboratoire, entrepôt, monument.
4. Bot, équilibrage (sondes ciblées), captures desktop + téléphone, docs, skills.

## Critères d'acceptation

- L'aire d'envol occupe trois tuiles et se voit de loin ; le monument en occupe sept.
- Une vieille sauvegarde se charge sans perdre de bâtiment.
- On ne peut pas poser un gros bâtiment à cheval sur un obstacle, le jus ou un chantier. Le
  fantôme avertit avant de couvrir un gisement.
- Le rapport d'équilibrage reste à ±10 % entre Kiwisu et Kiwino.
