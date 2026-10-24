# Kiwar — dette et idées en attente

> Ce qui reste des chantiers faits (01 à 24), sorti de `PLAN.md` en octobre 2026 pour alléger
> chaque session. À lire seulement quand un chantier y renvoie ; à mettre à jour quand un
> chantier règle ou crée une dette.

## Trouvé par l'audit du carnet de route (octobre 2026)

- La recherche s'arrête hors ligne après une technologie (rien n'est choisi ensuite) : voulu
  (une décision au retour), à revoir si le chantier 30 le juge trop punitif.

## Des chantiers précédents

- Chantier 38 : le bot ouvre beaucoup de nouveaux sites (jusqu'à 16 ateliers de fibre) pendant
  l'âge du Fer, ses niveaux 7+ attendant le fer ; ses décisions coûtent ~0,3 s à 200 h (sites
  cherchés à chaque tour) : les sondes longues sont lentes. Il économise pour le monument sans
  relancer une production à sec (une toundra à 0 jus a attendu le Fer jusqu'à 102 h). Le
  piège des tourelles 3+ qui mangent le fer du monument existe aussi pour le joueur : à
  surveiller (« à tester »). `accrueResearch` lit encore son débit dans `accrue`, après la
  faim (cas latent, voir `kiwar-sim`). Les mesures de ce chantier n'ont tenu qu'en morceaux
  (la mesure complète `--ages 4 --impact 2` dépasse 2 h sur cette machine) : pas d'impact
  « sans la Forge » mesuré.

- Chantier 35 : la flèche « améliorable » des badges ignore un bâtiment « à l'étroit » ; un
  kiwi envoyé au centre muré du monument y va en ligne droite ; une tuile couverte qui
  s'inonde n'est pas re-vérifiée ; rotation au pouce à confirmer sur un vrai téléphone.

- Chantier 33 : looks par âge vérifiés en Chromium sans GPU (planche `?sheet`, captures) ;
  images/s à confirmer avec `?debug` sur le MacBook et un vrai téléphone (rendu logiciel :
  +4 % par image pour un village industriel complet). Le monument et le labo gardent leurs
  modèles (déjà un par niveau / habillés en Fer) ; le camp de cueillette n'a qu'un look. Les
  empreintes de 3 et 7 tuiles sont faites au chantier 35 (`render/models/spread.ts`).
  Les enseignes 3D (`signs.ts`) restent des icônes SVG. La face d'un·e ami·e montre aussi les
  looks par âge (ils suivent le niveau), sans les vignettes.

- Chantier 32 : mesures du chargement en Chromium sans GPU seulement (la compilation des
  shaders y domine, 3–4 s) ; à mesurer sur le MacBook et un vrai téléphone avec `?debug`
  (ligne « Chargement ») pour savoir ce que `compileAsync` gagne vraiment. Hors ligne, une
  longue absence coûte encore son `advance` avant l'affichage (0,3 s pour 48 h sur desktop).
  De jour, peu d'étoiles se voient sur le ciel pastel (voulu, à revoir si le porteur veut un
  cosmos plus présent). Le carrefour des routes de l'âge industriel reste chargé.

- Chantier 34 : animations vérifiées en Chromium sans GPU seulement (captures et planche
  `?kiwis`), pas encore sur un vrai téléphone ni sur le MacBook avec `?debug` ; les Kikiwiwis
  gardent leur propre modèle (`kikiwiwi.ts`, pas les extraits) ; les extraits de combat
  (épée, sort, fronde, masse) ne servent qu'aux leçons de l'École et aux exercices des gardes
  en attendant le moteur de bataille (36) ; les effets feu et suie attendent les incendies ;
  les élèves d'une École voisine du Nid se serrent parfois sur un chemin ; plusieurs gardes
  d'un secteur à une seule tourelle se partagent le même poste (écartés de 0,1 à 0,3).

- Chantier 24 : vue espace et vol entre planètes vérifiés en Chromium sans GPU seulement (à
  essayer sur un vrai téléphone et sur le MacBook avec `?debug` en dézoom) ; la jumelle passe
  d'un coup du disque peint au détail pendant le vol ; la caméra ne suit pas une jumelle qui
  se rapproche pendant une visite ; les faces aliens inconnues de l'univers ne sont pas
  dessinées (seulement la carte des cibles).
- Chantier 19 : les kiwis qui rentrent d'une tête de pont tombée volent sans vaisseau
  visible ; la planète sœur d'un·e allié·e n'est pas dessinée (les livraisons marchent) ; la
  sœur n'a pas de cibles d'expédition ; `UniverseModal` ne liste pas la sœur ; le bot ne
  conquiert qu'environ deux tiers des parties en 12 jours ; la sœur grandit très vite
  (technologies partagées, cargaisons) ; mise en scène 3D vérifiée en Chromium sans GPU
  seulement. Voir « Reste » dans `docs/chantiers/19-colonisation.md`.
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
- Chantier 12 : les rapports de vague ne gardent que les totaux ; le bot n'utilise toujours pas
  les chemins (le gain logistique n'est pas mesuré par l'équilibrage).
- Chantier 17 : ~~les niveaux 4 à 6 gardent la silhouette du niveau 3~~ (réglé au chantier 33) ; la nuance de la planète alien (Kiwino pâle sous le brouillard) n'est pas retouchée ;
  mesures d'images/s en rendu logiciel seulement (à confirmer avec `?debug` sur un vrai GPU,
  la planète alien n'est plus dessinée au zoom par défaut depuis le chantier 24) ; les
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
- Chantier 08 (1re moitié) : ~~les niveaux 4 à 6 réutilisent le modèle du niveau 3 agrandi~~
  (réglé au chantier 33) ; pas encore de nouvelles unités ni d'arme à feu visible sur les
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
  passer en instancing si un vrai GPU les montre). La planète alien a une vraie place
  fixe dans l'espace depuis le chantier 24. Lueurs CSS animées : passées
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
