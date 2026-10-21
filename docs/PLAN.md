# Kiwar — plan de route

> Document de travail pour reprendre le projet dans une nouvelle conversation. À mettre à jour à
> la fin de chaque jalon (état, tâches suivantes). Les décisions détaillées vont dans
> `DECISIONS.md`, les idées long terme dans `VISION.md`.

## Démarrer une nouvelle conversation

Message type à donner à Claude :

> Lis `CLAUDE.md` puis `docs/PLAN.md`, charge les skills utiles et continue le prochain jalon en
> autonomie. Pose-moi des questions interactives si un choix de game design n'est pas couvert.

Une conversation par jalon (ou par partie de jalon) suffit : tout ce qu'il faut savoir est dans
les docs et les skills, pas dans l'historique.

## État

| Étape | Contenu                                                                      | État   |
| ----- | ---------------------------------------------------------------------------- | ------ |
| J1    | Solo local : face procédurale 3D, 7 bâtiments × 3 niveaux, kiwis, œufs, tuto | ✅     |
| J2    | En ligne Supabase : invité, comptes, serveur qui fait autorité               | ✅ (1) |
| J3    | Expéditions (vaisseau, provisions), univers partagés, chat d'équipe          | ✅ (1) |
| J4    | Territoire : gisements finis et renouvelables, camps, logistique, chemins    | ✅     |

(1) Le porteur va créer le projet Supabase : coller `supabase/setup.sql` dans le SQL Editor,
déployer la fonction `game`, renseigner les variables Vercel (`docs/SUPABASE_SETUP.md`). Le mode
en ligne n'a été testé qu'avec le mock (`pnpm mock:supabase`).

## Chantiers à venir (dans l'ordre)

Détail, propositions et questions ouvertes dans [`docs/chantiers/`](chantiers/README.md). Ils
remplacent les anciens jalons 5 à 8 de `VISION.md`.

| #   | Chantier                                                                | État    |
| --- | ----------------------------------------------------------------------- | ------- |
| 01  | Démolition et bâtiments vivants                                         | ✅      |
| 02  | Audio : socle, sons de base, espace admin                               | ✅      |
| 03  | Kiwis individuels : niveaux, métiers, classes, shiny                    | ✅      |
| 04  | Besoins et cycles : faim, fatigue, jour/nuit, saisons                   | ✅      |
| 05  | Intro, choix de la face, biomes, brouillard                             | ✅      |
| 06  | Menaces : furets et chauves-souris, défenses, cadeaux du ciel           | ✅      |
| 07  | Vaisseau kiwi géant et exploration                                      | ✅      |
| 08  | Âges, recherche contre nature, Kikiwiwis                                | ✅      |
| 09  | Gestion des kiwis : affectation, priorités, tableau des postes          | ✅      |
| 10  | Confort visuel et performance (caméra, planète alien fixe, lenteurs)    | ✅      |
| 11  | Lisibilité de la construction (icônes, avant/après, arbre)              | ✅      |
| 12  | Logistique visible, vagues orientées, nuit plus courte                  | ✅      |
| 13  | Comètes et poussière d'étoiles                                          | ✅      |
| 14  | Emporter sa colonie solo dans un univers existant                       | ✅      |
| 15  | Colonie autonome : constructions, recherche, météorites, automatismes   | ✅      |
| 16  | Pose et terrain lisibles (modèle fantôme, zones, gains au dépôt)        | ✅      |
| 17  | Identité visuelle : bâtiments distincts, planète alien, ciel vivant     | ✅      |
| 18  | Bot d'équilibrage complet : chemins, camps, expéditions                 | ✅      |
| 19  | Colonisation de la face alien jumelle (siège, seconde colonie)          | à faire |
| 20  | Correctifs et confort (tap qui se bloque, tri, file repliable, inertie) | ✅      |
| 21  | Interface mobile : barre au pouce, menu nommé                           | ✅      |
| 22  | Premières impressions : écran de chargement animé, intro interactive    | ✅      |
| 23  | Lumières HD, tuiles exploitées vivantes, chemins pavés, sobriété        | ✅      |
| 24  | Caméra libre et planètes fixes dans l'espace                            | à faire |
| 25  | Classes : une par stat, Cueilleur·euse, arbre de classes                | à faire |
| 26  | Bâtiments sur plusieurs tuiles (3 tuiles, monument 7)                   | à faire |
| 27  | Mairie et Discours (rassemblement, moral)                               | à faire |
| 28  | Fer météorique (minerai des cratères)                                   | à faire |
| 29  | Canaux de jus (creuser la chair dès l'Éden)                             | à faire |
| —   | Plus tard : ligues (classement), JcJ optionnel, colonisation, échanges  | idées   |

**Prochaine conversation** : retours de fin octobre 2026 → chantiers 20 à 29. Ordre choisi
par le porteur : **les correctifs client d'abord** (20, puis 21 ; 22 et 23 en parallèle ; 24 à
coordonner avec le 19), **le 19 (colonisation) en parallèle** dès que le 18 est fini, puis les
chantiers de simulation après le 19 : 25 → 26 → 27, et 28, 29. Le chantier 15 a ouvert le skill
`kiwar-tasks` : toute tâche qui déplace des kiwis d'elle-même passe par `sim/tasks.ts`.
Le chantier 21 a mis le HUD des téléphones et écrans tactiles dans `MobileNav.tsx` (barre au
pouce + menu nommé, skill `kiwar-client`) : tout nouveau bouton du HUD y prend une entrée.
Le chantier 23 a ajouté un limiteur d'images/s et un ralenti au repos (`render/frameLimiter.ts`) :
une nouvelle animation visible importante (spectacle, outil en main) doit réveiller la boucle
(`renderer.wake()` ou la liste des signes de vie de `drawFrame`).

