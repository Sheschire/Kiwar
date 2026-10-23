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

| #   | Chantier                                             | État    |
| --- | ---------------------------------------------------- | ------- |
|     | **Acte I — Le rythme**                               |         |
| 30  | Paliers, âges et réserves                            | fait    |
| 31  | Objectifs et menaces réveillées                      | à faire |
| 32  | Correctifs et ciel (client)                          | fait    |
| 33  | Bâtiments par âge et icônes 3D (client)              | fait    |
| 34  | Kiwis et créatures vivants (client)                  | fait    |
|     | **Acte II — La guerre des faces**                    |         |
| 35  | Bâtiments sur plusieurs tuiles                       | à faire |
| 36  | Moteur de bataille : les vagues jouées pour de vrai  | à faire |
| 37  | Classes, rôles de combat, camp d'entraînement        | à faire |
| 38  | Forge, équipement et fer météorique                  | à faire |
| 39  | La civilisation alien                                | à faire |
| 40  | Le débarquement                                      | à faire |
| 41  | La bataille en direct sur la jumelle (client)        | à faire |
| 42  | La reine des furets                                  | à faire |
|     | **Acte III — Le village vivant**                     |         |
| 43  | Moral par kiwi, Mairie et feu de camp                | à faire |
| 44  | Loisirs et décor                                     | à faire |
| 45  | Rives fertiles et canaux de jus                      | à faire |
| —   | Acte IV : Tréfonds, kiwaïs, Verger cosmique ; ligues | idées   |

**Prochaine conversation** : le chantier **31** (objectifs et menaces) s'il n'est pas fini ;
le **33** est fait (puis le **35**, bâtiments sur plusieurs tuiles, qui part de son kit). Le 30 a laissé deux points au 31 : le
pillage des réserves (elles ne sont pas encore pillées) et le temps mort du début de la Pierre
(~80–110 min mesurés par le bot, cible ~45 min : les objectifs et les vagues doivent le remplir).

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
