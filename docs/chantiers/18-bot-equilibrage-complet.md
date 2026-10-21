# Chantier 18 — Bot d'équilibrage complet : chemins, camps, expéditions

Dette récurrente depuis le chantier 04, jugée **primordiale** par le porteur (fin octobre 2026) :
l'équilibrage ne mesure pas une partie des mécaniques du jeu.

## Intention du porteur

« L'équilibrage et les fonctionnalités manquantes sont primordiaux. » Le bot doit jouer comme
un·e joueur·euse attentif·ve, avec **toutes** les mécaniques qui pèsent sur la progression.

## État actuel (code)

- Le bot (`tools/balance/src/bot.ts`, ~880 lignes) suit le tutoriel, place ses producteurs par
  zone de récolte × logistique (`catchmentPreview`, `logisticsEfficiency`), améliore le goulot
  d'étranglement, nourrit, loge, forme un·e maire et un·e bâtisseur·euse, fait de la recherche,
  passe les âges, défend (tourelles, garnison) et déracine les souches.
- **Il n'utilise pas** : les chemins, les camps (gisements lointains, météorites), les
  expéditions (raids, reconnaissance, vaisseau), les mages et les éclaireur·euses, les
  Kikiwiwis et la terraformation, les livraisons, ni les automatismes du chantier 15 (cadenas,
  affectation kiwi par kiwi).
- Les expéditions ont une sonde à part (`pnpm balance:expeditions`, `src/expeditions.ts`), et
  les âges aussi (`pnpm balance:ages`). Le gain logistique des chemins n'est mesuré nulle part,
  alors qu'il pèse beaucoup dans le Delta (chantier 05).

## Proposition

### Chemins

- Après chaque construction de producteur, le bot évalue le tracé le moins cher vers le dépôt
  (Dijkstra existant de `sim/territory.ts`) et le pose si le gain d'efficacité rembourse la fibre
  en moins de N heures (proposition : 6 h).
- Il retrace les tuiles piétinées par les furets ou cassées par les tempêtes.

### Camps

- Le bot pose un camp sur un gisement riche hors de portée des producteurs quand c'est la
  ressource goulot, et sur les cratères de météorite (ou il utilise le poste Météorite du
  chantier 15).

### Expéditions

- Reconnaissance de la face jumelle dès le premier vaisseau, puis raids quand la prévision
  partagée (`forecastExpedition`) donne une victoire probable et que le butin couvre les risques
  (provisions, kiwis exposés). Retraite quand les pertes montent.
- Utilisation des classes de combat (guerrier·ères, mages, éclaireur·euses) selon la menace, et
  du Kikiwiwi dès l'âge du Fer (une place par vaisseau).
- Choix de l'équipage : les plus forts, sans risquer les kiwis-clés (maire, meilleur·e
  chercheur·euse).

### Profils de joueur·euse

- `--profile active | casual` : les profils existants (`activeMs`, `sessionEveryMs`) étendus aux
  nouvelles décisions, pour mesurer l'écart entre un·e joueur·euse attentif·ve et
  occasionnel·le.
- Un **rapport d'impact** par mécanique : la même graine avec et sans chemins, camps ou
  expéditions, pour chiffrer ce que chaque mécanique apporte (« les chemins font gagner 12 % sur
  Nid 3 dans le Delta »).

### Rapport

- Le rapport officiel (`docs/BALANCE_REPORT.md`) intègre les jalons d'expédition (premier raid
  gagné, butin par jour, kiwis perdus) et d'âge (Pierre, Fer, Industrie), plus le rapport
  d'impact.
- Puis on rééquilibre selon ce que le bot complet révèle : biomes à ±10 %, Kiwisu / Kiwino à
  ±10 %, rythme des âges visé (Pierre ≈ 1,5 jour, Fer ≈ 4 jours, Industrie ≈ 8 jours).

## Impact technique

- `tools/balance/src/bot.ts` : décisions découpées par domaine (`bot/paths.ts`, `bot/camps.ts`,
  `bot/expeditions.ts`…) pour rester lisible.
- Les expéditions demandent une garnison alien : en local, `localAlienSeed` comme le jeu solo.
- Coût de calcul : un rapport complet sera plus long. Garder `--jobs`, et un mode rapide pour la
  CI (30 graines × 24 h).
- Aucune règle du jeu ne change dans les parties 1 à 4 ; les retouches de chiffres viennent
  ensuite, notées dans `DECISIONS.md`.

## Découpage proposé

