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

| #   | Chantier                                                               | État    |
| --- | ---------------------------------------------------------------------- | ------- |
| 01  | Démolition et bâtiments vivants                                        | ✅      |
| 02  | Audio : socle, sons de base, espace admin                              | ✅      |
| 03  | Kiwis individuels : niveaux, métiers, classes, shiny                   | ✅      |
| 04  | Besoins et cycles : faim, fatigue, jour/nuit, saisons                  | ✅      |
| 05  | Intro, choix de la face, biomes, brouillard                            | ✅      |
| 06  | Menaces : furets et chauves-souris, défenses, cadeaux du ciel          | ✅      |
| 07  | Vaisseau kiwi géant et exploration                                     | ✅      |
| 08  | Âges, recherche contre nature, Kikiwiwis                               | ✅      |
| 09  | Gestion des kiwis : affectation, priorités, tableau des postes         | à faire |
| 10  | Confort visuel et performance (caméra, planète alien fixe, lenteurs)   | à faire |
| 11  | Lisibilité de la construction (icônes, avant/après, arbre)             | ✅      |
| 12  | Logistique visible, vagues orientées, nuit plus courte                 | à faire |
| 13  | Comètes et poussière d'étoiles                                         | à faire |
| 14  | Emporter sa colonie solo dans un univers existant                      | ✅      |
| —   | Plus tard : ligues (classement), JcJ optionnel, colonisation, échanges | idées   |

**Prochaine conversation** : chantier 09 (gestion des kiwis : affectation, priorités, tableau
des postes), voir [`docs/chantiers/09-gestion-kiwis.md`](chantiers/09-gestion-kiwis.md).

## Dette et idées en attente

- Le bot d'équilibrage n'utilise ni camps, ni chemins, ni expéditions.
- Les camps posés sur le jus flottent un peu.
- Pas de modération automatique du chat (signalements seulement).
- Déménager un bâtiment (garder son niveau contre un coût) : écarté du chantier 01, à revoir.
- Remboursement de démolition approximatif quand plusieurs copies ont été construites (prix de la
  dernière copie).
- Audio : changements de l'admin visibles au rechargement seulement (pas de Realtime) ; pas
  d'onglet pour gérer les admins (SQL) ; ambiance de nuit synthétisée (grillons), pas encore de
  son dédié à l'aube ni aux saisons ; sons CC0 choisis sans écoute (à valider à l'oreille,
  remplaçables depuis `/admin`).
- Chantier 03 : compétences de combat contre
  furets et chauves-souris au chantier 06 ;
  le bot d'équilibrage n'utilise que maire et bâtisseur (pas d'expéditions ni de mage).
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
- Performance des animations non mesurée sur un vrai téléphone (un mesh par partie animée, ~1 à
  10 par bâtiment) : à vérifier, sinon passer les drapeaux en instancing.
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
