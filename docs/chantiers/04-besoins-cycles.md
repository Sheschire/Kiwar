# Chantier 04 — Besoins et cycles : faim, fatigue, repos, jour/nuit, saisons

## Intention du porteur

« Jauge de fatigue, faim, cycle jour/nuit/saisons, besoin de se reposer : pour l'équilibrage et
rappeler ce système de gestion qu'on aime tant, il faut gérer son village pour que les kiwis ne
meurent pas de faim. Des kiwis fatigués d'avoir travaillé iront se reposer dans leur hutte, d'où
l'importance d'en construire. Les cycles sont surtout visuels pour apporter de la vie, mais chaque
cycle doit impacter la productivité. L'hiver, la neige bloque certaines tuiles, ralentit les
déplacements et gèle le renouvellement des ressources : il faut s'y préparer. L'été, les unités
se fatiguent plus vite mais ont moins faim. La nuit, les kiwis travaillent beaucoup moins car ils
dorment. Je te laisse imaginer le reste ou me poser des questions. »

> **Vocabulaire** : « saison » désigne désormais la saison **climatique** (printemps, été…).
> Les saisons compétitives de `VISION.md` (classement) sont renommées **ligues**.

## Proposition

### Durées (à valider)

- **Jour kiwi = 2 h réelles** : 1 h 30 de jour, 30 min de nuit (aube et crépuscule animés). Un
  joueur qui passe plusieurs fois par jour voit le cycle changer.
- **Saison = 24 h réelles**, année = 4 jours (printemps → été → automne → hiver). L'hiver est
  annoncé dès l'automne (compte à rebours), assez court pour ne pas dégoûter, assez long pour
  exiger des réserves.
- Calendrier **déterministe** (fonction de `createdAt` et du temps) : identique en ligne et
  hors ligne ; dans un univers partagé, tout l'univers partage le calendrier (création de
  l'univers).

### Effets proposés

| Période   | Effets                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nuit      | travail ×0,4 (les kiwis dorment, sauf trait « Noctambule »), fatigue récupérée ×2 au lit                                                                |
| Printemps | repousse des gisements ×1,4, éclosion −20 %, pluies                                                                                                     |
| Été       | fatigue ×1,3, faim ×0,8, jus : repousse ×0,7 (évaporation), journées plus longues                                                                       |
| Automne   | récolte de pulpe ×1,2, fibre : repousse ×1,3 (mue du duvet), vent, feuilles                                                                             |
| Hiver     | repousse ×0 (gelée), neige : marche ×1,5 et certaines tuiles (bosquets hauts) impraticables, faim ×1,3, bassins de jus partiellement gelés (puits ×0,5) |

### Faim

- Chaque kiwi mange de la **pulpe** (et boit du **jus**) en continu : ex. 3 pulpe + 1 jus par
  heure. C'est un débit négatif dans le simulateur (le moteur ne gère aujourd'hui que des débits
  positifs : à étendre, avec l'événement « le stock de nourriture tombe à zéro »).
- **Famine** : jauge de faim par kiwi qui monte quand il n'y a plus à manger. Paliers : affamé
  (travail ×0,6), épuisé (×0,3, ne se bat plus), puis **mort** après une longue privation
  (proposé : 18 h sans manger). Garde-fous hors ligne : avertissement très tôt (« plus que 6 h
  de nourriture »), les kiwis se rationnent, jamais plus d'un mort par tranche de 6 h, et les 2
  derniers kiwis ne meurent jamais de faim (pas de colonie rasée).
- Grenier : l'entrepôt protège la nourriture du gel hivernal ? (idée à valider).

### Fatigue et repos

- Jauge de fatigue par kiwi : monte en travaillant (vite pour les travaux lourds, selon
  l'endurance), redescend en dormant. Un kiwi fatigué rentre **dormir dans une hutte** (ou le
  Nid). **Lits** = capacité de logement : sans lit, il dort dehors et récupère deux fois moins
  vite. D'où l'intérêt de construire plus de huttes que le strict nécessaire.
