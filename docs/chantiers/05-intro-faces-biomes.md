# Chantier 05 — Intro, choix de la face, biomes, brouillard de guerre

## Intention du porteur

« Quand on débute un nouveau monde ou qu'on arrive sur le jeu la première fois, l'animation
d'entrée est un modèle 3D du kiwi dans l'espace, qui se fait soudain trancher en deux ; on voit
les deux parties se séparer et devenir l'état de jeu de base. Tout se fait vite et on comprend
qu'on peut choisir une des faces. Les biomes ne sont pas possibles partout : chaque face (Kiwisu
ou Kiwino) a ses propres biomes possibles, générés aléatoirement, chacun avec avantages et
inconvénients. L'idéal est d'équilibrer pour qu'un joueur n'ait pas envie de recommencer en
boucle jusqu'au biome le plus fort, ni de prendre toujours la même face. Chaque biome jouable,
selon les préférences du joueur. La sélection : en survolant une face, on la tourne vers le
joueur pour la montrer, l'autre en retrait, avec un menu sur le côté (bottom sheet sur téléphone)
qui explique les caractéristiques. Une fois choisie, la caméra bascule sur la face ; l'autre part
en lévitation au-dessus de notre planète (il faut dézoomer un peu pour la voir, elle ne doit pas
polluer le HUD). Impossible de voir ce qui s'y passe tant qu'on n'y va pas en vaisseau : un
brouillard de guerre sur toute la surface pour éveiller la curiosité. »

## Proposition

### Séquence d'introduction (≈ 6–8 s, passable d'un toucher)

1. Un kiwi entier (fruit, peau duveteuse) tourne lentement dans l'espace étoilé.
2. Un éclair de lame : **tranche** nette (son), le fruit s'ouvre en deux moitiés qui se séparent
   et pivotent pour montrer leurs faces (Kiwisu et Kiwino, déjà générées depuis la graine).
3. Écran de choix : survol / toucher d'une face → elle pivote vers le joueur et grossit, l'autre
   recule ; panneau latéral (bottom sheet sur téléphone) : nom de la face, biome, forces,
   faiblesses, style de jeu conseillé, aperçu des ressources (petites jauges).
4. Choix → la caméra plonge sur la face choisie ; l'autre moitié monte et reste en lévitation
   au-dessus (visible en dézoomant), couverte de brouillard.

- Les joueurs déjà installés ne revoient pas l'intro au chargement (option « Revoir l'intro »
  dans les paramètres) ; elle se joue à chaque **nouveau monde**.
- Dans un univers partagé, le choix est limité aux faces libres (les autres sont montrées
  occupées par des amis ou des extraterrestres).

### Biomes (proposition, 3 par face, tirés au hasard par monde)

Kiwisu, la face « généreuse » (pulpe, fibre) :

| Biome                   | Avantages                                          | Inconvénients                                                    |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Verger luxuriant        | grandes prairies de chair, repousse de pulpe +25 % | peu de bosquets, furets plus fréquents                           |
| Hauts plateaux duveteux | bosquets abondants, falaises (tourelles idéales)   | hivers plus longs et plus rudes, terrain accidenté               |
| Delta sucré             | rivières de jus, sols riches                       | terres morcelées par l'eau (chemins indispensables), étés chauds |

Kiwino, la face « précieuse » (pépins, jus) :

| Biome              | Avantages                                      | Inconvénients                                             |
| ------------------ | ---------------------------------------------- | --------------------------------------------------------- |
| Couronne de pépins | anneau de pépins large et riche                | chair pauvre (nourriture rare), chauves-souris fréquentes |
| Lagunes de jus     | nombreux bassins, repousse rapide au printemps | crues au printemps qui inondent des tuiles                |
| Toundra veloutée   | gisements très riches (stock élevé)            | repousse lente, hiver long, mais peu de prédateurs        |

- Un biome agit sur : `FaceProfile` de génération (proportions de tuiles, rivières, relief),
  multiplicateurs de repousse et de climat, durée/rigueur des saisons (chantier 04), fréquence
  et type de menaces (chantier 06), palette visuelle.
- **Équilibrage** : le rapport d'équilibrage compare **chaque biome** (et pas seulement les deux
  faces) ; écart cible ±10 % sur les jalons. Les avantages sont des **styles de jeu** différents,
  pas des puissances différentes.
- **Anti-reroll** : l'équilibre est la vraie réponse ; en plus, montrer les deux faces et leurs
  biomes avant de choisir (le joueur choisit parmi 2 options à chaque monde), et éventuellement
  un délai ou un coût pour recommencer un monde (à trancher).

