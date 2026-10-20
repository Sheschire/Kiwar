# Chantier 08 — Âges, recherche contre nature, Kikiwiwis

Ce chantier reprend l'ancien « Jalon 7 — âges » de `VISION.md` et y ajoute les Kikiwiwis.
C'est un gros chantier, à redécouper en mode plan ; il sera probablement utile de le scinder en
deux conversations (âges et recherche, puis Kikiwiwis).

## Intention du porteur

« Les Kikiwiwis sont des unités armées très puissantes, débloquables bien plus tard. Il faut
débloquer des centres de recherche élaborés pour mener des recherches contre nature : la
civilisation a trouvé le moyen de modifier génétiquement des kiwis (les unités) avec du jus de
kiwi (la planète) pour créer des créatures puissantes. Le jus coule dans leurs veines, cela se
voit : elles sont plus grosses, plus grandes, avec des lueurs vertes. Une seule au maximum par
vaisseau, je pense. Elles peuvent aussi modifier le terrain à la main (détruire des obstacles,
terraformer certaines parcelles). »

Rappels : âges individuels (chaque joueur progresse seul), terraformation limitée à des tuiles
éligibles (on ne détruit pas le paysage), coloniser une autre face = combat de boss exigeant de
grosses unités.

## Proposition

### Âges

- Éden (actuel) → Pierre → Fer → Industrie (→ plus tard). Chaque âge : un **projet de passage**
  coûteux (monument + recherche), de nouveaux bâtiments, unités, vaisseau (chantier 07),
  armes (armes à feu à l'âge industriel : les guerriers touchent alors les volants), techniques
  de terraformation, et un **changement d'apparence** du village (le kiwi s'industrialise).
- Les menaces et les cadeaux du ciel montent avec l'âge (chantier 06).

### Recherche

- Bâtiment de recherche (bibliothèque → laboratoire) servi par des kiwis à fort **Esprit**
  (chantier 03). Arbre de technologies par âge : économie, défense, exploration, « contre
  nature ». Les points de recherche s'accumulent comme une ressource (exact hors ligne).

### Kikiwiwis

- Débloqués tard (âge Fer ou Industrie), via le **Laboratoire contre nature** : un kiwi existant
  (de préférence investi, chantier 03) est **transformé** par infusion de jus. Coût énorme en
  jus, risque d'échec (le kiwi peut ne pas survivre ? à trancher), durée longue.
- Apparence : plus gros, plus grand, veines lumineuses vertes, yeux brillants, traînée de
  gouttes de jus ; son propre modèle animé.
- Puissance : combat (sol et air ?), soute réduite (prend beaucoup de place), **une seule par
  vaisseau**, entretien en jus (sinon il s'affaiblit).
- **Travaux de titan** : détruire des obstacles (rochers, souches, épaves de météorites),
  terraformer des parcelles éligibles (creuser une source de jus, aplanir, élever une
  terrasse), indispensables pour la colonisation (combat de boss).
- Limite globale (ex. 1 Kikiwiwi par âge atteint) pour qu'ils restent exceptionnels.

## Dépendances

Chantiers 03 (stats, classes), 04 (entretien, faim), 06 (combat sol/air), 07 (vaisseau, missions).

## Réponses du porteur (début du chantier)

1. **4 âges** au lancement : Éden → Pierre → Fer → Industrie ; passage **par la recherche puis
   un monument**.
2. La transformation **peut échouer, mais le kiwi survit** (blessé, affaibli, jus perdu).
3. Un Kikiwiwi touche **le sol et les volants**.
4. **Une seule par vaisseau**, et **une par âge atteint dès le Fer** (Fer : 1, Industrie : 2).
5. Les **obstacles** (rochers, souches, épaves de météorites) entrent dans la génération **dans
   ce chantier** (seconde conversation).
6. L'âge apporte : un niveau de bâtiment de plus, le vaisseau suivant, menaces et cadeaux × âge,
   armes à feu à l'Industrie. Rythme visé (joueur actif) : Pierre ≈ 1,5 jour, Fer ≈ 4 jours,
   Industrie ≈ 8 jours.
7. Découpage en **deux conversations** : âges et recherche, puis Kikiwiwis.

## Ce qui a été fait (1re conversation)

1. **Bibliothèque et recherche** : chercheur·euses choisi·es par le joueur (Esprit, maîtrise
   « recherche »), points exacts hors ligne, réserve plafonnée, arbre de 15 technologies, écran
   Recherche.
2. **Âges** : monument (3 niveaux = Pierre, Fer, Industrie), niveaux 4 à 6 de tous les
   bâtiments, vaisseau selon l'âge, menaces et météorites × âge.
3. **Effets des technologies** : récolte, stockage, tourelles, gardes, voyages, rations,
   chantiers, blessures, blindage, reconnaissance, armes à feu.
4. **Apparence par âge** : habillage des bâtiments, laboratoire, monuments, chemins, feu
   d'artifice au passage d'âge.
5. **Équilibrage** : le bot fait de la recherche et passe les âges ; sonde `pnpm balance:ages`,
   docs et skill `kiwar-ages`.

## Ce qui reste (2e conversation) — proposition de découpage

1. **Obstacles** : rochers et souches générés sur quelques tuiles (cartes `classic` identiques
   pour les tests ; anciennes parties : seulement sur tuiles libres), épaves laissées par les
   cratères de météorite ; tuiles bloquées pour la construction.
2. **Laboratoire contre nature** (âge du Fer, branche « contre nature » de l'arbre, déjà
   annoncée en grisé) et **transformation** : coût énorme en jus, durée longue, risque affiché
   (Endurance, niveau, niveau du labo) ; échec = jus perdu, kiwi blessé et affaibli.
3. **Le Kikiwiwi** : stats et puissance (sol et air), soute réduite, une par vaisseau, plafond
   1 par âge dès le Fer, entretien en jus (sinon il s'affaiblit), modèle animé (plus gros, veines
   vertes, yeux brillants, gouttes de jus), fiche.
4. **Travaux de titan** : détruire les obstacles (butin), terraformer des tuiles éligibles
   (source de jus, aplanir, terrasse).
5. **Équilibrage**, docs, skill.

## Questions ouvertes (d'origine)

1. Combien d'âges au lancement, et le passage d'âge se fait-il par monument, par recherche, ou
   les deux ?
2. La transformation en Kikiwiwi peut-elle échouer (perte du kiwi) ?
3. Un Kikiwiwi touche-t-il les volants ?
4. Limite de Kikiwiwis : par vaisseau seulement, ou aussi par colonie ?
5. Les obstacles (rochers, souches) doivent-ils apparaître dans la génération dès maintenant
   (chantier 05) pour préparer les travaux de titan ?
