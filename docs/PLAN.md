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

| #   | Chantier                                                               | État       |
| --- | ---------------------------------------------------------------------- | ---------- |
| 01  | Démolition et bâtiments vivants                                        | ✅         |
| 02  | Audio : socle, sons de base, espace admin                              | ✅         |
| 03  | Kiwis individuels : niveaux, métiers, classes, shiny                   | ✅         |
| 04  | Besoins et cycles : faim, fatigue, jour/nuit, saisons                  | ✅         |
| 05  | Intro, choix de la face, biomes, brouillard                            | ✅         |
| 06  | Menaces : furets et chauves-souris, défenses, cadeaux du ciel          | ⏭ prochain |
| 07  | Vaisseau kiwi géant et exploration                                     | à faire    |
| 08  | Âges, recherche contre nature, Kikiwiwis                               | à faire    |
| —   | Plus tard : ligues (classement), JcJ optionnel, colonisation, échanges | idées      |

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
  chantier 06 ; seules la face jumelle et son occupant·e sont dessinés (les autres kiwis d'un
  univers : chantier 07, avec la reconnaissance qui révélera une image figée sous le
  brouillard) ; le bot n'utilise pas les chemins, alors qu'ils aident beaucoup dans le Delta ;
  l'intro n'a pas été chronométrée sur un vrai téléphone.
- Performance des animations non mesurée sur un vrai téléphone (un mesh par partie animée, ~1 à
  10 par bâtiment) : à vérifier, sinon passer les drapeaux en instancing.
