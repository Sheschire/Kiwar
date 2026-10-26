# Chantier 50 — Les Tréfonds II : les loges, les raphides et l'actinidine

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
