# Chantiers

Un chantier = un sujet de fond, traité dans **une conversation neuve** (lancée en mode plan).
Chaque document décrit l'intention du porteur, des propositions de game design chiffrées, l'impact
technique, un découpage en parties jouables, des critères d'acceptation et les **questions
ouvertes** à poser au porteur avant de coder.

Ordre recommandé (les dépendances sont indiquées dans chaque document) :

| #   | Chantier                                                                                 | Dépend de            | En parallèle possible |
| --- | ---------------------------------------------------------------------------------------- | -------------------- | --------------------- |
| 01  | [Démolition et bâtiments vivants](01-demolition-batiments-vivants.md)                    | —                    | avec 02               |
| 02  | [Audio : socle, sons de base, espace admin](02-audio.md)                                 | —                    | avec 01               |
| 03  | [Kiwis individuels : niveaux, métiers, classes, shiny](03-kiwis-rpg.md)                  | 01                   | non                   |
| 04  | [Besoins et cycles : faim, fatigue, jour/nuit, saisons](04-besoins-cycles.md)            | 03                   | non                   |
| 05  | [Intro, choix de la face, biomes, brouillard](05-intro-faces-biomes.md)                  | 04                   | non                   |
| 06  | [Menaces : furets et chauves-souris, défenses](06-menaces-predateurs.md)                 | 03, 04               | non                   |
| 07  | [Vaisseau kiwi géant et exploration](07-vaisseau-exploration.md)                         | 05, 06               | non                   |
| 08  | [Âges, recherche contre nature, Kikiwiwis](08-ages-recherche-kikiwiwi.md)                | 07                   | non                   |
| 09  | [Gestion des kiwis : affectation, priorités, postes](09-gestion-kiwis.md)                | 08                   | avec 10               |
| 10  | [Confort visuel et performance](10-confort-visuel-performance.md)                        | —                    | oui (client seul)     |
| 11  | [Lisibilité de la construction](11-lisibilite-construction.md)                           | 08                   | avec 10               |
| 12  | [Logistique visible, vagues orientées](12-logistique-vagues-orientees.md)                | 10                   | non                   |
| 13  | [Comètes et poussière d'étoiles](13-cometes-poussiere-etoiles.md)                        | 08                   | non                   |
| 14  | [Emporter sa colonie solo dans un univers](14-import-solo-univers.md)                    | —                    | oui (serveur)         |
| 15  | [Colonie autonome : constructions, recherche, météorites](15-colonie-autonome.md)        | 13                   | non                   |
| 16  | [Pose et terrain lisibles](16-pose-terrain-lisible.md)                                   | —                    | avec 15 (client)      |
| 17  | [Identité visuelle : bâtiments, planète alien, ciel](17-identite-visuelle.md)            | audit d'optimisation | avec 15               |
| 18  | [Bot d'équilibrage complet : chemins, camps, expéditions](18-bot-equilibrage-complet.md) | 13                   | avec 16 et 17         |
| 19  | [Colonisation de la face alien jumelle](19-colonisation.md)                              | 15, 18               | non                   |
| 20  | [Correctifs et confort (tap, tri, file, inertie)](20-correctifs-confort.md)              | —                    | avec 19, 22, 23       |
| 21  | [Interface mobile : barre au pouce, menu nommé](21-interface-mobile.md)                  | 20                   | avec 19, 22, 23       |
| 22  | [Premières impressions : chargement et intro](22-premieres-impressions.md)               | —                    | oui (client seul)     |
| 23  | [Lumières HD, chemins pavés et sobriété](23-lumieres-sobriete.md)                        | 20 (conseillé)       | avec 19, 22           |
| 24  | [Caméra libre et planètes dans l'espace](24-camera-libre-planetes.md)                    | —                    | avec 19 (coordonner)  |
| 25  | [Classes : une par stat, arbre de classes](25-classes-arbre.md)                          | 19                   | non                   |
| 26  | [Bâtiments sur plusieurs tuiles](26-batiments-multi-tuiles.md)                           | 25                   | non                   |
| 27  | [Mairie et Discours](27-mairie-discours.md)                                              | 26                   | non                   |
| 28  | [Fer météorique](28-fer-meteorique.md)                                                   | 25                   | non                   |
| 29  | [Canaux de jus](29-canaux-de-jus.md)                                                     | 26                   | non                   |

« En parallèle possible » : deux conversations peuvent tourner en même temps sans se marcher
dessus (fichiers différents). Sinon, attendre que le chantier précédent soit poussé sur `main`.

## Règles communes à tous les chantiers

1. Lire `CLAUDE.md`, `docs/PLAN.md`, le document du chantier, et charger les skills utiles.
2. En mode plan : poser d'abord les questions ouvertes au porteur (questions interactives), puis
   proposer un plan découpé en parties jouables ; coder seulement après validation.
3. Une partie = un commit poussé sur `main`, testé (typecheck, lint, tests, captures desktop +
   téléphone pour le visuel).
4. **Base de données** : toute modification = une nouvelle migration dans `supabase/migrations/`,
   `pnpm build:sql`, et **le SQL complet prêt à copier-coller** donné au porteur dans la réponse,
   avec l'ordre d'exécution.
5. **Fin de chantier** : mettre à jour `docs/DECISIONS.md`, `docs/PLAN.md` (état + suite),
   `README.md`, le document du chantier (ce qui a été fait, ce qui reste), et **les skills**
   (en créer un nouveau si le chantier ouvre un nouveau domaine : audio, RPG…).
6. Le simulateur reste **déterministe et exact hors ligne** (voir skill `kiwar-sim`) : tout ce
   qui change un débit au cours du temps est un événement de `advance`.
7. Équilibrage : Kiwisu et Kiwino (et plus tard chaque biome) à ±10 % (skill `kiwar-balance`).
8. Jamais de partie bloquée : vérifier qu'aucune décision du joueur ne mène à une impasse.
