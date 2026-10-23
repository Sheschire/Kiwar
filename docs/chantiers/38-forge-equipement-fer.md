# Chantier 38 — Forge, équipement et fer météorique

Acte II « La guerre des faces » du [carnet de route](../CARNET_DE_ROUTE.md) (ex-chantier 28,
élargi à la Forge). **Simulation + client + bot.** Après le **37** (classes et profils de combat ;
les cueilleur·euses minent les cratères).

**Skills à charger** : `kiwar-rpg`, `kiwar-battle`, `kiwar-threats` (météorites), `kiwar-ages`
(+ `kiwar-sky` comme modèle de ressource à part, `kiwar-balance` à la fin).

## Intention du porteur

- « Bâtiment **Forge** pour construire des **armes plus fortes, et des armures**. Recherches
  nécessaires à mener dans la Bibliothèque. »
- « Que récolte-t-on avec la **météorite** ? J'ai l'impression que ce sont des graines. Il faut
  **en miner de la météorite** (ressource proche de la poussière d'étoile). »
- « Pas de nouveaux bâtiments à l'âge de pierre. »

## Décisions déjà prises

- Le minerai sert aux **niveaux 7+** (ceux du Fer et de l'Industrie, chantier 30) et aux
  **monuments des âges**, au **vaisseau et aux tourelles**, à **certaines technologies** du Fer
  et de l'Industrie (réponse de fin octobre 2026), et ici à l'**équipement de fer et d'acier**.
- Questions de l'ancien chantier 28, tranchées par défaut (modifiables) :
  1. Le nom est **fer météorique**.
  2. Un cratère donne surtout du fer, plus une petite part de sa ressource actuelle.
  3. Les cratères n'attirent pas les prédateurs pour l'instant.
  4. Garantie anti-blocage : les épaves en donnent aussi, et au moins une chute tous les 3 jours.
- La **Forge** arrive à la **Pierre** (3 tuiles, 35) : armes de bois et de pierre d'abord.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- Il n'y a que quatre ressources : pulpe, fibre, graines, jus (`data/resources.ts`).
- **Météorites** (`data/threats.ts` ~175-196) : il en tombe environ une par jour. Chacune laisse
  un **cratère**, poste temporaire de 3 places pendant 48 h, 3 cratères au plus. Le cratère donne
  **graines ×2, jus ×1 ou fibre ×1** par tirage. La technologie **Foreuse** (`meteorDrill`)
  multiplie la récolte par 1 / 1,5 / 2 / 2,5 selon l'âge.
- **Modèle à suivre** : la poussière d'étoile (skill `kiwar-sky`), un stock à part en unités
  entières, plafond 50.
- **Épaves** : obstacles à fracasser (skill `kiwar-titans`).
- **Technologies existantes** : lance-pierres (Pierre), armure (Fer), armes à feu (Industrie),
  fonte (Fer).
- **Équipement** : aucun ; la force vient des stats, du niveau et de la classe.

## Proposition

### Le fer météorique

- Un stock à part (unités entières), dont le plafond suit le Nid. Une icône et un compteur
  apparaissent dans la barre dès le premier cratère.
- Un cratère donne ~10–20 unités sur ses 48 h avec trois kiwis, plus une petite part de sa
  ressource actuelle. La Foreuse et les cueilleur·euses minent plus vite. Fracasser une épave en
  donne un peu.
- Les cratères montrent des éclats métalliques.

### La Forge et l'équipement

- **Deux emplacements par kiwi** : une arme et une armure. On les voit sur le kiwi (accessoires
  du 34) et elles comptent dans son profil de combat (36).
- **Paliers d'équipement** :

  | Palier         | Âge       | Fait avec             |
  | -------------- | --------- | --------------------- |
  | Bois et pierre | Pierre    | pulpe, fibre, graines |
  | Fer            | Fer       | fer météorique        |
  | Acier          | Industrie | fer et machines       |

  Les technologies ouvrent les paliers : « Forge » à la Pierre, puis armure, fonte et armes à
  feu.

- Une **file de la Forge** : un temps et un coût par pièce, des forgeron·nes en poste (Force et
  Dextérité, chantier 15).
- Les armes suivent les classes : épées, bâtons, frondes, masses, arcs et fusils plus tard.
  Armures légères ou lourdes : elles échangent de la vitesse contre des PV.
- Un kiwi mort en débarquement **perd son équipement**, qui revient aux aliens (chantier 40).

### Les autres débouchés du fer

- Niveaux 7+ des bâtiments, monuments du Fer et de l'Industrie, chaque génération de vaisseau,
  tourelles de niveau 3+, quelques technologies.

## Impact technique

- Simulation (skills `kiwar-rpg`, `kiwar-battle`, `kiwar-threats`, `kiwar-ages`) :
  - `state.meteorIron` et son plafond, la récolte des cratères et des épaves. L'exactitude hors
    ligne demande un débit entier et des événements d'`advance`.
  - `Kiwi.gear`, la Forge (bâtiment, file, postes), les données d'objets.
  - Les profils d'unités tiennent compte de l'équipement. Les coûts en fer vont dans
    `data/buildings.ts`, `data/research.ts`, le vaisseau et les tourelles.
  - Migration, tests, `pnpm build:functions`. Pas de SQL.
- Client : compteur, fiches avec l'équipement, écran de la Forge, cratère qui montre le minerai,
  modèle de la Forge (kit du 33), i18n FR + EN, sons (enclume).
- Bot :
  - il forge pour ses gardes et ses équipages ;
  - le passage des âges ne doit pas attendre une météorite de trop (sonde `pnpm balance:ages`) ;
  - jamais de partie bloquée.

## Découpage proposé

1. Fer météorique : stock, cratères, épaves, garantie ; tests.
2. Forge : bâtiment, file, données d'objets, emplacements, effet dans le moteur de bataille ;
   tests.
3. Coûts en fer : niveaux 7+, monuments, vaisseau, tourelles, technologies.
4. Client : compteur, Forge, fiches, équipement visible, cratère.
5. Bot, sonde des âges, équilibrage, docs (`kiwar-rpg`, `kiwar-battle`, `kiwar-threats`),
   `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- Un cratère donne visiblement du fer météorique, pas des graines.
- À la Pierre, on peut forger, et un·e garde équipé·e se bat mieux, ce qui se voit en bataille.
- Le fer a des débouchés à chaque âge à partir du Fer ; la sonde des âges ne bloque jamais faute
  de météorites.