### Face adverse en lévitation et brouillard de guerre

- La seconde moitié flotte au-dessus, assez haut pour sortir du cadre au zoom normal ; visible
  en dézoomant, avec une lente rotation et des nuages.
- Toute sa surface est sous un **brouillard** (nuages volumétriques simples / shader) : on ne voit
  que la silhouette. Une **reconnaissance** (chantier 07) révèle une image figée « vue le … »,
  qui vieillit (le brouillard revient doucement).
- Données : le client ne reçoit **jamais** l'état réel de la face adverse (anti-triche en
  ligne) ; seulement les informations révélées par les missions, stockées dans notre état.

## Impact technique

- Génération : `faceProfiles.ts` → profils de biome ; `generateFace` prend le biome ; la graine
  du monde détermine les biomes des deux faces (déterministe). Migration : les mondes existants
  reçoivent un biome « classique » équivalent à l'actuel.
- Rendu : scène d'intro (modèle du fruit entier, tranche, séparation), seconde face rendue en
  basse résolution (LOD) pour garder les performances mobiles ; caméra : transitions.
- UI : écran de choix (desktop : panneau latéral ; téléphone : bottom sheet), revoir l'intro.
- Serveur : `newWorld` / `load` acceptent le choix de face et de biome ; univers partagés :
  biomes par kiwi.
- Équilibrage : `tools/balance` par biome.

## Découpage proposé

1. Biomes en données + génération + migration + rapport d'équilibrage par biome. Commit.
2. Face adverse en lévitation + brouillard (sans intro). Commit.
3. Intro (fruit, tranche, séparation) + écran de choix desktop/téléphone. Commit.
4. Univers partagés (faces libres/occupées), revoir l'intro, polish, docs, skills.

## Questions ouvertes

1. Les biomes proposés vous plaisent-ils ? Combien par face (3 ? 4 ?) ?
2. Le joueur choisit-il seulement la face (biome imposé par le tirage), ou peut-il aussi relancer
   le tirage des biomes, avec un coût ?
3. Les faces des **amis** dans un univers partagé sont-elles visibles, ou aussi sous brouillard ?
4. L'intro doit-elle se jouer aussi à l'arrivée dans un univers partagé (nouvelle colonie) ?

## Réalisé (chantier terminé)

Réponses du porteur : 3 biomes par face (ceux proposés) ; on choisit seulement la face, le biome
est tiré par la graine (pas de relance) ; les faces des ami·es sont visibles (aperçu rafraîchi),
les faces extraterrestres sous brouillard ; l'intro se joue aussi en rejoignant un univers
(faces libres seulement) ; « hiver plus long » = plus rude, pas plus long (calendrier commun) ;
crues réelles dès maintenant, menaces en données ; les mondes existants gardent leur carte
(biome « classique » caché).

1. **Biomes** (`data/biomes.ts`, sauvegarde v9) : génération (rivières de jus à gués du Delta,
   plateaux et falaises des Hauts plateaux, anneau de pépins large, lagunes), gisements, climat,
   rigueur des saisons, **crues** de printemps des Lagunes (ni marche, ni construction, ni
   récolte sur la chair inondable ; bâtiment arrêté), palettes. Rapport d'équilibrage par biome
   (chaque biome contre la médiane de tous), biomes calculés en parallèle.
2. **Face jumelle en lévitation** : même graine de planète, cachée juste au-dessus du cadre au
   zoom normal, elle glisse dans le ciel quand on dézoome ; brouillard de nuages animés.
3. **Intro** : kiwi entier dans les étoiles, tranche (éclair, flash, son), séparation, choix
   (panneau latéral / bottom sheet, jauges de ressources, forces, faiblesses, style, chiffres du
   biome), plongée de la caméra. Premier lancement, chaque « Nouveau monde », « Revoir
   l'intro » dans les réglages ; « Passer » ou un toucher sautent au choix.
4. **Univers partagés** : intro à l'arrivée, changement de face tant que la colonie est vierge
   et que l'autre face est libre (`pickFace`) ; la face d'un·e ami·e se voit sans brouillard
   (bâtiments, bassins, nom). Aucun changement de base de données.

Reste pour plus tard : menaces des biomes (chantier 06) ; reconnaissance et image figée qui
vieillit sous le brouillard, autres kiwis de l'univers dans le ciel (chantier 07) ; le bot
n'utilise pas les chemins (le Delta est donc jugé sans eux).
