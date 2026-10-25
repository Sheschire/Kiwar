# Kiwar — plan de route

> Document court, relu au début de chaque conversation : où on en est et quoi faire ensuite. La
> direction et l'ordre des chantiers sont dans [`CARNET_DE_ROUTE.md`](CARNET_DE_ROUTE.md), les
> décisions dans `DECISIONS.md`, la dette des chantiers faits dans [`DETTE.md`](DETTE.md), les
> idées long terme dans `VISION.md`.

## Démarrer une nouvelle conversation

Message type à donner à Claude :

> Lis `CLAUDE.md`, `docs/PLAN.md` et le document du prochain chantier, charge les skills qu'il
> cite et réalise-le partie par partie. Les décisions sont déjà prises : ne me pose des questions
> que sur un point nouveau.

Une conversation par chantier : tout ce qu'il faut savoir est dans les docs et les skills, pas
dans l'historique.

## État

- **Jalons J1 à J4 faits** :
  - J1 : solo local ;
  - J2 : en ligne Supabase ;
  - J3 : expéditions, univers partagés, chat ;
  - J4 : territoire et logistique.
- **Chantiers 01 à 24 faits** (liste dans [`chantiers/README.md`](chantiers/README.md)).
- **Carnet de route d'octobre 2026** écrit : charte de game design (skill `kiwar-design`) et
  chantiers 30 à 45 détaillés (acte III en fiches courtes). Les anciens 25 à 29 y sont repris.

| #   | Chantier                                             | État  |
| --- | ---------------------------------------------------- | ----- |
|     | **Acte I — Le rythme**                               |       |
| 30  | Paliers, âges et réserves                            | fait  |
| 31  | Objectifs et menaces réveillées                      | fait  |
| 32  | Correctifs et ciel (client)                          | fait  |
| 33  | Bâtiments par âge et icônes 3D (client)              | fait  |
| 34  | Kiwis et créatures vivants (client)                  | fait  |
|     | **Acte II — La guerre des faces**                    |       |
| 35  | Bâtiments sur plusieurs tuiles                       | fait  |
| 36  | Moteur de bataille : les vagues jouées pour de vrai  | fait  |
| 37  | Classes, rôles de combat, camp d'entraînement        | fait  |
| 38  | Forge, équipement et fer météorique                  | fait  |
| 39  | La civilisation alien                                | fait  |
| 40  | Le débarquement                                      | fait  |
| 41  | La bataille en direct sur la jumelle (client)        | fait  |
| 42  | La reine des furets                                  | fait  |
|     | **Acte III — Le village vivant**                     |       |
| 43  | Moral par kiwi, Mairie et feu de camp                | fait  |
| 44  | Loisirs et décor                                     | fait  |
| 45  | Rives fertiles et canaux de jus                      | fait  |
| —   | Acte IV : Tréfonds, kiwaïs, Verger cosmique ; ligues | idées |

**L'acte III est terminé** (bilan et mesures : section 8 ter du
[carnet](CARNET_DE_ROUTE.md), [`BALANCE_REPORT.md`](BALANCE_REPORT.md)) : chantiers **43**
(moral par kiwi, Mairie, feu de camp : `sim/rest.ts`, `sim/speech.ts`), **44** (décors, jeux,
cabaret, feux d'artifice : `sim/village.ts`) et **45** (rives fertiles et canaux de jus :
`sim/canals.ts`, `BANKS`, skill `kiwar-titans`).
**Prochaine conversation** : avant l'acte IV, trancher avec le porteur les points du bilan
(décisions de l'acte II toujours ouvertes, moral presque toujours haut chez le bot, joueur
occasionnel qui perd une vague sur cinq, Pierre qui glisse vers 14–15 h), puis écrire les
chantiers de l'acte IV (Tréfonds, kiwaïs, Verger cosmique : section 9 du carnet).
À tester avec le porteur : l'exigence du moral par âge, le poids des deuils, la valeur d'un
discours, la beauté sans placement, le prix du cabaret et des feux, les rives à +30 %, le prix
(80 pulpe + 40 fibre, 1 h) et le plafond (3 / 6 / 10 / 15) des canaux.
Toujours ouverts : l'usure des kiwis sur les débarquements (40), la conquête qui aboutit dans
2 parties sur 6 (42), le ressenti de l'horloge alien (39), du combat équipé (38), des rangs et
du camp (37), la réparation automatique qui trahit l'issue d'une vague regardée (36) et le
temps mort du début de la Pierre (31).

