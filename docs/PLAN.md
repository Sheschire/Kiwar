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
  L'acte IV (chantiers 47 à 58) est écrit le 26 octobre 2026.

| #   | Chantier                                            | État    |
| --- | --------------------------------------------------- | ------- |
|     | **Acte I — Le rythme**                              |         |
| 30  | Paliers, âges et réserves                           | fait    |
| 31  | Objectifs et menaces réveillées                     | fait    |
| 32  | Correctifs et ciel (client)                         | fait    |
| 33  | Bâtiments par âge et icônes 3D (client)             | fait    |
| 34  | Kiwis et créatures vivants (client)                 | fait    |
|     | **Acte II — La guerre des faces**                   |         |
| 35  | Bâtiments sur plusieurs tuiles                      | fait    |
| 36  | Moteur de bataille : les vagues jouées pour de vrai | fait    |
| 37  | Classes, rôles de combat, camp d'entraînement       | fait    |
| 38  | Forge, équipement et fer météorique                 | fait    |
| 39  | La civilisation alien                               | fait    |
| 40  | Le débarquement                                     | fait    |
| 41  | La bataille en direct sur la jumelle (client)       | fait    |
| 42  | La reine des furets                                 | fait    |
|     | **Acte III — Le village vivant**                    |         |
| 43  | Moral par kiwi, Mairie et feu de camp               | fait    |
| 44  | Loisirs et décor                                    | fait    |
| 45  | Rives fertiles et canaux de jus                     | fait    |
| 46  | Réglages d'après l'acte III                         | fait    |
|     | **Acte IV — Au-delà**                               |         |
| 47  | Le rythme de la conquête                            | fait    |
| 48  | Tréfonds I : l'entrée et la chair verte             | fait    |
| 49  | La tranche (client)                                 | fait    |
| 50  | Tréfonds II : les loges                             | fait    |
| 51  | L'Âge des étoiles                                   | fait    |
| 52  | Tréfonds III : le cœur et le pédoncule              | fait    |
| 53  | Les kiwaïs                                          | fait    |
| 54  | Trous de ver et le Verger I : la framboise          | fait    |
| 55  | Le Verger II : la pomme et l'ananas                 | à faire |
| 56  | Les ligues                                          | fait    |
| 57  | Le JcJ optionnel                                    | à faire |
| 58  | Réglages et bilan de l'acte IV                      | à faire |
| 59  | Les voisins vivants (hors carnet)                   | fait    |

