# Chantier 39 — La civilisation alien

Acte II « La guerre des faces » du [carnet de route](../CARNET_DE_ROUTE.md). **Simulation +
serveur + bot.** Après le **36** (moteur de bataille). Le 40 (débarquement) s'appuie dessus.
Pendant ce chantier, les anciennes missions (reconnaissance, raid, siège) **continuent de
marcher**, branchées sur la nouvelle civilisation, pour que le jeu reste jouable entre deux
sessions. Le 40 les remplace.

**Skills à charger** : `kiwar-expeditions`, `kiwar-colonies`, `kiwar-online`, `kiwar-design`
(+ `kiwar-battle`, `kiwar-threats` pour les vagues, `kiwar-balance` à la fin).

## Intention du porteur

- « Même si on ne la voit pas au début, la civilisation alien se développe aussi de son côté. Plus
  on est lents à se développer, plus elle prend de l'avance. Plus elle prend de l'avance, plus
  ses raids envers nous sont puissants. »
- « Les 6 parcelles proches des limites du kiwi sont les plus faibles, les 6 proches du centre
  contiennent des ennemis plus puissants, mieux éduqués, mieux équipés. Un joueur trop téméraire
  qui envoie une première expédition au centre a de grandes chances de mourir. »
- « L'IA de l'ennemi doit être assez forte pour savoir cacher des informations importantes ou
  des bâtiments essentiels dans des parcelles non découvertes. »
- « On doit générer les visuels de leur civilisation au moment de la découverte, pour avoir
  l'impression qu'eux aussi ont une vie comme nous. »

## Décisions déjà prises (23 octobre 2026)

1. **Sa propre horloge** : elle passe ses âges à des **dates fixes** depuis le début de la partie,
   avec la même règle pour tout le monde. Nos **bûchers la freinent** ; nos **défaites la
   nourrissent** (vivres, pièces du vaisseau, équipement). Ses vagues contre nous suivent **sa
   puissance**.
2. Aucune difficulté ajustée en cachette pour un·e joueur·euse (charte de `kiwar-design`).
3. Les données cachées restent sur le serveur (règle anti-triche de `kiwar-expeditions`) ; en
   solo, le client les tient, comme aujourd'hui.
4. Une face tenue par un·e autre joueur·euse n'est pas une civilisation alien (le JcJ viendra
   plus tard). La seconde colonie du chantier 19 est conservée.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **12 parcelles** : 6 tranches d'angle × deux anneaux, coupés à la distance 6
  (`data/expeditions.ts:102-109`). `sectorOf(q, r)` donne 0–5 à l'intérieur et 6–11 à
  l'extérieur (`sim/aliens.ts:39-45`). La carte de la jumelle est publique (`twinParams`,
  `aliens.ts:241`).
- **Garnison cachée** : `state.aliens[targetId]` (`AlienGarrison`) contient la graine secrète, la
  défense, la croissance, le butin, la part de furets et les structures (`sim/state.ts:264-280`).
  - Elle est tirée par `drawGarrison` (`aliens.ts:48-79`), la vérité du siège par `siegeTruth`
    (`sim/siege.ts:89-109`).
  - `publicState` retire tout cela de chaque réponse du serveur (`server/gameService.ts:739`,
    `aliens.ts:95-100`). Le client ne résout pas ces arrivées (`canResolveArrival`,
    `aliens.ts:122-132`).
- **Croissance passive seulement** : défense + renfort × victoires + croissance × jours, plafonnée
  à ×2 (`alienDefense`, `aliens.ts:103-109`). Il n'y a ni économie, ni bâtiments, ni âge alien.
  Seules sont dessinées les tanières et perchoirs vus par les éclaireur·euses
  (`apps/client/src/render/twin.ts:331-345`).
- **Vagues** chez nous : puissance donnée par la formule de `sim/threats.ts`, avec un terme
  « provocation » de +8 % par victoire de raid (`data/threats.ts:32-34`).

## Proposition

### L'état de la civilisation

- `state.aliens[targetId].civ`, toujours caché, se calcule par une **fonction pure**
  `civAt(seed, startedAt, now, impacts)`. Les impacts sont nos bûchers, nos pillages, nos
  défaites et leurs gains, ajoutés comme événements (côté serveur).
- Ce calcul, déterministe et exact hors ligne, ne demande pas de faire tourner la civilisation
  pas à pas.
