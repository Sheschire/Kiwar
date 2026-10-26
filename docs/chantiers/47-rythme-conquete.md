# Chantier 47 — Le rythme de la conquête

Acte IV « Au-delà » du [carnet de route](../CARNET_DE_ROUTE.md) (section 9), en ouverture : il
ferme les deux points restés ouverts au [chantier 46](46-reglages-fin-acte-iii.md).
**Simulation + bot**, un peu de client (écran Conquête). Après le **46**.

**Skills à charger** : `kiwar-colonies`, `kiwar-civ`, `kiwar-balance`, `kiwar-design`.

## Intention du porteur

Le 26 octobre 2026, en écrivant l'acte IV : la conquête doit tenir sa promesse de « 2 à 3
semaines », sans partie qui cale. Deux défauts restent après le 46 :

- **la reine sort trop tôt** : aux jours 2,9 à 4,2 dans la moitié des parties (cible : jours 7
  à 14), parce que les 12 balises s'allument vite une fois le bord tombé ;
- **une partie sur six bloque à 8 balises** (`conquest-1`, Kiwisu, hauts plateaux : 20
  débarquements, 9 retraites).

## Décisions déjà prises

1. **La reine sort à une date publique** (choix du porteur, 26 octobre 2026). Elle ne sort pas
   avant une date fixe de l'horloge alien, même si les 12 balises brillent plus tôt. Point de
   départ : **le jour 7** depuis le début de la colonie, à calibrer avec la sonde. D'ici là,
   l'écran Conquête dit qu'elle « creuse dans les Tréfonds de la jumelle » et donne la date.
   C'est la charte 7 : une horloge commune, pas un ajustement caché.
2. **Le blocage à 8 balises : diagnostic d'abord** (choix du porteur), comme aux parties 3 et 4
   du 46.
   - Si la cause est **le bot** (équipages, gear, classes, une seule aire d'envol, deux
     candidates seulement), on corrige le bot.
   - Si c'est **une règle** (le centre trop fort pour une colonie de l'âge), on ajoute un
     **levier public** visible dans la prévision. Exemple : l'encerclement, où chaque balise
     voisine retire une part de la garnison d'une parcelle du centre.
3. Restent inchangés : la reine `hp` 1300 et ses coups × 0,5, `CIV.ageMultiple` 1,9 à
   l'Industrie, le plancher de puissance `floorH` 336 h, et les blessé·es sur un terrain tenu.
4. Cible : **la reine sortie entre le jour 7 et le jour 14**, et **la conquête entre le jour 14
   et le jour 21 dans au moins 4 parties sur 6**, aucune bloquée sous 10 balises en 21 jours.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Sortie de la reine** : `sim/queen.ts` `emergeQueen` (~77) se déclenche dès
  `face.beacons.length >= INTEL.sectors` (12, `data/expeditions.ts` ~127), appelé par
  `resolveLanding` (`result.queenOut`, événement `queenEmerged`). Il n'y a ni jour minimum ni
  âge minimum. `refreshQueen` est appelé chaque jour depuis `civTick`. `FaceView.queen` est le
  `QueenView` public.
- **Puissance** : `SIEGE.final` (`data/siege.ts` ~31) : `hp` 1300, `damage` 0,5, `floorH` 336 h,
  `healMs` 72 h, `maxWounds` 0,5.
- **Horloge** : `CIV.ageAtH [0, 24, 96, 288]`, `innerMultiple [2, 3]`, `ageMultiple`
  `[1, 1.25, 1.6, 1.9]` (`data/aliens.ts` ~31). Les parcelles du centre sont les secteurs < 6
  (`isInner`).
- **Rythme des débarquements** : rien ne le limite dans la simulation, à part une mission par
  aire d'envol (`isLaunchpadBusy`) et `landingLock`.
- **Bot** (`tools/balance/src/bot/expeditions.ts` `expeditionOrder`) :
  - `CANDIDATES = 2`, et jamais un centre qu'il n'a pas vu ;
  - il ne part qu'avec des chances « likely » et `expectedDead + expectedHurt <= 1` ;
  - il attend un jour après un mauvais débarquement (`BAD_LANDING`) ;
  - il garde le·la maire, les bâtisseur·euses et le·la meilleur·e chercheur·euse à la maison ;
  - il n'a qu'**une** aire d'envol (`launchpadOrder`).
- **Sonde** : `pnpm --filter @kiwar/balance conquest --seed --face --days 21 [--casual]` (temps
  `queenOut`, `conquest`, `centreWon`). Le calibrage passe par des états sauvés (méthode de la
  partie 5 du 46, `DECISIONS.md`).

## Proposition

- **`SIEGE.queenFromH`** (point de départ 168 h) : `emergeQueen` attend
  `max(12e balise, début + queenFromH)`. La date est publique : la vue de la jumelle peut la
  montrer avant même la 12e balise. Si les 12 balises sont allumées avant la date, la sortie
  devient un événement daté de l'avance, résolu là où la vérité est tenue comme aujourd'hui.
  `nextQueenEvent` entre dans `hiddenDue`.
