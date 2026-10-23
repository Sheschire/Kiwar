# Chantiers

Un chantier = un sujet de fond, traité dans **une conversation neuve** (lancée en mode plan).
Chaque document décrit l'intention du porteur, les **décisions déjà prises**, l'état du code
(fichiers et symboles), une proposition chiffrée, un découpage en parties jouables, des critères
d'acceptation et les **skills à charger**. La direction d'ensemble est dans le
[carnet de route](../CARNET_DE_ROUTE.md).

## À venir (carnet de route d'octobre 2026)

| #   | Chantier                                                                              | Dépend de | En parallèle possible |
| --- | ------------------------------------------------------------------------------------- | --------- | --------------------- |
|     | **Acte I — Le rythme**                                                                |           |                       |
| 30  | [Paliers, âges et réserves](30-paliers-ages-reserves.md)                              | —         | avec 32, 34           |
| 31  | [Objectifs et menaces réveillées](31-objectifs-menaces.md)                            | 30        | avec 32, 33, 34       |
| 32  | [Correctifs et ciel](32-correctifs-ciel.md)                                           | —         | oui (client seul)     |
| 33  | [Atelier de contenu : bâtiments par âge et icônes 3D](33-batiments-par-age-icones.md) | 30        | oui (client seul)     |
| 34  | [Kiwis et créatures vivants](34-kiwis-creatures-vivants.md)                           | —         | oui (client seul)     |
|     | **Acte II — La guerre des faces**                                                     |           |                       |
| 35  | [Bâtiments sur plusieurs tuiles](35-batiments-multi-tuiles.md)                        | 30, 33    | non                   |
| 36  | [Moteur de bataille : les vagues jouées pour de vrai](36-moteur-de-bataille.md)       | 34, 35    | non                   |
| 37  | [Classes, rôles de combat, camp d'entraînement](37-classes-roles-camp.md)             | 36        | non                   |
| 38  | [Forge, équipement et fer météorique](38-forge-equipement-fer.md)                     | 37        | non                   |
| 39  | [La civilisation alien](39-civilisation-alien.md)                                     | 36        | non                   |
| 40  | [Le débarquement](40-debarquement.md)                                                 | 39        | non                   |
| 41  | [La bataille en direct sur la jumelle](41-bataille-en-direct.md)                      | 40        | avec 43 (prudence)    |
| 42  | [La reine des furets](42-reine-des-furets.md)                                         | 41        | non                   |
|     | **Acte III — Le village vivant** (fiches courtes, détaillées en début de session)     |           |                       |
| 43  | [Moral par kiwi, Mairie et feu de camp](43-moral-mairie-feu-de-camp.md)               | 35        | non                   |
| 44  | [Loisirs et décor](44-loisirs-decor.md)                                               | 43        | non                   |
| 45  | [Rives fertiles et canaux de jus](45-rives-canaux.md)                                 | 35        | non                   |

L'acte IV (Tréfonds, kiwaïs, Verger cosmique) n'a pas encore de chantier : voir le carnet. Les
anciens chantiers 25 à 29, jamais commencés, sont devenus 37, 35, 43, 38 et 45.

« En parallèle possible » : deux conversations peuvent tourner en même temps sans se marcher
dessus (fichiers différents). Jamais deux chantiers de simulation en même temps : chacun
régénère le bundle de la fonction serveur (`pnpm build:functions`) et ajoute une version de
sauvegarde. Sinon, attendre que le chantier précédent soit poussé sur `main`.

## Faits (01 à 24)

01 démolition et bâtiments vivants · 02 audio · 03 kiwis individuels · 04 besoins et cycles ·
05 intro, faces, biomes · 06 menaces · 07 vaisseau et exploration · 08 âges, recherche,
Kikiwiwis · 09 gestion des kiwis · 10 confort visuel et performance · 11 lisibilité de la
construction · 12 logistique et vagues orientées · 13 comètes et poussière · 14 colonie solo
dans un univers · 15 colonie autonome · 16 pose et terrain lisibles · 17 identité visuelle ·
18 bot d'équilibrage complet · 19 colonisation · 20 correctifs et confort · 21 interface
mobile · 22 premières impressions · 23 lumières et sobriété · 24 caméra libre et planètes.
Leurs documents restent dans ce dossier (ce qui a été fait, ce qui reste).

## Règles communes à tous les chantiers

1. Lire `CLAUDE.md`, `docs/PLAN.md` et le document du chantier ; charger **seulement** les skills
   qu'il cite (et `kiwar-workflow`). Le carnet de route se relit au début d'un acte, pas à chaque
   session.
2. Les **décisions déjà prises** du document sont validées : ne pas les redemander. En mode plan,
   poser seulement les questions neuves (interactives, avec une option recommandée), proposer le
   plan découpé en parties jouables, et coder après validation. Un agent d'exploration au plus :
   les fichiers et symboles utiles sont déjà cités.
3. Une partie = un commit poussé sur `main`, testé (typecheck, lint, tests, captures desktop +
   téléphone pour le visuel).
4. **Base de données** : toute modification = une nouvelle migration dans `supabase/migrations/`,
   `pnpm build:sql`, et **le SQL complet prêt à copier-coller** donné au porteur dans la réponse,
   avec l'ordre d'exécution.
5. **Game design** : tout changement de coûts, durées, récompenses, menaces ou tout nouveau
   bâtiment passe la grille de décision du skill `kiwar-design`.
6. **Fin de chantier** (courte) : mettre à jour `docs/DECISIONS.md`, `docs/PLAN.md` (état +
   suite), `README.md`, le document du chantier (fait / reste), `docs/DETTE.md` si besoin, et
   **les skills** (en créer un nouveau si le chantier ouvre un nouveau domaine, comme
   `kiwar-battle` au 36).
7. Le simulateur reste **déterministe et exact hors ligne** (voir skill `kiwar-sim`) : tout ce
   qui change un débit au cours du temps est un événement de `advance`.
8. Équilibrage : Kiwisu et Kiwino (et chaque biome) à ±10 % (skill `kiwar-balance`). Des sondes
   ciblées pendant le chantier ; le rapport complet (~2 h) seulement en fin d'acte.
9. Jamais de partie bloquée : vérifier qu'aucune décision du joueur ne mène à une impasse.