- **Âges aliens** à dates fixes, à régler pour être un peu derrière un·e joueur·euse attentif·ve
  et devant un·e occasionnel·le : par exemple la Pierre au jour 1, le Fer au jour 4 et
  l'Industrie au jour 12. Chaque bûcher retire des heures de développement à la parcelle et un
  peu à la civilisation ; chaque défaite d'un équipage en ajoute.

### Les parcelles

- Chaque parcelle a des **bâtiments** (terriers, perchoirs, ateliers, casernes, totems,
  réserves, et une seule fois le **terrier royal**) posés sur ses tuiles, et une **garnison**
  (des unités par rôle, niveau et équipement, pour le moteur du 36).
- **Le bord est faible, le centre fort** : à âge égal, les garnisons intérieures valent ×2 à ×3
  et sont mieux équipées.
- La garnison se reconstitue avec le temps dans les parcelles non conquises.

### L'IA qui cache

- Des règles déterministes, recalculées une fois par jour de jeu : les bâtiments clés (terrier
  royal, grande caserne, réserve) vont dans les parcelles **non balisées**, de préférence au
  centre et loin des balises.
- Quand une balise apparaît, la civilisation **déplace** ses bâtiments clés des parcelles voisines
  exposées, s'il reste une parcelle cachée libre. On ne découvre l'essentiel qu'avec de la
  chance et de la méthode.

### Ses vagues contre nous

- La puissance des vagues vient de la civilisation (âge, casernes, équipement), à la place du
  terme « jours » et de la « provocation ». Le terme de richesse du chantier 31 reste.
- Chaque vague part **d'une parcelle** (annoncée dans la prévision). Conquérir les parcelles à
  casernes affaiblit les vagues : une boucle de jeu visible.

### Ce que voit le client

- Public : les parcelles balisées (le 40 ajoute la vue détaillée), une **estimation de l'âge et
  de la puissance** de la civilisation tirée de ce qu'on a vu, et la parcelle d'où part la
  prochaine vague.
- Caché : tout le reste. `publicState` est étendu et des tests vérifient qu'aucune donnée cachée
  ne fuit.

### Transition

- Les reconnaissances, raids et assauts continuent, résolus contre les parcelles de la
  civilisation. Par exemple, la défense d'un raid devient la garnison des parcelles visées,
  encore par formule. Le 40 les retire.

## Impact technique

- Simulation et serveur (skills `kiwar-expeditions`, `kiwar-colonies`, `kiwar-online`) :
  - `sim/aliens.ts` reçoit `civAt`, les parcelles et l'IA de placement ;
  - `data/aliens.ts` (neuf) : bâtiments, rôles, âges et dates ;
  - les impacts s'enregistrent à la résolution des missions ;
  - les vagues passent par la civilisation (`sim/threats.ts`) ;
  - `publicState`, la migration des garnisons existantes, les tests (déterminisme, aucune fuite,
    exactitude sur 10 jours), `pnpm build:functions`.
  - Pas de SQL a priori : l'état caché vit déjà dans la ligne `games`. Si une colonne change,
    nouvelle migration et SQL à donner au porteur.
- Client : un encart « La civilisation adverse » (âge estimé, parcelle de la prochaine vague) ;
  le village visible arrive aux chantiers 40 et 41.
- Bot : comparer l'âge de la civilisation et le sien par profil ; mesurer les vagues par la
  civilisation.

## Découpage proposé

1. `civAt`, âges, parcelles, bâtiments, garnisons, impacts ; tests.
2. IA de placement et déplacements quotidiens ; tests.
3. Vagues tirées de la civilisation et de ses parcelles ; tests.
4. Anciennes missions branchées sur la civilisation, `publicState`, migration ; tests de fuite
   (mock en ligne).
5. Encart client, bot, sondes, docs (`kiwar-expeditions`, `kiwar-colonies`, `kiwar-threats`),
   `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- Deux colonies de même graine, l'une rapide et l'autre lente, rencontrent la même civilisation
  aux mêmes dates : la lente la trouve plus avancée par rapport à elle.
- Brûler une parcelle retarde la civilisation de façon mesurable ; perdre un équipage l'avance.
- Les vagues viennent d'une parcelle et faiblissent quand on conquiert les casernes.
- Aucune donnée cachée dans `publicState` (test), et un calcul exact après 10 jours d'absence.