1. **Chemins** dans le bot, et rapport d'impact « avec / sans ».
2. **Camps** (gisements lointains, météorites).
3. **Expéditions** (reconnaissance, raids, classes, Kikiwiwi), en fusionnant la sonde
   `balance:expeditions` dans le rapport.
4. **Profils actif / occasionnel** et rapport officiel enrichi (200 graines).
5. **Rééquilibrage** selon les résultats, docs, skill `kiwar-balance`.

## Critères d'acceptation

- Le bot utilise chemins, camps et expéditions dans tous les biomes.
- Le rapport chiffre l'apport de chaque mécanique.
- Après rééquilibrage : biomes et faces à ±10 %, rythme des âges à ±15 % de la cible.

## Questions ouvertes

1. Rythme visé pour un·e joueur·euse **occasionnel·le** (quelques sessions par jour) : à quelle
   fraction du rythme actif ?
2. Le bot doit-il aussi faire des livraisons entre alliés (simulation d'un univers à 2) ?
3. Après le chantier 19, le bot devra coloniser : c'est prévu dans le 19.

## Réponses du porteur (octobre 2026)

1. Rythme occasionnel : ~2/3 du rythme actif (âges ~1,5× plus tard), à ±15 %.
2. Pas de livraisons entre alliés dans le bot (solo seulement, à revoir avec le chantier 19).
3. Rapport officiel : 200 graines × 72 h, plus une section « âges » longue (10 jours).
4. Les cibles d'âge valent pour le bot complet (qui utilise tout).
5. Raids (en cours de chantier, après mesure : jamais rentables) : une victoire **blesse** au
   lieu de tuer (6 h), butin **×8** et croissant avec l'âge.
6. Fin de partie de l'occasionnel·le plus clémente (Industrie ≈ 1,25× l'actif) : acceptée.

## Réalisé (octobre 2026)

- **Bot découpé** par domaine (`tools/balance/src/bot/`), même résultat au bit près avant les
  nouvelles décisions ; `runBot({ without })` pour mesurer chaque mécanique.
- **Chemins** : le tracé le moins cher de chaque producteur vers son dépôt, posé s'il se
  rembourse en 6 h ; retracé après piétinement ou tempête. Nid 3 et Bibliothèque −35 %.
- **Camps** : sur chaque cratère de météorite, et sur le gisement le plus riche de la
  ressource goulot quand des kiwis sont inoccupés ; démontés dès qu'un poste les réclame.
- **Expéditions** : aire d'envol après la Bibliothèque, deux guerrier·ères et un·e
  éclaireur·euse, reconnaissance dès que le rapport n'est plus frais, raid quand la prévision
  est favorable et que le butin vaut provisions, blessures et absence de l'équipage ; maire,
  bâtisseur·euses et meilleur·e chercheur·euse restent au village ; le Kikiwiwi quitte le
  rempart pour un raid.
- **Règles changées** : victoires qui blessent (6 h), butin ×8 et × l'âge (1 / 1,5 / 2 / 3),
  ligne « victoire attendue : environ n blessé·es, aucun mort » dans le planificateur.
- **Profils** actif / occasionnel (`--profile`), **rapport officiel** enrichi : section âges
  sur 10 jours pour les deux profils face aux cibles, rapport d'impact, sonde d'expéditions.
- **Bugs du bot** trouvés par les longues parties (Kikiwiwi inoccupé qui bloquait la
  recherche, ping-pong de garnison qui empêchait le monument de l'Industrie, recherche et
  Bibliothèque mal priorisées) ; **passages** retouchés deux fois, la seconde après les
  automatismes du chantier 15 (1 000 / 2 900 / 5 800 points).
- Résultat (`docs/BALANCE_REPORT.md`) : biomes à ±8,4 % au pire, faces à ±1,3 % ; actif
  Pierre ≈ 36 h, Fer ≈ 4 j, Industrie ≈ 7,9 j ; occasionnel Pierre ≈ 2,3 j, Fer ≈ 5,6 j,
  Industrie ≈ 9,7 j.

## Reste à faire / idées

- Le bot n'utilise ni mages, ni livraisons, ni cadenas / affectation kiwi par kiwi
  (chantier 15), ni terraformation au-delà du concassage des rochers.
- Une seule cible (la face jumelle) : les faces aliens des autres kiwis d'un univers ne sont
  pas jouées (solo).
- La sonde d'expéditions montre 35 % de pannes à tous les niveaux d'aire (la fiabilité suit
  l'âge depuis le chantier 08) : à revoir si les pannes paraissent trop fréquentes en Éden.
- Un rapport officiel complet prend ~3 h sur 4 cœurs (72 h × 200, âges × 10, impact × 20).
