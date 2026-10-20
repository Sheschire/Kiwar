# Chantier 16 — Pose et terrain lisibles

Retours de partie de fin octobre 2026 : on ne comprend pas qu'un bâtiment agit sur les tuiles
autour de lui, et le gain affiché au dépôt n'est pas parlant.

## Intention du porteur

- « En sélectionnant la construction d'un bâtiment depuis l'écran des bâtiments, un **modèle
  translucide** doit léviter sous la souris jusqu'à ce qu'on le dépose, avec **en surbrillance
  les cases qui seront affectées** par le bâtiment. »
- « Il faut des **animations un peu visibles des terrains affectés** par une construction, pour
  qu'on comprenne qu'un bâtiment a un effet sur les tuiles qui l'entourent. Personnellement,
  j'avais commencé à coller les bâtiments parce que je ne savais pas. »
- La ressource s'affiche en « X/h » au moment du dépôt au Nid : ce n'est pas intuitif, il faut
  plutôt une quantité dans l'unité de la ressource.

## État actuel (code)

- **Pose** (`startGame.tsx` → `GameRenderer.setPlacement` → `selection.setPlacement`) : les tuiles
  valides s'allument en jaune ; pour un producteur, chaque tuile est teintée selon l'**efficacité
  logistique** (chantier 12, `logisticsBadges.ts`), et seule la tuile survolée affiche son %.
  **Il n'y a pas de modèle fantôme** sous le pointeur.
- **Zone de récolte** : rayon 1/1/2/2/2/3 selon le niveau (`data/territory.ts`). Elle n'est
  montrée qu'une fois le bâtiment construit et sélectionné (`refreshCatchment`). Pendant la pose,
  seule la portée des **tourelles** est montrée (chantier 12).
- **« +N/h » au dépôt** (`render/kiwis.ts`, `showDrop`) : le débit horaire du bâtiment divisé par
  l'équipe. C'est une valeur par heure, pas ce que le kiwi rapporte, et elle ignore les
  météorites.

## Proposition

### Modèle fantôme

- Pendant la pose (menu de construction ou écran Plans), le **vrai modèle du bâtiment**, au
  niveau 1 et translucide (≈ 50 %, teinte légère), suit le pointeur au-dessus de la tuile
  survolée en lévitant doucement.
  - Il passe au vert sur une tuile valide et au rouge sinon, avec la raison (« occupé », « pas de
    gisement »).
  - Sur téléphone, il n'y a pas de survol : un premier tap pose le fantôme, on le déplace en
    glissant, et un bouton « Construire ici » confirme.
- Il réutilise les géométries mises en cache (`buildingModels.ts`) avec un matériau transparent
  partagé : aucun coût notable.

### Tuiles affectées, pendant la pose et après

- Pendant la pose, la **zone de récolte** autour du fantôme s'allume :
  - les tuiles de la bonne ressource en vert pulsé ;
  - les tuiles **déjà prises** par un autre bâtiment hachurées ou en gris, avec « déjà récoltée
    par la Pulperie » ;
  - le total du gisement couvert (« 3 tuiles de chair, 1 800 pulpe »).
- Ça rend visible pourquoi coller deux pulperies est une mauvaise idée.
- **Animation à la fin d'une construction** : une onde part du bâtiment et parcourt les tuiles
  de sa zone (ou de sa portée) ; les tuiles « s'éveillent » (petites pousses, reflets).