- **Modèle de simulation recommandé** : pour rester exact hors ligne et léger, calculer un
  **taux de présence au travail** par kiwi (fraction du temps travaillé selon endurance, lits,
  nuit, saison), constant entre deux événements ; la jauge affichée est une fonction
  déterministe du temps. Alternative : vrais cycles travail/repos par kiwi (plus fidèle, plus
  d'événements). À trancher en mode plan, après mesure.
- Moral (lié au maire et aux discours, chantier 03) : bonus/malus de productivité, nourri par la
  variété de nourriture, le repos, les fêtes, les deuils.

### Visuel

- Lumière du soleil qui tourne, couleurs du ciel (aube rose, nuit bleutée), lucioles et fenêtres
  éclairées la nuit, kiwis qui bâillent et rentrent se coucher.
- Saisons : teinte des tuiles et des arbres (vert tendre, vert profond, roux, blanc), neige qui
  tombe et s'accumule (shader de neige sur le dessus des tuiles), pluie au printemps, feuilles en
  automne, bassins gelés en hiver.
- HUD : petite horloge jour/nuit + saison en cours + prochaine saison (compte à rebours).
- Presets de qualité : météo et particules réduites en « basse ».

## Impact technique

- `advance` : nouveaux événements (changement jour/nuit, de saison, stock de nourriture à zéro,
  seuils de faim). Les multiplicateurs de saison entrent dans `harvestOf`, la repousse
  (`syncPools`/flows), la marche (`walkCost`, Dijkstra mémoïsé par saison).
- Débits négatifs (consommation) dans `computeFlows`/`accrue`.
- Expéditions : les provisions existent déjà ; les règles de faim doivent rester cohérentes.
- Bot d'équilibrage : gérer la nourriture et les huttes, sinon il meurt de faim ; vérifier
  qu'un joueur qui se connecte 2 fois par jour ne perd pas de kiwi s'il a des réserves.

## Découpage proposé

1. Calendrier (jour/nuit, saisons) + visuel (lumière, ciel, teintes, météo). Commit.
2. Effets des saisons et de la nuit sur la production, la repousse, la marche. Commit.
3. Faim (consommation, famine, garde-fous, avertissements). Commit.
4. Fatigue, lits, repos, moral ; jauges dans la fiche des kiwis (chantier 03). Commit.
5. Équilibrage (bot), docs, skill.

## Critères d'acceptation

- Un joueur prévoyant traverse l'hiver sans perte ; un joueur négligent souffre (production en
  berne) mais ne perd pas tout.
- Les cycles se voient immédiatement et rendent le monde vivant, sans gêner la lisibilité.
- Simulation hors ligne exacte (tests big step / small steps sur plusieurs jours).

## Questions ouvertes

1. Durées : jour de 2 h et saison de 24 h, ou plus lent (saison de 2–3 jours) ?
2. La mort par famine est-elle acceptable (avec les garde-fous), ou seulement des malus ?
3. Les kiwis mangent-ils de la pulpe seule, ou un régime pulpe + jus (+ pépins en hiver) ?
4. Fatigue : modèle agrégé (taux de présence) ou vrais cycles individuels ?
5. Dans un univers partagé, toutes les faces vivent-elles la même saison au même moment ?

## Réalisé (chantier terminé)

Réponses du porteur : jour de **2 h**, saison de **24 h** ; mort par famine **avec garde-fous** ;
régime **pulpe + jus** ; fatigue en **modèle agrégé** ; **même calendrier** pour tout un univers ;
**moral simple** ; hiver **comme proposé** ; **lits = logement**, et comme la population ne peut
jamais dépasser le logement, c'est la **distance du travail au lit** qui compte (huttes près des
sites).

1. Calendrier déterministe (début au printemps, en milieu de matinée ; univers partagé : date
   de création de l'univers), soleil et lune, ciel d'aube, de crépuscule et de nuit, matériaux
   au clair de lune, teintes de saison, neige sur les toits et les tuiles, bassins gelés,
   averses, feuilles, neige, lucioles, maisons éclairées la nuit, horloge dans le HUD.
2. Effets : nuit (travail ×0,4), printemps (repousse ×1,4, éclosion −20 %), été (jus ×0,7),
   automne (pulpe ×1,2, fibre ×1,3), hiver (pas de repousse, puits ×0,5, marche ×1,5, bosquets
   enneigés, chemins dégagés). Simulation exacte sur plusieurs jours (tests grand pas = petits
   pas à travers un changement de saison).
3. Faim : 30 pulpe + 10 jus par kiwi et par heure, jauge de faim de la colonie, paliers (affamés
   ×0,7, affaiblis ×0,4, famine), morts avec garde-fous (pas avant le Nid 2, jamais les 2
   derniers, au plus une toutes les 6 h), alertes, son, résumé d'absence ; un entrepôt plein ne
   récolte que ce qui est mangé.
4. Fatigue et repos (présence au travail selon l'Endurance, la saison et la marche jusqu'au lit),
   moral (repas, lits proches, discours, deuil, saison), kiwis qui rentrent dormir en 3D,
   section Repos dans la fiche, carte Moral dans l'écran Village.
5. Équilibrage (production ×1,25, bot qui nourrit sa colonie et place ses huttes), test « un
   joueur qui passe deux fois par jour traverse l'hiver sans perte », docs et skill
   `kiwar-cycles`.

Reste pour plus tard : un hiver plus mordant quand l'économie sera moins saturée (chantiers 05
et suivants) ; ralentir les chantiers la nuit ; jauges de fatigue individuelles réelles si le
modèle agrégé ne suffit plus ; fêtes (moral) ; trait « Noctambule » ; sons d'aube et de saison
dédiés (événements réservés dans `/admin`).
