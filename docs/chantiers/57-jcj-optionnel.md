# Chantier 57 — Le JcJ optionnel

Acte IV « Au-delà » du [carnet de route](../CARNET_DE_ROUTE.md) (section 9, « Toujours en
idée »). **Simulation + serveur + client + bot.** Après le **56** (les ligues comptent aussi les
batailles). Il crée le skill **`kiwar-pvp`**.

**Skills à charger** : `kiwar-online`, `kiwar-battle`, `kiwar-expeditions`, `kiwar-threats`,
`kiwar-design`.

## Intention du porteur

« Attaquer d'autres planètes (joueur contre joueur) : plus tard, uniquement dans les univers qui
l'autorisent, avec protections (débutants, bouclier après attaque, butin plafonné). »
(`VISION.md`, section 4). Le porteur le veut dans l'acte IV (26 octobre 2026).

## Décisions déjà prises

1. **Un débarquement asynchrone** (porteur, 26 octobre 2026) : on débarque sur la face d'un·e
   autre joueur·euse comme sur la jumelle. Le serveur joue la bataille contre ses tourelles et
   sa garnison, à partir de sa vérité.
2. **Seulement dans les univers `pvp`**, choisis à la création de l'univers.
3. **La défense ne meurt jamais** (charte 4) :
   - elle ne perd que des **réserves plafonnées** (les réserves d'entrepôt d'abord) et des
     **blessé·es** ;
   - un bâtiment abîmé se répare.
4. L'attaque suit les règles du débarquement : une retraite ou une défaite tue, une victoire
   ramène ses tombé·es blessé·es.
5. **Protections** :
   - un **bouclier** après une attaque subie ;
   - une **protection des débutant·es** ;
   - l'**annonce** à la cible, avec un préavis (toute menace est annoncée, avec au moins deux
     parades : renforcer la garnison, monter les tourelles, vider les réserves par une
     collecte).

## État actuel (code)

- **Univers** : `universes.pvp boolean default false` (« co-op only for now »). **Aucun code
  TypeScript ne le lit.**
- **Faces des membres** : dans un univers partagé, les autres kiwis portent des faces alien
  (`alienFaceOnKiwi(distance)`), qui sont des cibles JcE. La face réelle d'un·e joueur·euse est
  son état `games.state`.
- **Batailles** : les vagues contre nous (`waveSetup` : nos tourelles, notre garnison, nos
  portes ; skill `kiwar-battle`) sont exactement la défense dont on a besoin, mais vue de
  l'attaquant·e.
- **Annonce et frappe** : les attaques de balises (`sim/beacons.ts` : heure publique, annonce,
  frappe là où la vérité est tenue, `nextBeaconEvent`).
- **Serveur** : `server/gameService.ts` (un `load` résout les mouvements cachés), et deux lignes
  `games` par joueur·euse (colonies 0 et 1).

## Proposition (point de départ)

- **Cible** : la colonie d'un membre d'un univers `pvp`, visible dans la vue de l'espace. La
  prévision ne lit que le public : un aperçu des tourelles vues, la puissance annoncée et une
  estimation, comme `landingForecast`.
- **Préavis** : le vaisseau est annoncé à la cible au départ (le voyage `90 + 60 · distance`
  min est le préavis, 2 h au moins). À l'arrivée, le serveur charge les deux états, joue la
  vague « à l'envers » (`waveSetup` de la cible, l'équipage en raiders) et écrit les deux
  résultats **dans une même transaction**.
- **Butin** : au plus X % des réserves de la cible, puis Y % du stock au-delà d'un seuil
  protégé, et jamais de fer, de cristal ni de graines géantes (point de départ à calibrer).
- **Protections** :
  - un bouclier de 24 h après une attaque subie ;
  - une protection jusqu'à l'âge de Pierre et 72 h ;
  - pas plus d'une attaque par jour d'un·e même attaquant·e vers une même cible ;
  - une cible absente depuis plus de 3 jours est intouchable (pas de punition de l'absence au-delà
    de la stagnation, charte 3).
- **Rapport des deux côtés** avec le rejeu ; le journal fait foi. Les ligues (56) peuvent
  compter les défenses tenues, pas les pillages.
- **Bot** : un adversaire bot dans un univers simulé pour mesurer le butin moyen et la part de
  défenses tenues.