- **Calque « zones »** (bouton de l'écran Plans ou de la barre) : il colore toutes les zones de
  récolte et les recouvrements.

### Gains au dépôt en unités

- Le dépôt affiche ce que le kiwi rapporte : **« +3 pulpe »** (icône de la ressource), calculé
  comme le débit de ce kiwi (sa `workerPower`, pas une part égale) × la durée de son aller-retour.
  La somme des dépôts sur une heure retombe sur le débit réel.
- Le débit horaire reste dans le panneau du bâtiment et dans le tableau des postes.

## Impact technique

- Client seulement : `GameRenderer`, `selection.ts`, `buildings.ts` (fantôme), `kiwis.ts` et
  `dropLabels.ts`, `startGame.tsx` (pose sur téléphone), i18n.
- Une fonction partagée qui calcule la **zone de récolte prévue** à une position donnée, à partir
  de la logique de `sim/territory.ts` (sans dupliquer les règles).
- Peu de risque de conflit avec la simulation : ce chantier peut tourner en parallèle du 15.
  Il faut se coordonner avec l'audit d'optimisation (pas de nouveau matériau par tuile :
  instancing ou une seule texture de calque).

## Découpage proposé

1. **Gains au dépôt en unités** (petit, rapide).
2. **Modèle fantôme** sous le pointeur, pose en deux temps sur téléphone.
3. **Zone de récolte prévue** pendant la pose (recouvrements, total du gisement).
4. **Onde de fin de construction** et calque « zones ».
5. Captures desktop et téléphone, docs, skill `kiwar-client`.

## Critères d'acceptation

- Avant de poser un producteur, on voit les tuiles qu'il va récolter et celles déjà prises.
- Le gain au dépôt se lit dans l'unité de la ressource.
- Images/s inchangées pendant la pose (mesure `?debug` avant/après).

## Questions ouvertes

1. Sur téléphone : pose en deux temps (tap puis « Construire ici »), ou glisser-déposer
   directement depuis le menu ?
2. Le calque « zones » : bouton permanent dans la barre, ou seulement dans l'écran Plans ?
3. L'onde de fin de construction : un son ?

## Réponses du porteur aux questions ouvertes (octobre 2026)

1. Sur téléphone, **pose en deux temps** : un tap pose le fantôme (un autre le déplace), le
   bouton « Construire ici » confirme. Le glisser d'un doigt reste à la caméra.
2. Le calque « zones » est **fusionné avec le bouton Logistique** (touche O).
3. L'onde a un **son discret** (`build.awaken`, remplaçable depuis `/admin`).
4. (Question ajoutée) Le dépôt affiche **un nombre et l'icône** de la ressource.

## Réalisé

- **Partie 1** : chaque dépôt affiche « +0,4 » et l'icône de la ressource, c'est-à-dire ce
  que ce kiwi a récolté depuis son dépôt précédent (sa puissance de travail, pas une part
  égale). La somme d'une heure retombe sur le débit réel.
- **Partie 2** : pendant la pose, le modèle du bâtiment (niveau 1, habillage de l'âge) lévite,
  translucide, au-dessus de la tuile visée. Il est vert si on peut construire, rouge sinon,
  avec la raison dans le bandeau (« à poser sur chair »). Sur téléphone, c'est la pose en deux
  temps.
- **Partie 3** : autour du fantôme, les tuiles qu'il récoltera pulsent en vert et celles déjà
  prises sont grises. Le bandeau résume : « Récoltera 3 tuile(s) de chair : 1 800 pulpe en
  réserve », « 1 tuile(s) à portée déjà prise(s) : Cueillerie ». La fonction partagée
  `catchmentPlan` reprend les règles de la simulation.
- **Partie 4** :
  - À la fin d'une construction ou d'une amélioration, une onde part du bâtiment et allume
    les tuiles de sa zone, de proche en proche, avec quelques pousses. Pour une tourelle, c'est
    son rempart. Elle est accompagnée d'un petit carillon.
  - Le calque Logistique (touche O) colore aussi la zone de chaque producteur et cercle de
    sombre les tuiles à portée de plusieurs producteurs.
- **Bonus** : sur téléphone, la tuile touchée pendant la pose affiche son % de logistique (et
  la portée d'une tourelle). C'était une dette du chantier 12.
- **Mesures** (Chromium sans GPU) : images/s identiques pendant la pose, à la précision près
  (≈ 7 images/s en rendu logiciel, avant comme après). Le JS par image passe de 1,7 à 2,3 ms
  pendant la pose et reste inchangé ailleurs.

## Reste

- La pose depuis la fiche d'une tuile (bouton « Construire » des options) n'a pas de
  fantôme : on y choisit déjà la tuile d'abord.
- Le fantôme ne montre que le niveau 1. La zone prévue d'une amélioration (rayon qui grandit)
  ne s'affiche pas avant l'amélioration ; l'onde la montre après.
- L'onde et les pousses ne se voient pas sur un téléphone en qualité Basse (pas de
  particules) ; l'allumage des tuiles, si.
- Les mesures ont été faites en rendu logiciel. Le porteur peut vérifier avec `?debug` sur
  son MacBook (pose d'un producteur en balayant la carte).
