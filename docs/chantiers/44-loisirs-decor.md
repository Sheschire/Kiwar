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