**L'acte III est terminé** (bilan et mesures : section 8 ter du
[carnet](CARNET_DE_ROUTE.md)), et ses **réglages** aussi (chantier **46**, mesures dans
`DECISIONS.md` et [`BALANCE_REPORT.md`](BALANCE_REPORT.md)) : les tombé·es d'un terrain tenu
(débarquement ou bataille finale gagnés, balise tenue) reviennent blessé·es ; moral plus
exigeant (bases 46 / 35 / 29 / 23, beauté +5, loisirs +10) ; l'occasionnel entretient ses
tourelles (habitude du bot : 9 % de vagues perdues) ; une jumelle tirée par biome dans le bot
(l'écart de face venait de l'échantillon) ; reine plus solide (`hp` 1300, coups 0,5) et
centre moins fort à l'Industrie (×1,9) : conquête entre les jours 17 et 20 dans 3 parties sur
6, 3 à 24 morts en 21 jours.
**L'acte IV est écrit** (26 octobre 2026) : douze fiches, de 47 à 58, et les décisions du
porteur dans la section 9 du [carnet](CARNET_DE_ROUTE.md) et dans `DECISIONS.md`.
**Chantier 47 fait** : la reine sort à une date publique (jour 13, avec les 12 balises à la
date) ; le blocage à 8 balises venait de la prévision des débarquements, qui oubliait les
renforts d'une caserne cachée — elle les compte maintenant au pire. Conquête aux jours 13–17,
aucune partie bloquée, 0 à 14 morts.
**Chantier 48 fait** : les Tréfonds s'ouvrent au Fer (technologie Spéléologie, entrée de
tunnel). Un réseau public de salles sous brouillard, au contenu caché (`depthSeed`, résolu là où
la vérité est tenue) ; descentes avec dangers et prévision honnête, galeries et mineur·euses,
Grouillants, Spéléologue, remontées par le tunnel (porte fermée, fortifiée ou gardée), écran
Tréfonds 2D. Skill `kiwar-depths`.
**Chantier 49 fait** : la tranche. Un quartier du dôme s'ouvre comme une part de fruit (bouton
« Voir en coupe » de l'écran Tréfonds, ou incliner la caméra au-delà du bord) : couches peintes,
salles creusées, lanternes, mineur·euses, wagonnets, équipages en marche, effets et sons ; une
descente se rejoue dans sa salle (`ShowSource` `delve`), en direct si la coupe est ouverte.
Planche `?depths`. Skills `kiwar-depths`, `kiwar-client`, `kiwar-battle`.
**Chantier 50 fait** : les loges. À l'Industrie, 30–42 loges en arc sous la chair (forêts de
raphides, lacs d'actinidine, nids, graines géantes) ; deux stocks à part, le **cristal** (Verre
et lentilles, munitions de cristal, armes de cristal) et les **graines géantes** (arbres-loges,
œufs des loges) ; l'actinidine est un effet tant qu'un lac est exploité (labo, Enzymes) ;
contourner les lacs ; les nids des loges renforcent les remontées. Sauvegarde v40. Skills
`kiwar-depths`, `kiwar-forge`. La tranche 3D ne montre pas encore les loges (`DETTE.md`).
**Chantier 51 fait** : l'Âge des étoiles, cinquième âge. Passage « Cartes du ciel profond »
(Bibliothèque 9, 40 000 points), monument palier 4 (Nid 10 ; poussière, fer, 90 cristaux,
4 graines géantes), niveaux 13–15 (cristal ; graines pour le Nid, la Bibliothèque et le
monument), trois technologies de l'âge, six objectifs, le voilier stellaire (aire d'envol 13),
le look des étoiles. Bot attentif : l'âge aux jours 18,5–21,2. Sauvegarde v41. Skills
`kiwar-ages`, `kiwar-sim`, `kiwar-client`, `kiwar-balance`.
**Chantier 56 fait** : les ligues. Dans un univers partagé, un classement par saisons de
28 jours sur des hauts faits publics et datés, lus par le serveur dans l'état tenu (âges,
balises, conquête, Tréfonds, Kikiwiwi, forge, et des paliers : vagues tenues, débarquements,
niveau d'un kiwi, population, constructions). Les faits d'avant les ligues vont au palmarès
seulement. Le podium garde un titre daté et choisit un cosmétique (bannière du Nid, capes,
fanions, couronne du monument), dessiné chez soi et chez les voisin·es. Écran Ligue, lignes de
chat, migration `20261105000000_leagues.sql`. Skill `kiwar-leagues`.
**Chantier 52 fait** : sous les loges, à l'Âge des étoiles, 6 à 10 **cavernes blanches** (plafond
de poids public, éboulement au-delà, sève à deux fois le débit d'une mine) puis le
**pédoncule** et le **Grand Charançon** (carapace, envol par à-coups où seuls les coups qui
portent en l'air le touchent, nuée de larves ; blessures qui guérissent en 72 h). Sa chute
révèle la **Liane-Mère** (trésor, souvenir, pèlerinage, nids du cœur muets) et fixe la règle du
54 : sans elle, les trous de ver coûteront ×2,5 (`techCost`). Bot : Charançon aux jours 27 et
30 quand il atteint le pédoncule (deux parties sur six). Skills `kiwar-depths`, `kiwar-battle`,
`kiwar-client`.
**Chantier 54 fait** : les trous de ver et la framboise. La technologie Trous de ver (×2,5
sans la Liane-Mère, Bibliothèque 9) et une aire d'envol niveau 9 ouvrent le Verger, **le même pour tout un
univers** (tracé tiré de la graine de l'univers, contenu caché dans `universe_secrets`,
migration `20261107000000_orchard.sql`), à la colonie d'origine seule. La framboise : des clans
de coléoptères, une réputation publique qui revient vers 0, le commerce à un cours public, le
don, le pillage (hostile, gagné ou perdu), le nectar rouge, le comptoir (petite carte : huttes,
étals, palissades ; kiwis là-bas) et ses attaques annoncées (un don les annule). Écran Verger,
framboise dans le ciel, batailles jouées en 3D sur la drupéole. Sauvegarde v44. Skill
`kiwar-orchard`.
**Chantier 53 fait** : les kiwaïs. À l'Âge des étoiles, le **chantier orbital** (Nid 10, un
par colonie) lance 1 à 3 kiwaïs, petites planètes en orbite qui gardent leur propre petite
carte (`sim/sites.ts`, hors de `state.buildings` : la surface ne change pas). Quatre types
(moisson d'étoiles, serre, observatoire, quai), des modules (habitat, panneau, capteur, dôme,
poste d'amarrage), une navette qui monte et redescend les kiwis (nourris par la colonie), des
pannes publiques annoncées (entretien, réparation sur place) et les essaims des comètes
(bouclier, évacuation). Écran Orbite, kiwaïs dans le ciel. Sauvegarde v43. Bot : premier
kiwaï aux jours 23,8–27,5. Skill `kiwar-orbit`.
**Prochaine conversation** : le [chantier 55](chantiers/55-verger-pomme-ananas.md) (la pomme et
l'ananas).
À tester avec le porteur : les kiwaïs (le choix des kiwis de la navette, l'intérêt de chaque
type — le quai vaut-il un kiwaï ?, le rythme des pannes, le prix du bouclier, leur allure dans
le ciel), le Verger (commercer ou piller, la lisibilité de la réputation et
sa dérive, le don qui annule une attaque, ce que rapporte un comptoir, la caméra sur une
drupéole, la place de la framboise dans le ciel), les ligues (compétition saine ou pression, points, durée d'une
saison, cosmétiques), l'Âge des étoiles (le jour ~20 est-il le bon moment, le look des
étoiles, le prix des niveaux 13–15 en cristal, le voilier), l'occasionnel·le sans cristal (il
n'atteint jamais les loges dans le bot : son monument des étoiles attend), les loges (leur difficulté — 5 à 8 morts en descente quand il y a des retraites —, le prix des lentilles et des munitions,
le rythme des arbres-loges, contourner les lacs, la bande des loges sur téléphone), la coupe (le plaisir de regarder, le geste, les images/s sur téléphone, la taille des combattants d'une descente), les Tréfonds (le ressenti des dangers, la difficulté des salles profondes, la fréquence des remontées, le prix de la porte fortifiée), la prévision des débarquements au pire (renforts possibles), la reine au jour 13 (deux parties sur six la battent le jour même : une date au jour 14 ?), l'exigence du moral par âge, le poids des deuils, la valeur d'un
discours, la beauté sans placement, le prix du cabaret et des feux, les rives à +30 %, le prix
(80 pulpe + 40 fibre, 1 h) et le plafond (3 / 6 / 10 / 15) des canaux, la reine à 1300 points
de vie.
Toujours ouverts : le ressenti de l'horloge alien (39),
du combat équipé (38), des rangs et du camp (37), la réparation automatique qui trahit l'issue
d'une vague regardée (36) et le temps mort du début de la Pierre (31).

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
- **Niveaux et réserves** (chantier 30) : niveaux 1–15 depuis le chantier 51, trois par âge ;
  toute table indexée par le niveau du Nid ou d'un bâtiment a 16 cases (test `levelTables`,
  skill `kiwar-sim`), toute table par âge 5 cases. Les réserves d'entrepôt ne se
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
- **Tréfonds** (chantier 48) : le tracé des salles est public (`depthsMapOf`), leur contenu
  caché (`depthSeed`, comme `aliens`) ; tout ce qui le lit ne se résout que là où la vérité est
  tenue. Une remontée est une vague (`wave.tunnel`) : ce qui parle de « la prochaine vague » lit
  `comingWave(state)`. Un nouvel ennemi qui vole passe par `isFlyer`. Skill `kiwar-depths`.