## Règles transverses à retenir

- **Deux colonies** : tout ce qui touche un état de jeu doit marcher dans les deux colonies
  (chantier 19, skill `kiwar-colonies`). Une sœur n'a ni cibles ni `aliens` et ne termine jamais
  une technologie.
- **Automatisation** : toute tâche qui déplace des kiwis d'elle-même passe par `sim/tasks.ts`
  (skill `kiwar-tasks`).
- **HUD téléphone** : tout nouveau bouton prend une entrée dans `MobileNav.tsx` (skill
  `kiwar-client`).
- **Animations** : une nouvelle animation visible importante doit réveiller la boucle
  (`renderer.wake()` ou les signes de vie de `drawFrame`, `render/frameLimiter.ts`).
- **Kiwis et créatures** (chantier 34) : poses, extraits et accessoires dans `render/anim/`,
  effets groupés dans `particles.ts` (`EFFECTS`) ; tout se vérifie sur la planche `?kiwis`
  (skill `kiwar-client`). Le moteur de bataille (36) part de là.
- **Bâtiments par âge** (chantier 33) : le look suit le **niveau** du bâtiment (`lookOf` : âge
  du niveau, palier 1–3). Un nouveau bâtiment est une recette `(look) => Parts` faite des pièces
  de `render/models/ageKit.ts` (murs, toits, portes, cheminées… dans les matériaux de l'âge) ;
  il se vérifie sur la planche `?sheet&age=N` (ou `&levels=3,4`) et reçoit sa vignette 3D
  (`BuildingThumb`) sans rien ajouter (skill `kiwar-client`).
- **Niveaux et réserves** (chantier 30) : niveaux 1–12, trois par âge ; toute table indexée par
  le niveau du Nid ou d'un bâtiment a 13 cases (skill `kiwar-sim`). Les réserves d'entrepôt ne se
  rapatrient **que** par le joueur (`collect`, `collectAll`), jamais par l'automatisation.
- **Objectifs** (chantier 31) : un nouveau système ou âge prend ses objectifs dans
  `AGE_OBJECTIVES` (une condition = un cas de `objectiveProgress`) ; la prochaine étape
  (`nextStep`) suit les urgences (skill `kiwar-sim`). Toute menace reste annoncée avec au moins
  deux parades, et les réserves sont pillées en premier (skill `kiwar-threats`).
- **Empreintes** (chantier 35) : un bâtiment couvre 1, 3 ou 7 tuiles (`FOOTPRINTS`,
  `Building.rot`) ; tout ce qui cherche « ce qui est sur une tuile » passe par `buildingAt` /
  `occupancy(state)` (`sim/footprint.ts`), jamais par `b.q === q && b.r === r` ; les murs
  (`occupancy.blocked`) se contournent à pied ; un nouveau gros bâtiment prend une entrée dans
  `FOOTPRINTS` et une garniture dans `render/models/spread.ts` (skill `kiwar-sim`, `kiwar-client`).
- **Classes** (chantier 37) : une classe par stat, trois paliers (École, puis camp
  d'entraînement) ; une règle d'une classe de base passe par `inLine(classId, racine)` (ses
  descendantes en héritent), les compétences par `classSkills` ; tout gain de rang de classe
  est un événement (`classXp` entier). Skill `kiwar-rpg`.
- **Batailles** (chantier 36) : une vague est une bataille calculée d'un coup par
  `simulateBattle` (pur, graine) ; le **journal fait foi**, le client le rejoue sans jamais
  recalculer. Une nouvelle unité, arme ou règle de combat va dans `data/units.ts` / `battle/` ;
  le pronostic joue trois batailles d'essai (en cache), `waveAhead` en donne la partie bon
  marché (skill `kiwar-battle`).
- **Fer et équipement** (chantier 38) : le fer météorique est un stock à part
  (`state.meteorIron`, unités brutes entières) ; tout ce qui se paie en fer passe par
  `LevelDef.iron`, `TechDef.iron`, `payIron` / `addIron` et se rembourse jusqu'au plafond ; un
  débit cumulé dans `accrue` se calcule dans `computeFlows` (début de l'intervalle). Une
  nouvelle classe prend une famille d'arme dans `CLASS_FAMILY` (skill `kiwar-forge`).
- **Spectacles** (chantier 41) : un journal se rejoue par `BattleShow.play(state, source,
from, opts)` (`ShowSource` : une vague ou un débarquement ; notre camp, avance, traîne) ;
  sur la jumelle, tout se dessine dans son repère (`TwinView.attach`) et la caméra la suit
  (`CameraRig.shift`). Un nouveau spectacle réveille la boucle (`drawFrame`) et passe par le
  `show` actif de `GameRenderer` (skill `kiwar-battle`).
- **Conquête** (chantier 42) : les attaques de balises et la reine ne se résolvent que là où
  la vérité est tenue (annonce et frappe, sortie de la reine, bataille finale) ; leur heure est
  publique. Une nouvelle réponse à une attaque passe par `sim/beacons.ts`, une nouvelle phase de
  la reine par `battle/queen.ts` (les `wake` / `rage` / `leader` du moteur). Skill
  `kiwar-colonies`.
- **Débarquement** (chantier 40) : les missions vers une face alien sont `land`, `guard` et
  `final` (plus `found`) ; tout ce que nos kiwis voient devient public dans `state.faceViews` (balises,
  aperçus datés, bords) et `state.bestiary` ; la bataille ne se résout que là où la vérité est
  tenue (`resolveLanding`), la prévision ne lit que le public (`landingForecast`). Un nouvel
  effet d'un débarquement passe par `sim/landing.ts` (skill `kiwar-expeditions`).
- **Civilisation alien** (chantier 39) : tout ce qui dépend de la vraie civilisation vit dans
  `state.aliens[*].civ` (caché) et ne se résout qu'où la vérité est tenue (serveur en ligne,
  client en solo) ; une annonce de vague l'attend aussi. Un nouvel effet de nos actions sur
  elle passe par `recordBurn` / `recordDefeat` / `recordFight` (skill `kiwar-civ`).
- **Moral** (chantier 43) : une jauge par kiwi (0–100) ; une nouvelle source de moral est une
  part de `colonyMood` (commune) ou de `kiwiMorale` (propre), ou un souvenir daté
  (`addMemory`, `MEMORY_KINDS` avec `value`, `ms`, `best`) ; un nouveau loisir entre dans
  `LEISURE` ; un nouveau rassemblement qui arrête le travail passe par `gathered(state)`. Un
  bâtiment hors quota a sa branche dans `buildLock` (skill `kiwar-cycles`). Chantier 44 :
  décors et jeux passent par `isVillageLife` (hors quota, un niveau, sans panneau) ; une
  nouvelle soirée du village passe par `sim/village.ts` (à la tombée de la nuit, dans
  `calendarTick`) et `state.village`.
- **Carte remodelée** (chantiers 08 et 45) : une tuile change de nature par `state.terraform`
  (travaux de titan ou canaux), jamais en place ; tout lit la carte par `faceMapOf(state)` ; un
  gisement se lit sur sa carte (`mapTileDeposit` : les rives fertiles) ; un nouveau remodelage
  vérifie `cutsLand` (aussi en saison de crue) et a son quota.
- **Planètes** : elles ont une place fixe (`render/space.ts`) ; `renderer.setTwinApproach(t)`
  rapproche la jumelle (skill `kiwar-world`).

## À faire par le porteur

- **Migrations** à exécuter dans le SQL Editor de Supabase, si ce n'est pas déjà fait, dans
  l'ordre :
  1. `20261024000000_hide_game_state.sql`
  2. `20261025000000_member_planet_seed.sql`
  3. `20261026000000_universe_imports.sql`
  4. `20261027000000_linked_colonies.sql`
- **Projet Supabase** : coller `supabase/setup.sql`, déployer la fonction `game` et renseigner les
  variables Vercel (`docs/SUPABASE_SETUP.md`).
- **Vérifier sur un vrai téléphone et sur le MacBook** (`?debug`) : à faire après les chantiers
  visuels (voir `DETTE.md`).
