# Chantier 11 — Lisibilité de la construction et des améliorations

Retours de partie d'octobre 2026 : comprendre ce qu'on peut construire et ce qu'une amélioration
apporte.

## Intention du porteur

- Ajouter de **petites icônes** dans les menus pour comprendre directement l'idée d'une
  amélioration ou d'une recherche.
- **Voir ce qu'apporte une amélioration avant de la faire** : stats actuelles → stats futures en
  vert.
- Un **arbre des bâtiments et des améliorations** dans un menu dédié, pour voir tout ce qu'on
  peut faire, avec la sélection d'un bâtiment à poser sur une tuile.
- Il n'y a pas assez de **différences visuelles entre les niveaux 1 et 2** de certains bâtiments
  (hutte, poche de jus…) : on a du mal à voir ce qu'il reste à améliorer.

## État actuel

- Le panneau d'un bâtiment (`TilePanel.tsx`) montre le coût et la durée de l'amélioration, mais
  pas les stats suivantes.
- L'écran Recherche (chantier 08) liste les technologies par branche, sans icônes dédiées.
- Les niveaux 4 à 6 réutilisent le modèle du niveau 3 agrandi, habillé selon l'âge (dette du
  chantier 08). Les niveaux 1 à 3 diffèrent surtout par la taille et quelques détails.

## Proposition

### Icônes

- Un jeu d'icônes SVG maison (trait simple et rond, dans le style du jeu) : une par ressource,
  par effet (récolte, stockage, défense sol/air, vitesse, moral, repos, recherche…) et par
  bâtiment.
- Utilisées dans le menu de construction, les améliorations, l'arbre de recherche et les
  infobulles. Composant `<Icon name>` unique, sans police d'icônes à charger.

### Aperçu de l'amélioration

- Dans le panneau d'un bâtiment, avant d'améliorer : un tableau « niveau actuel → niveau
  suivant », avec les différences en vert (« Places 2 → 3 », « Récolte 6/h → 9/h », « Rayon
  1 → 2 », « Lits 2 → 4 »).
- Calculé par une fonction partagée `describeLevel(kind, level)` dans `packages/shared`
  (vérité unique pour l'interface et les tests).
- Même principe pour les technologies : l'effet chiffré, avant/après.

### Arbre des bâtiments

- Nouveau menu « Bâtiments » : tous les types, par famille (production, logement, stockage,
  défense, savoir, vaisseau). Pour chacun : ses niveaux, leurs effets, l'âge ou la condition qui
  les débloque, et le nombre déjà construit.
- Les bâtiments verrouillés sont grisés avec la raison (« Nid niveau 3 », « Âge du Fer »).
- **« Poser »** depuis l'arbre : le menu se ferme et les tuiles valides s'allument. Un tap pose
  le bâtiment, comme le menu de construction actuel.

### Niveaux qui se voient

- Chaque niveau ajoute un **élément de silhouette** reconnaissable de loin (un étage, une
  cheminée, un drapeau, une deuxième poche de jus, des tuiles de toit…), pas seulement une mise à
  l'échelle.
- Un petit **badge de niveau** au-dessus des bâtiments, affiché au zoom moyen ou avec un bouton
  « afficher les niveaux ».
- Option : une icône discrète « améliorable » quand on a les ressources.

## Découpage proposé

1. **Icônes** (jeu SVG et composant) dans les menus existants.
2. **`describeLevel`** et l'aperçu avant/après des bâtiments et des technologies.
3. **Arbre des bâtiments** avec la pose directe.
4. **Silhouettes par niveau** (hutte, poche de jus, puis les autres) et badges de niveau.
5. Captures desktop et téléphone, docs, skill `kiwar-client`.

## Critères d'acceptation

- Avant chaque amélioration, le joueur voit ce qu'elle change, en chiffres.
- Un·e joueur·euse distingue le niveau 1 du niveau 2 de chaque bâtiment sur une capture au zoom
  par défaut.
- Tout bâtiment peut être posé depuis l'arbre.

## Questions ouvertes

1. Un badge de niveau permanent est-il acceptable visuellement, ou seulement à la demande ?
2. L'arbre doit-il aussi montrer les bâtiments des âges futurs (en silhouette, « ??? »), pour
   donner envie ?
3. Faut-il fusionner l'arbre des bâtiments et l'arbre de recherche en un seul écran à onglets ?