## Dette et idées en attente

- Le bot d'équilibrage n'utilise ni camps, ni chemins, ni expéditions.
- Chantier 20 : l'inertie (τ 0,6 s, rotation à deux doigts) et le blocage du tap n'ont été
  vérifiés qu'en Chromium headless (évènements tactiles CDP) : à confirmer sur un vrai
  téléphone par le porteur. Les grillons (deux voix, 3 à 8 s de silence, volume 0,35, fondu à
  la mi-nuit) sont à régler à l'oreille, depuis `/admin` si besoin.
- Chantier 18 : le bot d'équilibrage joue chemins, camps et expéditions (rapport d'impact,
  profils actif / occasionnel, âges sur 10 jours) ; il n'utilise ni mages, ni livraisons, ni
  terraformation au-delà du concassage. L'occasionnel·le atteint l'Industrie à ~1,25× l'actif
  (la recherche avance hors ligne, accepté). Un rapport officiel complet prend ~2 h sur 4 cœurs.
- Chantier 09 : pas encore de garnison d'urgence ni de réparateur·ice prioritaire (même principe
  que le·la bâtisseur·euse prioritaire) ; pas de postes génériques pour les kiwis en trop ; le
  bot n'utilise ni cadenas ni affectation kiwi par kiwi ; le rapport d'équilibrage (30 graines,
  avant comme après le chantier) signale le Nid 3 et la Bibliothèque ~45 % plus lents en couronne
  de pépins et en lagunes (Kiwino +21 %), contre ±5,6 % à la fin du chantier 08 (cause trouvée et
  corrigée au chantier 12 : le bot ne déracinait les souches qu'avec 400 pulpe).
- Chantier 12 : les gardes 3D se postent au pied d'une tourelle au hasard (pas dans leur
  secteur) ; les rapports de vague ne gardent que les totaux ; le bot n'utilise toujours pas
  les chemins (le gain logistique n'est pas mesuré par l'équilibrage).
- Chantier 17 : les niveaux 4 à 6 gardent la silhouette du niveau 3 (plus grand, fanions
  dorés) ; la nuance de la planète alien (Kiwino pâle sous le brouillard) n'est pas retouchée ;
  mesures d'images/s en rendu logiciel seulement (à confirmer avec `?debug` sur un vrai GPU,
  la planète visible au zoom par défaut coûte une dizaine d'appels de dessin) ; les
  enseignes ne sont pas dans la face d'un·e ami·e (modèles statiques).
