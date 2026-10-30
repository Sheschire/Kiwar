# Chantier 50 — Les Tréfonds II : les loges, les raphides et l'actinidine

> **Fait** (30 octobre 2026). Ce qui a été fait, ce qui reste et les mesures : section « Bilan »
> en fin de fiche ; le savoir-faire est dans les skills `kiwar-depths` et `kiwar-forge`.

Acte IV « Au-delà » du [carnet de route](../CARNET_DE_ROUTE.md) (section 9). **Simulation +
serveur + client + bot.** Après le **48** ; il peut tourner **en parallèle du 49** (client seul).

**Skills à charger** : `kiwar-depths`, `kiwar-design`, `kiwar-sim`, `kiwar-forge` (nouveau stock
à part, gear), `kiwar-titans` (laboratoire), `kiwar-balance`.

## Intention du porteur

Le carnet (section 9) décrit cette couche à partir du vrai fruit :

- « **30 à 42 loges** rayonnent autour du cœur : des salles en étoile, chacune avec ses graines
  géantes (ressource rare). »
- « **Les raphides**, aiguilles de cristal d'oxalate de calcium concentrées près des loges […]
  des forêts de cristaux : une ressource (verre, outils, munitions) et un danger (blessures). »
- « **L'actinidine** […] forme des lacs acides dangereux pour des oiseaux faits de protéines,
  et c'est un réactif pour le laboratoire. »

## Décisions déjà prises

1. **Les loges s'ouvrent à l'Industrie** (porteur, 26 octobre 2026), après la chair verte (48).
   La couche suivante attend l'Âge des étoiles (52).
2. Même forme que le 48 : des salles sous brouillard, des descentes, des galeries ; le contenu
   caché reste là où la vérité est tenue.
3. **Les remontées** grandissent avec la profondeur : les loges abritent les nids les plus forts.
   Elles restent annoncées, avec trois parades.
4. Le carnet nomme deux ressources rares, les **graines géantes** et les **cristaux de
   raphide**, et un réactif, l'**actinidine**. Les leçons de l'acte III imposent qu'une ressource
   neuve ait **un puits qui revient** (sinon elle va « au plafond »).

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Graphe des Tréfonds, descentes, galeries, remontées** : chantier 48 (skill `kiwar-depths`).
- **Stocks à part** : sur le modèle du fer météorique (`state.meteorIron`, `data/iron.ts`
  `IRON.cap` par niveau du Nid, `payIron` / `addIron`, `LevelDef.iron`, `TechDef.iron`) et de la
  poussière d'étoile (`state.stardust`, `STARDUST.cap` 50).
- **Ressources communes** : `RESOURCE_IDS = ['pulp', 'fiber', 'seeds', 'juice']`
  (`data/resources.ts`) avec un plafond commun (`capacity`, `sim/selectors.ts` ~99).
- **Forge** : items par famille et par palier (`data/gear.ts`, skill `kiwar-forge`) ; tourelles
  (`data/threats.ts`).
- **Laboratoire et infusion** : `data/kikiwiwi.ts`, `sim/kikiwiwi.ts` (le risque d'échec, les
  modificateurs ; skill `kiwar-titans`).

## Proposition (point de départ)

- **La couche des loges** : un anneau de **30 à 42 loges** (le nombre est tiré par face, et
  public une fois la première loge vue), reliées par des faisceaux. Chaque loge contient des
  **graines géantes** (1 à 3), une **forêt de raphides** ou un **lac d'actinidine**, et souvent
  un nid.
- **Deux stocks à part**, en unités brutes entières comme le fer :
  - **Cristal** (raphides), plafond par niveau du Nid. Il paie :
    - le **verre** : des lentilles (portée des tourelles +1, Bibliothèque +10 %) ;
    - des **munitions de cristal** : les tourelles à graines percent l'armure ;
    - un palier de gear **cristal** à la Forge (lames et pointes) ;
    - les niveaux 13–15 (au chantier 51).
  - **Graine géante** (rare, plafond bas). Elle paie le monument de l'Âge des étoiles, le noyau
    d'un kiwaï (53) et une **plantation** : une graine géante plantée en surface devient en
    quelques jours un « arbre-loge » décoratif (beauté) qui donne une graine tous les N jours.
    C'est le puits qui revient.
