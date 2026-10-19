# Chantier 03 — Kiwis individuels : niveaux, métiers, classes, shiny

Ce chantier absorbe l'ancien « Jalon 6 — unités et rôles » de `VISION.md`.

## Intention du porteur

« Faire gagner certains kiwis en niveau général, en métiers (skins différents en conséquence) et
en compétences : la vraie part RPG du jeu. On doit pouvoir consulter les membres du village
individuellement, avec leur nom, leurs compétences et leurs maîtrises. Un peu à la Pokémon : on
gère son équipe, on fait monter des kiwis en niveau, on les spécialise dans un métier et on leur
assigne des classes. On s'attache à un kiwi qui jusque-là n'avait qu'un nom à peine visible. On a
donc encore plus peur de le perdre en expédition : un kiwi dans lequel on a investi est plus fort,
donc plus utile, mais attention à ne pas le voir mourir. Des statistiques propres à chaque kiwi,
celles de base tirées au hasard. Un système de shiny : très rarement (environ 1/512 à
l'éclosion), un kiwi d'une autre couleur naît : rouge, jaune, vert ou bleu. »

Rappels des réponses précédentes : les rôles sont polyvalents (le mage aide à la récolte, le
guerrier aux constructions et travaux manuels, le maire organise la productivité) ; les mages
sont avant tout des combattants à distance (et peuvent accélérer la repousse ou faire pleuvoir) ;
un seul maire, avec une estrade pour des discours qui remontent le moral.

## Proposition

### Statistiques d'un kiwi (tirées à l'éclosion, RNG seedé)

| Stat      | Effet                                                      |
| --------- | ---------------------------------------------------------- |
| Force     | combat au corps à corps, construction, travaux manuels     |
| Agilité   | vitesse de marche (logistique), esquive, vol (volants)     |
| Endurance | fatigue plus lente (chantier 04), points de vie            |
| Esprit    | magie, recherche (chantier 08), repousse accélérée (mages) |
| Adresse   | récolte, précision au tir (tourelles, armes à distance)    |
| Charisme  | moral des autres, discours (maire), négociation            |

- Valeurs de base 1–10 (somme bornée pour éviter les kiwis parfaits), plus un **trait**
  rare (Lève-tôt, Gourmand, Courageux, Rêveur, Costaud…) avec un petit avantage et un petit
  défaut.
- **Shiny** : 1 chance sur 512 à l'éclosion ; couleur rouge, jaune, verte ou bleue (tirage
  équiprobable) ; purement cosmétique + petit éclat à l'écran à la naissance (et un son). Le
  tirage passe par le RNG du state (pas de triche côté client en ligne).
- Plus tard : apparence légèrement variée (taille, plumage) selon les stats.

### Progression

- **Niveau général** (1–30 proposé) : XP gagnée en travaillant, en construisant, en expédition
  (beaucoup plus), en défendant. Chaque niveau donne +1 point dans une stat (choisi par le
  joueur, ou auto selon la classe).
- **Maîtrise de métier** (récolteur pulpe / fibre / pépins / jus, bâtisseur, porteur…) : monte en
  pratiquant ; donne un bonus de production sur ce métier (ex. +2 % par rang, rang max 10). Un
  kiwi maître pulpier devient précieux dans sa pulperie.
- **Classes** (débloquées par des bâtiments de formation, coût en temps et ressources) :
  guerrier (épée : fort contre les furets, ne touche pas les volants), mage (distance, touche les
  volants, aide à la récolte et à la repousse), éclaireur volant (rapide, accède aux falaises,
  porte peu, touche les volants), maire (unique, moral, productivité), bâtisseur. Une classe
  donne une **apparence** (chapeau, cape, ailes mécaniques…) et des compétences.
- **Compétences** : 1 à 3 par classe, débloquées aux niveaux 5 / 10 / 20 (ex. guerrier « Charge »,
  mage « Pluie », maire « Discours »).
- Reconversion possible mais coûteuse (perte de la maîtrise de classe, garde le niveau).

### Écran « Village » (le cœur émotionnel)

- Liste des kiwis (portrait, nom, niveau, classe, métier actuel, état : faim/fatigue au chantier
  04), filtres et tri. Sur téléphone, une bottom sheet plein écran ; sur desktop, un panneau.
- Fiche d'un kiwi : grand portrait (couleur shiny), nom **renommable**, niveau et XP, stats en
  radar, trait, maîtrises, classe et compétences, historique (né le…, expéditions, exploits),
  bouton « suivre » (la caméra suit le kiwi dans le village), « affecter à… ».
- Toucher un kiwi dans la scène 3D ouvre sa fiche (picking sur les kiwis instanciés).
- La mort d'un kiwi investi est un moment fort : rapport d'expédition avec son portrait, et un
  **mémorial** dans la fiche du village.