- Chantier 16 : pas de fantôme quand on construit depuis la fiche d'une tuile ; la zone
  prévue d'une amélioration ne se voit qu'après (l'onde) ; mesures d'images/s faites en rendu
  logiciel, à confirmer par le porteur avec `?debug` pendant la pose.
- Les camps posés sur le jus flottent un peu.
- Pas de modération automatique du chat (signalements seulement).
- Compte : seule la colonie **solo** d'un·e invité·e suit une connexion à un autre compte (ses
  colonies d'univers restent à l'utilisateur invité) ; le passage par Google n'a pas pu être
  testé avec le mock (pas d'OAuth), seulement par tests unitaires.
- Déménager un bâtiment (garder son niveau contre un coût) : écarté du chantier 01, à revoir.
- Remboursement de démolition approximatif quand plusieurs copies ont été construites (prix de la
  dernière copie).
- Audio : changements de l'admin visibles au rechargement seulement (pas de Realtime) ; pas
  d'onglet pour gérer les admins (SQL) ; ambiance de nuit synthétisée (grillons), pas encore de
  son dédié à l'aube ni aux saisons ; sons CC0 choisis sans écoute (à valider à l'oreille,
  remplaçables depuis `/admin`).
- Chantier 03 : compétences de combat contre
  furets et chauves-souris au chantier 06 ;
  le bot d'équilibrage n'utilise pas de mage.
- Chantier 04 : l'hiver reste doux pour une colonie saturée (stocks et gisements pleins) ; à
  durcir quand l'économie aura plus de débouchés (chantiers 05+). Les chantiers et l'expérience
  ne ralentissent pas la nuit. Une partie du bot coûte ~2× plus de calcul (lits, moral) : le
  rapport 200 graines prend ~40 min.
- Chantier 05 : les multiplicateurs de menaces des biomes (furets, chauves-souris) attendent le
  chantier 06 ; le bot n'utilise pas les chemins, alors qu'ils aident beaucoup dans le Delta ;
  l'intro n'a pas été chronométrée sur un vrai téléphone.
- Chantier 06 : modèles procéduraux pour furets, chauves-souris et tourelles (les modèles
  Sketchfab proposés sont trop lourds ou non téléchargeables : à remplacer par des glTF décimés
  si le porteur en fournit) ; pas de variantes d'ennemis ni de raids ciblés venus des faces
  provoquées (la provocation augmente seulement la puissance) ; le bot ne pose pas de camp sur
  les météorites ; la mise en scène ne joue que si le joueur est là à l'impact.
- Chantier 07 : le bot de colonie n'envoie pas d'expéditions (sonde dédiée
  `pnpm balance:expeditions`) ; les faces aliens des autres kiwis ne sont pas dessinées en 3D
  (seulement la carte SVG de la cible) ; le client en
  ligne interroge le serveur toutes les 5 s quand un vaisseau a atterri (pas de Realtime) ; pas
  encore de colonisation ni de caravanes entre faces alliées ; le porteur doit exécuter la
  migration `20261024000000_hide_game_state.sql`.
- Chantier 08 (1re moitié) : les niveaux 4 à 6 réutilisent le modèle du niveau 3 agrandi (avec
  l'habillage de l'âge) ; pas encore de nouvelles unités ni d'arme à feu visible sur les
  guerrier·ères ; l'âge d'un·e ami·e n'est pas montré sur la face jumelle ; le rapport
  d'équilibrage sur 72 h n'atteint que l'âge de pierre (sonde longue `pnpm balance:ages`).
- Chantier 08 (2e moitié) : pas encore de colonisation (là où les Kikiwiwis serviront le plus) ;
  le bot ne terraforme pas et n'emmène pas son Kikiwiwi en expédition ; les obstacles ne gênent
  pas la marche ; pas de son dédié au Kikiwiwi.
- Passe perf d'octobre 2026 (caméra saccadée sur desktop, voir `DECISIONS.md`) : tick divisé
  par ~2,3 et étalé sur deux images, GPU allégé en Basse. À confirmer par le porteur avec
  `?debug` (médiane, à-coups, temps GPU, coût du tick) sur le MacBook Pro 2015 et le PC i5.
  Pistes suivantes si ça ne suffit pas : terrain moins cher (le plus gros poste GPU), simulation
  (`advance`) dans un worker.
- Chantier 10 : mesures faites en Chromium headless (rendu WebGL logiciel) : le coût GPU réel
  n'est pas mesuré ; le porteur peut relever images/s, p95 et temps d'ouverture des menus avec
  `?debug` sur son MacBook Pro 2015 et chez ses ami·es (desktop lent). Animations des
  bâtiments toujours un mesh par partie animée (leur JS ne ressort pas dans les profils ; à
  passer en instancing si un vrai GPU les montre). La planète alien « fixe » se comporte
  comme la lune (direction et orientation fixes, hauteur selon le zoom). Lueurs CSS animées : passées
  en opacité d'un `::after` (passe perf d'octobre 2026). L'inertie n'est pas testée sur un vrai téléphone.
