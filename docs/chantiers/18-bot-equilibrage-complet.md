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
