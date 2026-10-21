# Chantier 19 — Colonisation de la face alien jumelle

Fonctionnalité annoncée depuis `VISION.md` (« coloniser une autre face sera possible, mais
difficile : un combat de boss exigeant de grosses unités ») et préparée par les chantiers 07
(vaisseau, expéditions) et 08 (Kikiwiwis, travaux de titan). Jugée **primordiale** par le
porteur (fin octobre 2026).

## Intention du porteur

- La planète alien dans le ciel doit se comprendre comme **une planète à coloniser** (le
  chantier 17 la rend visible dès un léger dézoom).
- C'est là que les Kikiwiwis doivent servir le plus.

## État actuel (code)

- La **face jumelle** est générée, affichée dans le ciel sous un brouillard de guerre
  (`render/twin.ts`) et visée par les expéditions (`state.targets`, `aliens:<kiwi>:<face>`).
- Sa **garnison alien** est cachée au client (règle anti-triche, skill `kiwar-expeditions`) et
  n'est résolue que par le serveur. Les rapports d'intel vieillissent ; les raids rapportent du
  butin et font des pertes.
- Kikiwiwis (chantier 08) : une par vaisseau, touchent le sol et les volants, et les travaux de
  titan modifient la carte (`state.terraform`, skill `kiwar-titans`).
- Un joueur peut déjà avoir **plusieurs colonies** (solo + univers) avec un sélecteur ; chaque
  colonie est un état de jeu indépendant.
- La colonisation n'existe pas.

## Réponses du porteur (fin octobre 2026)