- **Verger** (chantier 54) : le tracé d'un fruit est public et partagé par l'univers, son contenu
  caché (`orchardSeed`, comme `depthSeed`) ; tout ce qui le lit (arrivée d'un voyage, frappe
  sur le comptoir) ne se résout que là où la vérité est tenue. Un comptoir est une petite carte
  (`smallMap`), jamais dans `state.buildings` ; le job `post` se traite comme `outpost`. Skill
  `kiwar-orchard`.
- **Petites cartes** (chantier 53) : un kiwaï (ou un comptoir du 54) garde ses propres choses
  sur sa petite carte (`sim/sites.ts`), jamais dans `state.buildings` ; un métier absent mais
  nourri (`orbit`, comme `outpost`) se traite partout où `outpost` l'est. Skill `kiwar-orbit`.
- **Planètes** : elles ont une place fixe (`render/space.ts`) ; `renderer.setTwinApproach(t)`
  rapproche la jumelle (skill `kiwar-world`).

## À faire par le porteur

- **Migrations** à exécuter dans le SQL Editor de Supabase, si ce n'est pas déjà fait, dans
  l'ordre :
  1. `20261024000000_hide_game_state.sql`
  2. `20261025000000_member_planet_seed.sql`
  3. `20261026000000_universe_imports.sql`
  4. `20261027000000_linked_colonies.sql`
  5. `20261103000000_universe_kick.sql`
  6. `20261105000000_leagues.sql`
  7. `20261107000000_orchard.sql` (chantier 54 : la graine cachée du Verger)
- **Projet Supabase** : coller `supabase/setup.sql`, déployer la fonction `game` et renseigner les
  variables Vercel (`docs/SUPABASE_SETUP.md`).
- **Vérifier sur un vrai téléphone et sur le MacBook** (`?debug`) : à faire après les chantiers
  visuels (voir `DETTE.md`).