- **Actinidine** : c'est un danger (les lacs blessent avec le temps, et un équipage les
  traverse ou les contourne selon les ordres) et un **réactif** (une galerie de lac donne un
  débit). Au laboratoire, une infusion avec actinidine a un risque d'échec divisé par deux, et
  la technologie « Enzymes » permet de soigner les blessé·es plus vite à l'infirmerie.
- **Dangers des loges** : les coupures des raphides (Dextérité) et l'acide (Endurance). Le·la
  Spéléologue reste la meilleure parade.
- **Remontées** : la force suit le nombre de nids de loges non pris. Une loge prise éteint son
  nid : c'est un levier visible.

## Grille de décision (kiwar-design)

- **Boucles** : économie (produire, stocker, dépenser des stocks rares), progression (gear
  cristal), stratégie (quelle loge).
- **Robinets et puits** : le cristal est payé par plusieurs puits (verre, munitions, gear,
  niveaux) ; la graine géante a des puits qui reviennent (plantation, kiwaïs, monument).
  Mesurer « au plafond » sur ces deux stocks.
- **Décisions créées** : creuser vers les graines (l'avenir) ou vers les cristaux (la défense
  maintenant) ; contourner ou traverser un lac.
- **Punition** : les remontées plus fortes restent annoncées ; une loge prise affaiblit le nid
  correspondant.
- **Mesure** : les loges prises à 14 jours, le temps « au plafond » du cristal (< 20 %), les
  remontées perdues, l'Âge des étoiles (au 51).

## Découpage proposé

1. **La couche des loges** : génération, vue publique, ouverture à l'Industrie ; tests.
2. **Cristal et graines géantes** : stocks, plafonds, sauvegarde, `pay*` / `add*` ; tests
   d'exactitude.
3. **Puits** : verre (lentilles, munitions), gear cristal, plantation ; tests.
4. **Actinidine** : dangers, réactif, laboratoire, Enzymes ; tests.
5. **Remontées des loges** et prévisions.
6. **Client** : salles des loges dans l'écran 2D (et dans la tranche si le 49 est fait), arbres
   et décors, l'i18n ; captures.