### Impact sur l'existant

- `Villager` gagne : stats, trait, shiny, niveau/XP, maîtrises, classe, compétences, historique
  court. Migration de schéma : stats tirées pour les kiwis existants (RNG seedé, déterministe).
- La production d'un bâtiment dépend des ouvriers **réels** (maîtrise, adresse) : le simulateur
  reste exact car ces valeurs ne changent qu'aux événements (montée de niveau = événement).
  L'XP s'accumule linéairement entre deux événements : calculer le temps du prochain niveau.
- Expéditions : la force de l'équipage devient la somme des forces individuelles (stats,
  classe, niveau) au lieu de « nombre de kiwis » ; le planificateur d'expédition permet de
  **choisir** les kiwis embarqués (au lieu d'un curseur) ; les pertes touchent des kiwis précis
  (tirage pondéré : les plus faibles plus exposés ? à trancher).
- Affectation automatique : garder `autoAssign`, mais préférer les kiwis à forte maîtrise.
- Bâtiments de formation (école, caserne, tour de mage, mairie) : à introduire ici ou au
  chantier 06 (voir questions).

## Découpage proposé

1. Données individuelles (stats, trait, shiny, niveau/XP, maîtrises) + migration + tests
   d'exactitude hors ligne. Commit.
2. Écran Village + fiche kiwi + renommer + suivre + picking 3D, shiny visibles. Commit.
3. Production et expéditions basées sur les individus (choix de l'équipage). Commit.
4. Classes, bâtiments de formation, compétences, apparences. Commit.
5. Équilibrage (bot : affectation par maîtrise, XP), docs, nouveau skill `kiwar-rpg`.

## Critères d'acceptation

- Chaque kiwi a une fiche riche ; on peut renommer, suivre, comparer.
- Un kiwi investi est mesurablement plus fort (et l'interface le montre avant une expédition).
- 1/512 shiny vérifié statistiquement par un test (RNG seedé).
- Progression hors ligne exacte (test big step vs small steps).

## Questions ouvertes

1. Les points de stat à chaque niveau : choisis par le joueur, ou automatiques ?
2. Plafond de niveau et vitesse de progression souhaitée (un kiwi niveau 10 en une semaine ?).
3. Les bâtiments de formation et les classes de combat : ici, ou avec les menaces (chantier 06) ?
4. En expédition, qui meurt en premier : au hasard, les plus faibles, ou ceux en première ligne
   (choix tactique du joueur) ?
5. Faut-il un kiwi « héros » unique par joueur (idée de `VISION.md`), ou chaque kiwi peut-il
   le devenir ?

## Réalisé (chantier terminé)

Réponses du porteur : points de stat **mixtes** (niveaux impairs tirés selon l'activité, niveaux
pairs à placer), niveau max **30** (niveau 10 en ~3 jours de travail), **une École** dans ce
chantier, pertes **pondérées** (les faibles plus exposés), **pas de héros** (seul le ou la
maire est unique), un kiwi formé **continue de travailler**, **reconversion** à prix double.

1. Données individuelles : stats (total 27–33), trait (30 %), shiny 1/512 vérifié par un test
   statistique, niveau/XP et maîtrises en unités entières (progression hors ligne exacte, test
   grand pas = petits pas, RNG compris), production selon la puissance réelle des ouvriers,
   affectation par maîtrise, renommer, placer un point, migrations v4 puis v5.
2. Écran Village : liste triable, fiche (portrait SVG, radar, trait, maîtrises, histoire),
   suivre un kiwi, toucher un kiwi en 3D, shiny colorés en 3D, toasts et sons (niveau, maîtrise,
   shiny), mémorial.
3. Expéditions individuelles : choix de l'équipage (force et risque de chaque kiwi), force =
   somme des forces, pertes tirées au sort pondérées par l'exposition, XP et histoire au retour.
4. École, classes (bâtisseur, guerrier, mage, éclaireur, maire), compétences aux niveaux
   5 / 10 / 20 (Pluie et Discours actives), tenues en 3D et en portrait.
5. Équilibrage : le bot place ses points, forme un·e maire et un·e bâtisseur·euse, fait des
   discours ; nouveaux jalons du rapport (premier kiwi niveau 5 / 10, maire). Docs et skill
   `kiwar-rpg`.

Reste pour plus tard : fatigue (Endurance) et moral (Charisme) au chantier 04 ; compétences
contre furets et chauves-souris (guerrier, mage, éclaireur volant qui accède aux falaises) au
chantier 06 ; apparence variée selon les stats au-delà de la taille ; voix des kiwis selon leurs
traits.
