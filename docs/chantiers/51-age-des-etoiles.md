# Chantier 51 — L'Âge des étoiles (cinquième âge)

> **Fait** (31 octobre 2026). Ce qui a été fait, ce qui reste et les mesures : section « Bilan »
> en fin de fiche ; le savoir-faire est dans les skills `kiwar-ages`, `kiwar-sim`,
> `kiwar-client` et `kiwar-balance`.

Acte IV « Au-delà » du [carnet de route](../CARNET_DE_ROUTE.md) (section 9). **Simulation +
serveur + client + bot.** Après le **50** (le monument se paie en graines géantes et en cristal).

**Skills à charger** : `kiwar-ages`, `kiwar-design`, `kiwar-sim`, `kiwar-client`,
`kiwar-balance`.

## Intention du porteur

La charte veut que chaque âge apporte du neuf (charte 2) et que les attentes grandissent âge
après âge (charte 1). Après l'Industrie, il n'y a plus d'âge : l'acte IV a besoin d'une colonne
vertébrale de progression qui porte les kiwaïs et les trous de ver (« petites planètes
artificielles qu'on lance en orbite aux derniers âges », carnet, section 9).

## Décisions déjà prises

1. **Un cinquième âge, « Âge des étoiles »** (porteur, 26 octobre 2026), avec les **niveaux
   13–15**, un palier de monument et ses objectifs. Le Nid suit (3 niveaux par âge).
2. Il est visé à **~3 semaines** (jour ~21) pour un·e joueur·euse attentif·ve, et ×1,25–1,5 pour
   l'occasionnel·le. **La conquête n'est pas exigée** : l'âge suit la courbe (×3 entre le Fer et
   l'Industrie, puis ×2).
3. Il débloque le cœur et le pédoncule (52), les kiwaïs (53), puis les trous de ver (54).
4. Défaut de Claude : une **cinquième génération de vaisseau**, le « voilier stellaire », plus
   fiable et plus chargé, qui exige de la poussière d'étoile.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Âges** : `data/ages.ts` (`AGE_IDS = ['eden', 'stone', 'iron', 'industry']`, `MAX_AGE = 3`).
  `ageOf` (`sim/research.ts` ~24) est le niveau du monument (0–3). Le monument couvre 7 tuiles
  (`data/buildings.ts` ~423) ; ses paliers de Fer et d'Industrie coûtent aussi de la poussière
  et du fer.
- **Niveaux** : `MAX_LEVEL = 12` (`data/buildings.ts` ~123), `LEVELS_PER_AGE = 3` (~809),
  `withAgeLevels` génère les niveaux 4–12. **Toute table indexée par le niveau a 13 cases**
  (règle du 30), par exemple `IRON.cap` et `RESEARCH.bank` (12 entrées par niveau de
  Bibliothèque). Elles passent toutes à 16.
- **Recherche** : `data/research.ts` (`TECH_BRANCHES`, 25 `TECH_IDS`,
  `PASSAGE_TECHS = [null, 'stoneAge', 'ironAge', 'industryAge']` ~321).
- **Objectifs** : `AGE_OBJECTIVES` (`data/objectives.ts` ~108 : 9 / 8 / 8 / 6) ;
  `objectiveProgress`, `nextStep`.
- **Vaisseaux** : `SHIP_IDS wood / logs / iron / jet`, `shipIdForAge` (`data/expeditions.ts`) ;
  `FUEL` (`data/comets.ts`).
- **Civilisation** : 4 âges (`CIV_AGE_COUNT`). Elle ne change pas ici : la jumelle est conquise
  ou en passe de l'être.
- **Look** : `lookOf` (âge du niveau, palier 1–3), `render/models/ageKit.ts` (les matériaux par
  âge), planche `?sheet&age=N`.
- **Bot** : les profils et les sondes `ages` (`tools/balance`).

## Proposition (point de départ)

- `AGE_IDS` + `'stars'`, `MAX_AGE` 4, `MAX_LEVEL` 15. On recense toutes les tables à 13 cases,
  avec un test qui vérifie leur longueur (`MAX_LEVEL + 1`).
- **Passage** : la technologie `starsAge`, puis le monument palier 5 (graines géantes, cristal,
  poussière et fer). La cible de recherche est fixée pour ~jour 21, chiffrée avec la sonde
  `ages`.
- **Ce que l'âge débloque** (table du carnet, section 7) :
  - les niveaux 13–15 ;
  - la couche du cœur (52) ;
  - le chantier orbital et les kiwaïs (53) ;
  - le voilier stellaire ;
  - des classes ? (aucune classe neuve n'est prévue : une question de session).
- **Objectifs** : 6 à 8 objectifs de l'Âge des étoiles (une galerie du cœur, un premier kiwaï,
  un kiwi de niveau N, le monument).
- **Menaces de l'âge** : la civilisation n'a pas de cinquième âge. Les menaces viennent des
  remontées (48, 50, 52), des comètes et pannes en orbite (53), puis du Verger (54). Si la
  jumelle est conquise, les vagues de surface restent celles des remontées et de la sœur. À
  vérifier avec le bot : jamais une colonie sans aucun danger.
- **Look** : un kit « étoiles » (verre, cristal, laiton céleste, lumières douces) pour les
  niveaux 13–15, avec les vignettes 3D, sur la planche `?sheet&age=4`.

## Grille de décision (kiwar-design)

- **Boucles** : progression (débloquer → apprendre), retour (une attente qui grandit, avec ses
  décisions).
- **Horizon** : semaine. Le prochain pas reste visible (les objectifs et la barre du monument).
- **Robinets et puits** : les niveaux 13–15 sont un puits de plus pour le cristal et les
  graines.
- **Mesure** : l'âge des étoiles (~21 jours, attentif ; occasionnel ×1,25–1,5), le temps mort
  après l'Industrie, « au plafond ».

## Découpage proposé

1. **Les 16 cases** : `MAX_LEVEL` 15 et toutes les tables par niveau étendues, sans changer le
   jeu des niveaux 1–12 ; tests de longueur, sauvegarde.
2. **L'âge** : `stars`, la technologie de passage, le monument palier 5, le voilier stellaire,
   les objectifs ; tests.
3. **Client** : le kit « étoiles », les niveaux 13–15, l'écran de recherche, le HUD d'âge,
   l'i18n ; captures desktop et téléphone.
4. **Bot et sondes** : sonde `ages` sur 28 jours, réglage du coût de passage ; `DECISIONS.md`,
   `kiwar-ages`, `kiwar-design` (le tableau de rythme), table du carnet (section 7).

## Critères d'acceptation

- Les niveaux 1–12 sont identiques à avant (mêmes temps du bot à ±2 %).
- L'Âge des étoiles arrive vers le jour 21 chez le bot attentif, sans exiger la conquête.
- Chaque table par niveau a 16 cases (test) ; l'économie reste dans ±10 % entre faces et biomes.
- L'âge apporte des bâtiments, des systèmes et un look neufs, pas seulement des chiffres.

## Bilan (31 octobre 2026)

**Réponses du porteur** (nouvelles questions, option recommandée à chaque fois) : trois
technologies de l'âge, aucune classe neuve, du cristal sur tous les niveaux 13–15 et des graines
géantes seulement pour le Nid, la Bibliothèque et le monument, la poussière du voilier payée
une fois à la construction.

**Fait** (sept commits « Chantier 51 (part …) ») :

1. Les 16 cases : `MAX_LEVEL` 15, toutes les tables par niveau étendues, test `levelTables`,
   niveaux 1–12 identiques (empreinte de leurs définitions).
2. L'âge : `stars`, le passage « Cartes du ciel profond » (Bibliothèque 9, 40 000 points), le
   monument palier 4 (Nid 10, 24 h ; 40 poussières, 150 fers, 90 cristaux, 4 graines géantes),
   le cristal des niveaux 13–15 (30 / 45 / 60) et les graines du Nid et de la Bibliothèque
   (1 / 2 / 3), trois technologies (Verre céleste, Greffes de cristal, Voiles stellaires), le
   voilier stellaire (aire d'envol 13, 30 poussières une fois), six objectifs, les tables par
   âge à cinq cases, sauvegarde v41.
3. Le client : le kit des étoiles (pierre pâle, laiton céleste, verre de nuit, cristal, flèches
   de cristal, télescope et sphère armillaire), l'observatoire et l'orrery du monument, le
   voilier, les coûts en cristal et en graines sur la fiche, la stat « Recherche » des
   technologies ; captures desktop, téléphone portrait et paysage, planche `?sheet&age=4`.
4. Le bot et les sondes : jalon `stars`, technologies de l'âge, réserves de cristal, de graines
   et de poussière pour le monument ; deux bugs du bot corrigés (réserve de poussière limitée au
   palier 3, Bibliothèque agrandie seulement pour la technologie voulue).

**Mesures** (bot attentif, quatre biomes, détails dans `DECISIONS.md`) : l'Âge des étoiles aux
jours 18,5 / 19,2 / 21,1 / 21,2 (médiane ≈ 20), l'Industrie aux jours 8–10.

**Reste** (voir `DETTE.md`) :

- ⚠️ l'occasionnel·le du bot n'a jamais de cristal (il ne prend aucune loge) : son monument des
  étoiles attend ;
- les portes de l'âge sont basses (Bibliothèque 9, Nid 10) parce que les derniers niveaux de
  l'Industrie viennent tard chez le bot : à revoir au chantier 58 ;
- les objectifs du cœur et des kiwaïs (chantiers 52, 53), un son pour l'âge, un vol propre au
  voilier ;
- critère « temps du bot à ±2 % » : les définitions des niveaux 1–12 sont identiques, mais le
  bot a changé (Bibliothèque) et son Industrie bouge jusqu'à 6 %.