- Client : sur l'écran Conquête, la ligne « La reine creuse… sortie le jour N » et un compte à
  rebours quand les 12 balises brillent ; les textes FR + EN.
- **Diagnostic du blocage** : sauver l'état de `conquest-1` Kiwisu tous les jours après la 8e
  balise, puis rejouer les débarquements refusés et perdus en variantes : plus de candidates,
  deux aires d'envol, un Kikiwiwi, un équipage de classe de maître. On ne retient le levier de
  règle que si aucune variante du bot ne passe.

## Grille de décision (kiwar-design)

- **Boucle** : stratégie (comparer, risquer) ; horizon multi-sessions.
- **Décision créée** : entre la 12e balise et la date, le temps de préparer la bataille finale
  (gear, Kikiwiwi, fortifier les balises attaquées). Cette attente débouche sur une décision.
- **Absence** : rien ne se perd ; la date est connue d'avance.
- **Mesure** : `queenOut`, `conquest`, balises à 21 jours, morts et blessé·es (sonde de
  conquête 6 parties × 21 jours, attentif et occasionnel).

## Découpage proposé

1. **Reine datée** : `queenFromH`, l'événement de sortie différée, la vue publique ; tests
   (exactitude hors ligne, serveur, sortie à la date et pas avant). Sauvegarde v39 si un champ
   s'ajoute.
2. **Client** : la ligne et le compte à rebours de l'écran Conquête, textes FR + EN ; captures
   desktop et téléphone.
3. **Diagnostic du blocage**, puis le correctif (bot, ou levier public avec sa prévision).
4. **Sondes** : conquête 6 × 21 jours, puis `DECISIONS.md`, `PLAN.md` et les skills
   `kiwar-colonies` et `kiwar-balance`.

## Critères d'acceptation

- La reine ne sort jamais avant la date publique. Cette date est affichée avant et après la 12e
  balise.
- La reine sort entre le jour 7 et le jour 14 et la conquête aboutit entre le jour 14 et le jour
  21 dans au moins 4 parties sur 6, aucune bloquée sous 10 balises.
- La cause du blocage à 8 balises est nommée (bot ou règle) dans `DECISIONS.md`.
- L'économie reste dans ±10 % entre faces et biomes.

## Fait (26 octobre 2026)

Parties 1 à 3 en code (cinq commits), mesures dans `DECISIONS.md`.

1. **Reine datée** : `SIEGE.queenFromH`, sortie différée (événement de l'avance, résolu là où
   la vérité est tenue, `hiddenDue` côté serveur). Point neuf tranché par le porteur : il faut
   **les 12 balises à la date** ; une balise tombée retarde la reine jusqu'à ce qu'elle
   brille de nouveau. Pas de champ de sauvegarde (la date vient de `createdAt`).
2. **Écran Conquête** : « Elle creuse dans les Tréfonds… pas avant 13 jours (dans …) », puis
   un compte à rebours quand les 12 balises brillent ; textes FR + EN, captures desktop et
   téléphone.
3. **Blocage à 8 balises : cause nommée, une règle** (pas le bot). La prévision d'un
   débarquement oubliait les **renforts d'une caserne voisine cachée** (25 % de sa
   garnison) : « probable, aucun mort » finissait en retraite meurtrière 26 fois sur 30 ; les
   vétéran·es tombaient et l'armée ne suffisait plus au centre. Choix du porteur : les prévoir
   **au pire** — la bataille d'essai la plus dure compte les renforts possibles de chaque
   parcelle voisine sans notre balise, et le planificateur les nomme. Un correctif du bot
   (une classe de combat pour tous) a été essayé puis retiré : inutile une fois la prévision
   honnête.
4. **Date calibrée** : avec des débarquements honnêtes, les 12 balises brillent avant le jour
   7 partout et la reine tombait le jour de sa sortie ; `queenFromH` 168 → **312 h (jour 13)**. Sonde attentive (6 parties × 21 jours) : reine au jour 13 dans 5 parties sur 6 (16,8),
   conquête aux jours 13,1–17,0 (**4 sur 6 entre 14 et 21**), aucune bloquée, **0 à 14
   morts** (3 à 24 avant). Occasionnel (3 parties Kiwisu) : une conquête au jour 20,9, deux
   sans reine à 21 jours (centre aux jours 17,6 et 19,6). Économie : faces à ≤ 6,4 %, Pierre
   13,4 h, Fer 2,7 j.

Reste ouvert : deux parties sur six battent la reine le jour même de sa sortie (jour 13,1) ;
à voir avec le porteur s'il faut une date au jour 14 (elle coïnciderait avec `floorH`) ou
laisser ainsi. La prévision au pire rend les petits équipages prudents : à faire tester.