## Grille de décision (kiwar-design)

- **Boucles** : stratégie (attaquer qui, quand), sécurité (se défendre contre une vraie
  personne).
- **Punition** : annoncée, plafonnée, réparable ; la défense ne meurt pas. Ce sont des garde-fous
  contre l'acharnement.
- **Absence** : une cible absente de longue durée est protégée.
- **Personnes** : la frustration d'être attaqué·e est un ressenti. Le porteur doit le jouer avec
  des ami·es avant tout réglage, et on le note « à tester ».

## Découpage proposé

1. **Règles** : la cible, le verrou, les protections, la prévision publique ; tests.
2. **Résolution à deux états** : la vague à l'envers, le butin plafonné, les blessé·es, la
   transaction serveur ; tests (mock, RLS : aucun état d'un·e autre n'est lu par le client).
3. **Annonce et parades** côté cible : notification, renfort, collecte d'urgence.
4. **Client** : choisir une cible, la prévision, le rapport et le rejeu des deux côtés, l'i18n ;
   captures.
5. **SQL si besoin, mock, docs** : création du skill `kiwar-pvp`, `DECISIONS.md`, `PLAN.md`, et
   le SQL donné au porteur.

## Critères d'acceptation

- Dans un univers `pvp`, on attaque la face d'un·e membre ; ailleurs, c'est impossible.
- Une défense ne perd jamais de kiwi ni plus que le plafond ; toute attaque est annoncée.
- L'état de la cible n'arrive jamais au client de l'attaquant·e (test anti-triche).
- Bouclier, protection des débutant·es et protection des absent·es sont testés.

## Bilan (10 novembre 2026) — fait

Réponses du porteur : attaquer lève sa propre protection ; seule la colonie d'origine est une
cible ; une ligne publique dans le chat ; l'annonce montre l'effectif, les classes et une
fourchette de ±20 %. Détails techniques dans `DECISIONS.md` et le skill `kiwar-pvp`.

Fait, partie par partie :

1. **Règles** (`data/pvp.ts`, `sim/pvp.ts`, sauvegarde v46) : cibles, protections, commande
   `raidPlayer`, mission `pvp`.
2. **L'attaque jouée chez la cible** comme une vague (`raidWave`, `comingWave`, `strike`) :
   l'équipage en raiders sur un côté choisi, butin plafonné, aucune mort en défense, bouclier.
3. **Serveur à deux états** : annonce au départ (`announcePvp`), la cible jouée d'abord puis le
   sort de l'équipage écrit chez l'attaquant·e (`settlePvp`), deux écritures idempotentes ;
   table `pvp_battles` (migration `20261110000000_pvp.sql`).
4. **Annonce et parades** côté cible : fenêtre de défense, badge, toasts, pronostic.
5. **Client de l'attaquant·e** : case JcJ à la création d'un univers, « Débarquer » en visite,
   planificateur, rapports et rejeu 2D, lignes de chat, Nouveautés.
6. **Ligues, bot, docs** : haut fait `pvpHeld`, sonde `pnpm balance:pvp`, skill `kiwar-pvp`.

Mesures (`pnpm balance:pvp --seeds 3 --days 10`, bot attentif contre bot attentif, 6 kiwis) :
toutes les attaques sont tenues (jours 4 à 10), 4 à 5,3 attaquant·es mort·es sur 6, aucun
butin, aucun·e défenseur·e blessé·e : l'équipage tombe sous les tourelles avant d'atteindre un
bâtiment. Une colonie défendue est hors de portée ; attaquer ne paie que contre une défense
négligée. À peser au chantier 58, après les parties entre ami·es.

Reste (chantier 58 ou plus tard) :

- l'**équilibre attaque / défense** (mesures ci-dessus) ;
- un **pronostic** chez l'attaquant·e (aujourd'hui : défense publique, tourelles vues, notre
  puissance ; pas de cote) ;
- le **rejeu 3D** d'une attaque chez l'attaquant·e (2D aujourd'hui) et un spectacle en direct
  chez la cible (le serveur joue l'attaque : la cible voit le rapport) ;
- le vol du vaisseau vers la planète du membre (il part vers un point lointain du ciel) ;
- **à tester entre ami·es** avant tout réglage : le préavis, la perte, le bouclier, l'intérêt
  d'attaquer.
