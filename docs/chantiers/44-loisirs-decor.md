# Chantier 44 — Loisirs et décor

Acte III « Le village vivant » du [carnet de route](../CARNET_DE_ROUTE.md). **Simulation +
client.** Après le **43** (jauge de moral par kiwi). **Fiche courte** : on la détaille au début de
sa session (choix des jeux et des décorations avec le porteur).

**Skills à charger** : `kiwar-cycles`, `kiwar-client` (+ `kiwar-audio` pour les sons).

## Intention du porteur

- « Nouveaux bâtiments qui ne comptent pas dans le décompte : **décorations** (fontaines à jus de
  kiwi, lampadaires et luminaires, statue du maire…), **animations**. On veut vraiment donner
  VIE à notre village. »
- « **Canon à feu d'artifice**, utilisable la nuit uniquement, postable aussi sur les murailles.
  Il déclenche un feu d'artifice spectaculaire selon différents motifs (bouquets, forme de kiwi
  fruit, de kiwi oiseau). Il consomme des ressources à l'utilisation mais booste le moral. »
- « **Quartier Rouge-Gorge** pour améliorer le moral des troupes, accessible le soir, au design
  du Moulin-Rouge avec des lumières rouges suaves visibles la nuit. »
- « Différents bâtiments de **jeu et d'activités** pour qu'un kiwi au moral bas remonte sa
  jauge. »

## Décisions déjà prises

- **Cabaret du Rouge-Gorge**, façon Moulin-Rouge (23 octobre 2026) : spectacle de cancan des
  rouges-gorges et lumières rouges suaves la nuit. Il donne un gros bonus de moral le soir et
  reste jouable au bureau et entre collègues.
- **Décorations hors quota**, au coût croissant à chaque copie, avec de la beauté dans un rayon
  (défaut, modifiable).
- Déblocages proposés par le carnet :
  - à l'Éden, les premières décorations ;
  - à la Pierre, la fontaine, la statue du maire et les jeux ;
  - au Fer, le cabaret et le canon à feu d'artifice.

## Proposition (à chiffrer en début de session)

- **Décorations**, sur 1 tuile chacune : fontaine à jus de kiwi, lampadaires et lampions,
  statue du maire, massifs de fleurs, arches de liane… Elles donnent de la **beauté** dans un
  rayon (besoin du 43) et des lumières la nuit (chantier 23 : lumières sobres).
- **Jeux**, à choisir avec le porteur : quilles de pépins, balançoire en liane, mare aux
  ricochets. Ils donnent du **loisir** : les kiwis au moral bas y vont hors travail.
- **Cabaret du Rouge-Gorge** (3 tuiles, Fer) : ouvert le soir. Les kiwis y entrent, on entend la
  musique et les enseignes rouges brillent ; le moral monte, avec un coût d'entretien en jus.
- **Canon à feu d'artifice** (sur 1 tuile ou sur un rempart, Fer) :
  - un spectacle à motifs (bouquets, kiwi-fruit, kiwi-oiseau), seulement la nuit ;
  - il consomme des ressources, dont de la poussière d'étoile pour les grands motifs (skill
    `kiwar-sky`) ;
  - il donne du moral à tous ceux qui le voient ;
  - il réveille le limiteur d'images (`renderer.wake()`).
- Contenu : kit du 33, animations du 34, sons dédiés.

## Découpage proposé

1. Décorations : données hors quota, coût croissant, beauté dans un rayon ; modèles.
2. Jeux : loisirs, visites des kiwis au moral bas ; modèles et animations.
3. Cabaret du Rouge-Gorge : soirées, lumières, son.
4. Canon à feu d'artifice : motifs, coût, moral, rempart.
5. Bot, équilibrage, captures de nuit desktop + téléphone, docs, `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- Un village décoré se voit et se vit : lumières le soir, kiwis aux jeux, spectacle au cabaret.
- Un feu d'artifice la nuit est spectaculaire, coûte cher, et remonte le moral de façon visible.
- Les images/s de nuit restent dans le budget du chantier 23.

## Réalisé (octobre 2026)

Réponses du porteur en début de session : tous les jeux et décors proposés ; la beauté
**commune** au village ; les jeux sont **de simples loisirs** ; les chiffres recommandés.

- **Décors** (1 tuile, hors quota, ×1,4 par copie) : lampions (Éden, Nid 2 ; lampadaire de fer
  au Fer, réverbère de laiton à l'Industrie, selon l'âge de la colonie), massif de fleurs (Nid
  2), arche de liane (Nid 3), fontaine à jus et statue du maire (Pierre, Nid 4 ; la statue est
  unique). Beauté commune dans `colonyMood` : +1 par décor, +3 la statue, plafond +8
  (`BEAUTY`, `beautyOf`). Lampions et fontaines luisent chaque nuit.
- **Jeux** (1 tuile, hors quota, ×1,6) : balançoire en liane (Éden, Nid 2), quilles de pépins,
  mare aux ricochets, toboggan d'écorce (Pierre). Loisirs de rayon 3 : premier loisir +8,
  chaque autre type +3, plafond +14 (le feu de camp compte). En 3D, environ la moitié des kiwis
  dont le lit est à portée y jouent quand ils se reposent le jour ou n'ont pas de poste.
- **Cabaret du Rouge-Gorge** (Fer, Nid 7, 3 tuiles, unique, hors quota) : à la tombée de la
  nuit, s'il est ouvert et que le stock a 60 de jus, il les prend et les kiwis libres qui
  dorment à 6 cases gagnent +12 jusqu'au lendemain soir ; sans jus il reste fermé. Halo rouge,
  fenêtres allumées les soirs d'ouverture, rouges-gorges qui dansent, galop synthétique.
- **Canon à feu d'artifice** (Fer, Nid 7, unique, hors quota, aussi sur la peau) : la nuit, une
  fois par nuit pour tout le village. Bouquets 150 graines + 100 jus, +6 pendant 6 h ;
  kiwi-fruit + 3 poussière, +10 pendant 8 h ; kiwi-oiseau + 8 poussière, +15 pendant 12 h.
  Spectacle en particules qui s'ouvre aussi haut que l'écran le permet.
- Famille « Vie du village » dans les plans (Mairie, feu de camp, cabaret, canon, jeux, décors) ;
  le camp d'entraînement et la Forge y ont retrouvé leur famille.

Reste à tester avec le porteur : le ressenti de la beauté commune (placement sans effet), la
valeur d'un soir au cabaret face à son coût en jus (faible au Fer), et la fréquence des feux
d'artifice (un par nuit, coût en poussière).