7. **Bot, sonde 6 × 14 jours, docs** : `kiwar-depths`, `kiwar-forge`, `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- À l'Industrie, la couche des loges s'ouvre ; chaque loge prise rapporte du cristal, des graines
  géantes ou de l'actinidine.
- Chaque nouveau stock a au moins deux puits, dont un qui revient ; « au plafond » < 20 % chez le
  bot attentif.
- Les remontées des loges restent perdues au plus une fois sur dix chez l'occasionnel·le.
- L'économie reste dans ±10 % entre faces et biomes.

## Bilan (30 octobre 2026)

### Réponses du porteur (points nouveaux)

- **L'actinidine n'est pas un stock** : c'est un effet tant qu'un lac est exploité (une
  personne qui y mine, la porte ouverte) — infusions deux fois moins risquées, et avec
  **Enzymes** des blessures deux fois plus courtes.
- **Second puits des graines géantes** avant le monument des étoiles (51) et les kiwaïs (53) :
  l'**œuf des loges** (une graine couvée avec l'œuf, un kiwi à +1 dans chaque stat).

### Fait (sept parties)

1. La couche des loges : 30–42 loges en arc sous la chair (profondeur 4, tirées après la chair
   sur leur propre flux : la chair ne bouge pas), forêts de raphides (coupures) ou lacs
   d'actinidine (acide, Endurance), nids dans ~40 %, 1–3 graines géantes ; ouvertes à
   l'Industrie (`layerLocked`) ; prévision honnête (le pire des deux dangers quand on ne sait
   pas).
2. Deux stocks à part : le **cristal** (unités brutes entières, plafond par Nid, taillé dans
   les forêts) et les **graines géantes** (entières, plafond par âge) ; sauvegarde v40.
3. Les puits : technologies **Verre** (lentilles +1 de portée, Bibliothèque +10 %) et **Taille
   du cristal** (palier cristal des armes : dégâts de l'acier, armure percée à moitié ;
   munitions de cristal des tourelles à graines, payées à chaque frappe) ; **arbre-loge**
   (n-ième arbre pour n graines, pousse 2 jours puis une graine tous les 3 jours) et **œuf des
   loges**.
4. L'actinidine : l'effet du lac, la technologie **Enzymes**, l'ordre **contourner les lacs**
   (×1,5 de trajet vers une loge, pas d'acide).
5. Les remontées : chaque nid de loge non pris près de nos galeries ajoute 0,6 à leur force
   (0,35 pour la chair) ; prendre la loge l'éteint.
6. Le client : puce des loges (cristal et graines), coûts, bande des loges sous la coupe 2D,
   lentilles, munitions, arbre-loge (modèle 3D), œuf des loges, textes FR + EN.
7. Le bot (loges, lentilles, munitions, arbres, œufs) et la sonde.

### Mesures

Probes of 14 days (scratch `runBot`, attentive unless said):

| Seed | Industry | First locule | Locules (day 14) | Rooms | Retreats | Dead | Upwellings (lost) | Crystal at cap | Seeds at cap | Trees | Locule eggs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| p1 Kiwisu | 6.7 d | 8.6 d | 6 / 42 | 15 | 0 | 0 | 5 (0) | 3 % | 0 % | 4 | 4 |
| p2 Kiwino ¹ | 8.2 d | 11.4 d | 4 / 38 | 17 | 3 | 5 | 5 (0) | 0 % | 0 % | 2 | 0 |
| p3 Kiwisu | 8.4 d | 13.6 d | 1 / 30 | 15 | 3 | 5 | 5 (0) | 0 % | 0 % | 1 | 0 |
| p4 Kiwino | 7.1 d | 10.2 d | 5 / 37 | 17 | 4 | 8 | 4 (0) | 0 % | 0 % | 4 | 2 |
| p5 Kiwisu, occasional ² | 11.2 d | — | 0 | 5 | 0 | 0 | 5 (0) | — | — | 0 | 0 |
| p6 Kiwino, occasional ² | 12.2 d | — | 0 | 4 | 0 | 0 | 4 (0) | — | — | 0 | 0 |

¹ before the last two fixes (tree from Nest 7, tree decision first). ² before the locules'
tuning (they never reach a locule).

- First locule 2–5 days after the Industry; 1 to 6 locules by day 14 (of 30–42): the ring
  lasts into the Age of the stars, as planned (chantier 52 opens under it).
- Crystal at the cap 0–3 % (one run 34 % before the technologies moved to Library 7: crystal
  with nothing to pay); giant seeds at the cap 0 % once the trees could be planted (28–47 %
  before). Both under the 20 % aimed at.
- No upwelling lost (attentive and occasional); the occasional bot loses 3 surface waves of
  20 (older than this chantier).
- ⚠️ Delves kill: 5–8 kiwis in the runs with retreats (the locules' nests at level 13). To
  discuss with the owner: retreat sooner, or weaker nests.
- ⚠️ The occasional player reaches the Industry on days 11–12 and no locule in 14 days.
- Lessons: the automation's miners filled the flesh's galleries first (sorted ids) and never
  reached a forest; a technology gated by a Library level the bot never builds is a dead sink;
  a building priced above a stock's cap can never come (the trees' limit by age).

### Reste à faire

- Les loges dans la **tranche 3D** du chantier 49 : la coupe 3D ne montre que la chair
  (`fleshOf`) ; il faut placer l'anneau des loges et leurs salles (noté dans `DETTE.md`).
- Le monument des étoiles (51) et le noyau des kiwaïs (53) paieront aussi des graines
  géantes ; les niveaux 13–15 (51) du cristal.
- L'occasionnel·le n'atteint pas les loges en 14 jours (Industrie aux jours 11–12).

À tester avec le porteur : la difficulté des loges, le prix des lentilles et des munitions,
le rythme des arbres-loges, l'intérêt de contourner les lacs, la lisibilité de la bande des
loges sur téléphone.
