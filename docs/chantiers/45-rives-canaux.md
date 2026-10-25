# Chantier 45 — Rives fertiles et canaux de jus

Acte III « Le village vivant » du [carnet de route](../CARNET_DE_ROUTE.md) (ex-chantier 29,
élargi aux rives). **Simulation + client + bot.** Après le **35** (mêmes règles de carte). Après le
44 (pas en parallèle : deux chantiers de simulation se gênent).

**Skills à charger** : `kiwar-titans`, `kiwar-world`, `kiwar-tasks` (+ `kiwar-balance` à la fin).

## Intention du porteur

- « La végétation doit être plus belle et luxuriante autour des rivières de jus, comme un
  ruisseau qui fait pousser de plus belles fleurs. En plus, cela apportera un meilleur
  renouvellement des ressources. »
- « Possibilité de creuser la pulpe sans forcément de Kikiwiwi pour guider un flux de jus et
  l'étendre, pour rapprocher les sources de jus du centre (terraformation minime, recherche
  relativement tôt dans la Bibliothèque). »

## Décisions déjà prises

- **Canal tuile par tuile, disponible dès l'âge d'Éden** (fin octobre 2026) : on creuse une tuile
  de chair voisine du jus, et elle devient du jus.
- Les canaux étendent aussi les **rives fertiles** : chaque canal a donc deux intérêts,
  logistique et repousse.
- Les questions de l'ancien chantier 29 sont tranchées par défaut (modifiables) :
  1. **Gisement** : un canal a son propre gisement, plus petit qu'une source (environ 40 %).
  2. **Coût** : pulpe et fibre.
  3. **Pont** : pas de pont pour l'instant ; un canal ne doit jamais couper la terre.
  4. **Plafond** par âge : 3 / 6 / 10 / 15 tuiles.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Terraformation** (`state.terraform`, `sim/titan.ts`, `data/titan.ts`, skill `kiwar-titans`)
  : seuls les Kikiwiwis (âge du Fer) font des travaux de titan.
- **Garde-fous** : `canReshape` (~48-65) et `splitsLand` (~70) empêchent de couper la terre.
- **Bassins** : `syncPools` recalcule les bassins.
- **Carte** : `faceMapOf(state)` donne la carte remodelée, et le rendu suit.
- **Tuiles de jus** : non marchables (`data/tiles.ts` ~65-72).
- **Delta** : inondations au printemps (`data/biomes.ts`).
- **Repousse des gisements** : `data/territory.ts:17-24`. Pas de bonus près du jus.

## Proposition (à chiffrer en début de session)

- **Rives fertiles** : une tuile de chair ou de bosquet voisine du jus repousse plus vite (+30 %
  environ). Elle est plus belle : fleurs, herbes hautes, papillons, avec les lumières sobres du
  chantier 23. On voit l'effet dans la fiche de la tuile et pendant la pose (chantier 16).
- **Technologie « Canaux »** (Éden, après Cueillette, coût modeste) : l'action **Creuser un canal**
  porte sur une tuile de chair :
  - voisine du jus ;
  - sans bâtiment, chemin, obstacle ni chantier ;
  - qui ne coupe pas la terre et n'isole pas un bâtiment.
    Le creusement passe par la **file de construction** et les bâtisseur·euses (environ 1 h par
    tuile). On peut **combler** un canal au même coût.
- Delta : un canal étend les zones inondables ; c'est affiché avant de creuser.
- Rendu : des canaux comme du jus, avec des berges et un courant qui coule depuis la source. Un
  mode « Creuser » comme les chemins (`PathTools`).

## Découpage proposé

1. Rives fertiles : repousse et rendu ; tests.
2. Canaux : technologie, commande, file, transformation de la tuile, plafond, combler ; tests
   (`splitsLand`, plafond).
3. Client : mode Creuser, aperçu, rendu des canaux et des rives.
4. Bot (creuser vers le Nid quand le jus est loin), équilibrage (faces sans jus proche), docs,
   `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- Les bords des rivières de jus sont luxuriants et repoussent plus vite, et ça se voit.
- Dès l'Éden, on peut amener le jus de trois tuiles vers le Nid, sans jamais couper la terre.
- Le gain se voit dans la logistique et la repousse ; rapport à ±10 % entre les faces.

## Réalisé (octobre 2026)

Réponse du porteur en début de session : dans un biome inondable, un canal qui rendrait
inondable une tuile bâtie est **refusé** ; la pose montre les tuiles qui deviendraient
inondables.

- **Rives fertiles** : une tuile de chair ou de bosquet voisine du jus (rivière, source d'un
  Kikiwiwi, canal) repousse **+30 %**. On le lit dans la fiche de la tuile (« Rive fertile ») et
  pendant la pose d'un producteur (« dont N rives fertiles »). En 3D : herbes hautes, fleurs et
  papillons de jour (pas l'hiver).
- **Technologie Canaux** (Éden, économie, 40 points, **après Cueillette**) : le mode
  **Creuser** (bouton à gauche des chemins, entrée « Canaux » du menu téléphone) éclaire les
  tuiles creusables ; un toucher creuse. Une tuile de chair libre, voisine du jus **ou d'un
  canal déjà commandé** (on peut commander une chaîne d'un coup) ; jamais une tuile qui couperait
  la terre (même à la crue), isolerait un puits ou noierait un bâtiment au printemps.
- Le creusement passe par la file et les bâtisseur·euses : **80 pulpe + 40 fibre, 1 h** par
  tuile, remboursé à l'annulation ; **combler** coûte pareil (fiche de la tuile) et rend la
  chair avec un gisement plein.
- Un canal est du jus : petit gisement (**40 %** d'une rivière), on peut y poser un puits ou un
  camp, il crée ses propres rives fertiles. Le courant coule depuis la source, des pierres plates
  bordent ses berges. Plafond **3 / 6 / 10 / 15** tuiles par âge, à part du quota des Kikiwiwis.
- Le bot cherche Canaux après le passage à la Pierre et creuse vers les dépôts quand le jus est
  loin, sinon là où des tuiles récoltées deviennent des rives (mécanique `canals` de
  `--impact`).

Reste : un pont (refusé pour l'instant), le spectacle du creusement (une simple pioche), et le
ressenti à jouer avec le porteur (le +30 % des rives, le prix d'un canal, le plafond de l'Éden).
