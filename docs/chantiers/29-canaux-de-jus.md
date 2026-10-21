# Chantier 29 — Canaux de jus

Retours de partie de fin octobre 2026. **Simulation + client**. À lancer **après le chantier 26**
(mêmes règles de carte) ; peut suivre ou précéder le 28.

## Intention du porteur

- « Possibilité de **creuser la pulpe sans forcément Kikiwiwi** pour **guider un flux de jus de
  kiwi et l'étendre**, pour que chaque joueur puisse **rapprocher les sources de jus du centre**
  s'il le souhaite (terraformation minime possible, recherche possible à mener relativement tôt
  dans la Bibliothèque). »

## Réponse du porteur (fin octobre 2026)

**Canal tuile par tuile, disponible dès l'âge d'Éden** : on creuse une tuile de chair voisine du
jus, elle devient du jus.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Terraformation** (`state.terraform`, `Record<hexKey, TerraformKind>`, `sim/titan.ts`,
  `data/titan.ts`, skill `kiwar-titans`) : seuls les Kikiwiwis (âge du Fer) font des travaux de
  titan : fracasser, **source** (une tuile de chair devient une source de jus, 600 jus, 3 h),
  terrasse, aplanir. Plafond de tuiles remodelées par âge : 0 / 0 / 4 / 8.
- `canReshape` (~48-65) refuse une source qui couperait la terre en deux (`splitsLand`, ~70) ;
  à la fin d'un travail, le gisement repart plein, un chemin sur la tuile disparaît,
  `syncPools` recalcule les bassins.
- Les tuiles de jus ne sont pas marchables (`data/tiles.ts` ~65-72). Inondations : un biome
  (le Delta) inonde la chair autour du jus au printemps (`data/biomes.ts`).
- Recherche de l'Éden : cueillette, palissade, cartes du ciel, passage à l'âge de Pierre
  (`data/research.ts`).
- `faceMapOf(state)` donne la carte remodelée : le rendu suit déjà les tuiles changées.

## Proposition

### La technologie « Canaux » (Éden)

- Coût modeste en points de recherche (après Cueillette).
- Débloque l'action **Creuser un canal** sur une tuile de **chair** :
  - voisine d'une tuile de jus (source ou canal déjà creusé) ;
  - sans bâtiment, chemin, obstacle ni chantier ;
  - qui ne coupe pas la terre en deux (`splitsLand`) ni n'isole un bâtiment du Nid.
- Le creusement passe par la **file de construction** et les bâtisseur·euses (chantier 15) :
  pulpe + fibre, environ 1 h de travail par tuile.
- La tuile devient **jus** : récoltable par un puits voisin, non marchable. Un canal tiré
  d'une petite source transporte moins : le gisement d'un canal est plus petit qu'une source
  (par exemple 40 %), et sa repousse dépend de la source à laquelle il est relié (à fixer avec
  le bot).
- **Plafond** : nombre de tuiles de canal par âge (par exemple 3 / 6 / 10 / 15), à part du
  plafond des Kikiwiwis.
- **Combler** un canal (rendre la chair) : même coût, pour corriger une erreur.
- Delta : un canal étend aussi les zones inondables (à afficher avant de creuser).

### Rendu

- Les canaux se dessinent comme du jus, avec des berges creusées et un courant qui coule
  depuis la source (shader de la surface du jus orienté).
- Pendant la pose : la tuile visée, les tuiles de canal possibles en surbrillance, et un
  avertissement si la tuile devient inondable.

## Impact technique

- Simulation (skills `kiwar-titans`, `kiwar-tasks`, `kiwar-ages`) : `TerraformKind` `canal`,
  `canDig`, élément de file `dig`, plafond, gisement du canal, `syncPools`, technologie
  `canals`, inondations ; migration ; tests (`splitsLand`, plafond, combler).
- Serveur : simulation embarquée (`pnpm build:functions`).
- Client : mode « Creuser » (comme les chemins, `PathTools`), aperçu, rendu des canaux, i18n
  FR + EN.
- Bot : creuser vers le Nid quand le jus est loin (mesurer le gain logistique).

## Découpage proposé

1. Simulation : technologie, commande, file, transformation de la tuile, plafond, combler ;
   tests.
2. Client : mode Creuser, aperçu, rendu du canal et du courant.
3. Bot, équilibrage (faces sans jus proche), docs, skills.

## Critères d'acceptation

- Dès l'Éden, on peut amener le jus de trois tuiles vers le Nid.
- Jamais de terre coupée en deux ni de bâtiment isolé.
- Le gain se voit dans la logistique du puits ; le rapport d'équilibrage reste à ±10 %.

## Questions ouvertes

1. Le canal a-t-il son propre gisement (plus petit, proposé) ou partage-t-il celui de la
   source ?
2. Coût en pulpe et fibre, ou aussi en jus ?
3. Un pont sur un canal (avec un chemin) pour que les kiwis le traversent ?
4. Plafond par âge : 3 / 6 / 10 / 15 (proposé) ?