- Retours de partie à plusieurs (octobre 2026, corrigés hors chantier) : un kiwi par joueur
  (jumelle alien), univers créé depuis la colonie solo, planètes alliées visibles et visitables
  en lecture, écran d'erreur au lieu d'un fond vide, récap discret, caméra conservée. Reste :
  la cause exacte de « certains ne peuvent pas construire » n'a pas été reproduite avec le mock
  (l'écran d'erreur affiche désormais le message à transmettre) ; le porteur doit exécuter la
  migration `20261025000000_member_planet_seed.sql`.
- Chantier 11 : l'écran Plans recalcule ses chiffres à chaque tick tant qu'il est ouvert (à
  mémoïser si le chantier 10 le voit dans ses mesures) ; les icônes n'ont pas été relues sur un
  vrai téléphone ; le Kikiwiwi, les obstacles et les camps ne sont pas dans l'arbre ; les
  silhouettes des niveaux 4 à 6 restent celles du niveau 3 (plus grand, clous et fanions
  dorés, habillage de l'âge).
- Livraisons entre alliés (dons libres par l'oiseau de l'aire d'envol, sans risque) : faites.
  Pas encore d'offres d'échange, de prêt de kiwis ni de renforts ; l'oiseau visiteur est
  toujours en bois (on ne connaît pas l'âge de l'allié·e) ; le bot ne livre pas (solo).
- Chantier 14 : la colonie solo ne peut être emportée que si elle est chargée (on rejoint
  depuis le solo) ; pas d'export/import par fichier (écarté : triche) ; pas de « quitter un
  univers » ; la puissance des alliés vient de l'instantané (`universeInfo`), pas du temps réel ;
  le porteur doit exécuter la migration `20261026000000_universe_imports.sql` (d'ici là, la
  fonction retombe sur les anciennes colonnes : imports permis, pas de badge « venue du solo »).
- Chantier 18 (constaté au chantier 13) : avec le nouveau bot, la sonde `pnpm balance:ages`
  n'atteint l'Industrie que pour la moitié des graines, même sans aucun coût en poussière : le
  monument de l'Industrie est commandable mais une autre décision de `decide` passe toujours
  avant (graine `ages-0`, couronne de pépins).
- Chantier 15 : en automatique, retirer un kiwi d'une tâche le fait remplacer aussitôt (passer
  la tâche en manuel pour garder la main) ; le bot ne coupe jamais un automatisme ; le
  dégagement des souches passe toujours par la file (pas de poste temporaire).
- Chantier 13 : ramassage automatisé depuis le chantier 15 ; comète propre à chaque face, non
  montrée sur les planètes alliées ; pas de son dédié aux bénédictions ; la sonde `pnpm balance:ages` vérifie que les
  âges n'attendent pas une comète de trop.
- Chantier 21 : barre au pouce et menu vérifiés en Chromium headless (tactile émulé) sur
  375×667, 393×852, 915×412 et 820×1180 ; à essayer sur un vrai téléphone (zones de geste du
  système, encoche). `scripts/tutorial-mobile.mjs` rejoue le tutoriel au doigt (serveur de dev
  lancé) : à relancer après tout changement du HUD mobile. Pas de « Expéditions » dans le
  menu (on part de l'aire d'envol). Les autres écrans (Plans, Défense, Village) ne sont pas
  repensés pour le pouce (boutons d'action en haut).
- Chantier 22 : l'intro n'a été vue qu'en rendu logiciel (images pas à pas) ; la fluidité sur
  un vrai téléphone moyen (60 images/s visées) reste à confirmer par le porteur ; les sons
  `intro.slice` et `intro.juice` sont synthétisés, choisis sans écoute (remplaçables depuis
  `/admin`) ; les filets de jus sont des cylindres (pas de vraie goutte qui s'étire).
- Chantier 23 : mesures en rendu logiciel seulement (le GPU du conteneur est émulé) : le gain au
  repos se compte en images dessinées (60 → 30 → 20 par seconde ; 144 → 60 sur un écran 144 Hz),
  le temps GPU réel et la montée `auto` vers Haute (seuil 5 ms) sont à vérifier sur le PC du
  porteur avec `?debug`. Restent : frémissement d'une touffe quand un kiwi récolte et
  particules de cueillette ; reflets mouvants du jus ; fumée des cheminées (les émetteurs
  existants suffisent pour l'instant) ; soleil vraiment rasant (essayé : sol trop sombre).