1. On colonise **la face alien jumelle** (l'autre moitié de son kiwi), en solo comme en univers.
   Pas les faces des autres joueur·euses.
2. Une face colonisée devient une **seconde colonie jouable** : on bascule entre les deux faces.
3. Le boss se prend par un **siège en plusieurs assauts** : reconnaissance, têtes de pont, puis
   l'assaut final contre la reine des furets. Chaque assaut est résolu en une fois, avec une
   mise en scène.

## Réponses du porteur aux questions ouvertes (octobre 2026, 1re conversation)

1. Ouverture : **âge du Fer + un Kikiwiwi** (vaisseau de l'âge).
2. **3 têtes de pont au plus, 2 exigées** pour l'assaut final ; contre-attaques **annoncées,
   environ une par jour** (20–30 h, 6 h de préavis). On tient une tête de pont avec **des kiwis
   postés** (absents, nourris sur les stocks). Une tête de pont prise par une contre-attaque
   perd **50 à 90 % de ses kiwis** (pertes lourdes).
3. Seconde colonie : **recherche partagée, monument (âge) propre**.
4. Une colonie conquise ne redevient **jamais** alien.
5. On ne colonise **que la jumelle** (les autres faces aliens restent des cibles de raid).
6. L'aménagement : **un Kikiwiwi posté** sur la tête de pont l'aménage (12 h, du jus) ; il faut
   une tête de pont aménagée pour l'assaut final.
7. À la victoire (1re moitié) : face conquise, brouillard levé, « Fonder la colonie » grisé.

## Fait (1re conversation)

- **Simulation** (`data/siege.ts`, `sim/siege.ts`, sauvegarde v22) : verrou du siège, vérité
  cachée tirée de la graine secrète de la garnison (forces des 6 secteurs extérieurs, secteur
  et puissance sol / air de la reine), reconnaissance approfondie, missions `assault`,
  `reinforce`, `final` (et `retreat` des survivant·es), poste `outpost`, contre-attaques à
  heure et cible publiques et force cachée, aménagement, assaut final, face conquise. Le
  serveur résout les contre-attaques à `load` (`hiddenDue`), l'import d'une sauvegarde locale
  remet le siège à zéro (`resetSiege`). Tests `test/siege.test.ts`.
- **Client** : écran Siège (`SiegeModal`, carte des 12 secteurs `SiegeMap`), planificateur
  réglé par `actions.planSiege` (qui reste, qui rentre, sol et air contre la reine), badge de
  contre-attaque, entrées barre du haut / menu du téléphone / aire d'envol, rapports, toasts,
  sons, spectacle 2D `SiegeShow`, fanions des têtes de pont sur la jumelle.
- **Sonde** : `pnpm balance:siege` (siège ouvert à 143–171 h ; voir `DECISIONS.md`).
- Pas de migration SQL (tout est dans l'état de jeu).

## Reste (2e conversation)

- **Seconde colonie** : « Fonder la colonie » crée un état lié (même calendrier, carte de la
  jumelle, survivant·es comme colons, Nid niveau 1, ressources débarquées), recherche
  partagée, monument propre, sélecteur de colonies, planète sœur éclairée dans le ciel
  (position du chantier 24 : l'autre moitié du kiwi est toujours à `twinPlace()`, dessinée
  avec `setTwin(map, { fog: false, friend })` ; voir le skill `kiwar-world`), **migration SQL** (lignes `games` liées, RLS) et mode local (deux
  sauvegardes liées).
- **Liaisons** entre les deux faces (vaisseau, oiseau ; réutiliser les livraisons) et
  **menaces** de la seconde colonie (vagues plus faibles au début) ; traces des aliens
  (ruines, nids) en tuiles spéciales.
- **Mise en scène 3D** : la jumelle se rapproche pendant les assauts
  (`renderer.setTwinApproach(t)`, chantier 24 ; à jouer depuis chez soi, `travelTo('twin')`
  pour aller la voir),
  combat, chute de la reine, brouillard qui se lève sur la vraie planète.
- **Bot** : mener un siège (reconnaissance, assauts, renforts, aménagement, assaut final) et
  mesurer quand la colonisation arrive (visée : âge du Fer avancé) ; ajuster `SIEGE`.
- Univers partagé : les allié·es voient la seconde colonie, lui livrent, renforts plus tard.

## Proposition

### Le siège

- **Condition d'ouverture** : âge du Fer et au moins un Kikiwiwi (à confirmer), vaisseau de
  l'âge.
- **Étape 1 — Reconnaissance approfondie** : révèle la carte de la face (les secteurs tenus par
  les aliens, la position de la reine) avec une précision qui dépend de l'intel.
- **Étape 2 — Têtes de pont** (2 ou 3) : des assauts sur des secteurs. Chaque victoire installe
  une tête de pont, qui réduit la garnison de la reine et ouvre une zone de débarquement. Les
  aliens **contre-attaquent** les têtes de pont (événement serveur) : il faut les tenir ou
  revenir.
- **Terraformation** : une tête de pont doit être aplanie ou dégagée par un Kikiwiwi (travaux de
  titan sur la face cible) avant de recevoir l'assaut final.
- **Étape 3 — Assaut final** contre la **reine des furets** (boss : sol et air, très forte
  résistance) : il faut la puissance des Kikiwiwis + les classes de combat. En cas de défaite,
  pertes lourdes mais les têtes de pont restent (sauf contre-attaque).
- **Mise en scène** : la face jumelle se rapproche dans le ciel, avec le combat et l'effondrement
  de la reine, puis le brouillard se lève.

### La seconde colonie

- À la victoire, la face jumelle devient une colonie du joueur : un **nouvel état de jeu** lié au
  premier (même calendrier), qui démarre avec les survivant·es de l'assaut final comme
  colons, un Nid niveau 1 et les ressources débarquées.
- Les biomes de la face, déjà générés, se jouent comme une face normale ; les traces des aliens
  (ruines, nids de furets) donnent des tuiles spéciales.
- **Liaisons** : le vaisseau et l'oiseau mécanique transportent ressources et kiwis entre les
  deux faces (réutiliser les livraisons entre alliés).
- **Menaces** : la seconde colonie subit des vagues (les derniers aliens), plus faibles au début.
- Le sélecteur de colonies passe d'une face à l'autre ; la planète dans le ciel devient la
  colonie sœur, éclairée.

### En univers partagé

- Chaque joueur·euse colonise **sa** jumelle ; les alliés voient la seconde colonie (lecture),
  peuvent lui livrer et y envoyer des renforts plus tard.
- Classement : « faces colonisées » devient un jalon des ligues (plus tard).

## Impact technique

- **Serveur** : le siège dépend de la garnison cachée. Chaque assaut et chaque contre-attaque est
  résolu par le serveur (`canResolveArrival`), jamais par le client. On étend `AlienGarrison`
  (secteurs, reine, têtes de pont) et `test/aliens.test.ts`.
- **Seconde colonie** : création d'un état de jeu à partir de la carte de la face jumelle (même
  graine de monde), liens entre colonies (`linkedColonies`), liaisons comme les livraisons.
  Probablement des **migrations SQL** (lignes `games` liées, droits RLS) : nouvelle migration,
  `pnpm build:sql`, SQL complet donné au porteur.
- Mode local : deux sauvegardes liées dans le navigateur.
- Client : écran Siège (étapes, prévisions par assaut), mise en scène, sélecteur de colonies,
  bascule de la planète dans le ciel.
- **Bot** : il doit pouvoir mener un siège pour mesurer quand la colonisation arrive (à ajouter au
  bot du chantier 18).

## Découpage proposé

Chantier très gros : prévoir **deux conversations**.

1. **Siège** (1re conversation) : conditions, reconnaissance approfondie, têtes de pont et
   contre-attaques, garnison étendue côté serveur, écran Siège.
2. **Assaut final** : la reine, la terraformation de la tête de pont, la mise en scène.
3. **Seconde colonie** (2e conversation) : création de l'état lié, colons, sélecteur, planète
   sœur dans le ciel, migration SQL.
4. **Liaisons** entre les deux faces et menaces de la seconde colonie.
5. **Bot et équilibrage** (colonisation visée vers l'âge du Fer avancé : à fixer), docs, nouveau
   skill `kiwar-colonies`.

## Critères d'acceptation

- Un·e joueur·euse comprend dès la planète dans le ciel qu'il y a une face à prendre, et ce qu'il
  faut pour l'ouvrir.
- Le siège demande plusieurs jours, des Kikiwiwis et des décisions (quand attaquer, tenir les
  têtes de pont).
- Aucune information cachée sur les aliens n'arrive au client avant d'être découverte.
- La seconde colonie se joue comme la première, et les liaisons fonctionnent hors ligne.

## Questions ouvertes

1. Condition d'ouverture : âge du Fer + un Kikiwiwi, ou dès l'âge de Pierre (avec un siège plus
   long) ?
2. Combien de têtes de pont, et à quelle fréquence les contre-attaques ?
3. La seconde colonie a-t-elle son propre âge, ou partage-t-elle l'âge et la recherche de la
   première ?
4. Une colonie perdue (vagues) peut-elle redevenir alien, ou jamais (règle « jamais de colonie
   rasée ») ?
5. Après la jumelle : coloniser d'autres faces aliens d'un univers plus tard ?
