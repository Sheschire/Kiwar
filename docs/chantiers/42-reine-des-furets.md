# Chantier 42 — La reine des furets — **fait**

> **Fait le 24 octobre 2026** (cinq commits). Voir « Ce qui a été fait » en fin de document
> et la section du chantier 42 dans `DECISIONS.md`. Il clôt l'acte II : bilan dans le
> [carnet de route](../CARNET_DE_ROUTE.md), section 8 bis.

Acte II « La guerre des faces » du [carnet de route](../CARNET_DE_ROUTE.md). \*\*Simulation + client

- bot.** Il clôt l'acte II : après le **41**. Fin d'acte : **rapport d'équilibrage complet\*\*.

**Skills à charger** : `kiwar-colonies`, `kiwar-civ`, `kiwar-expeditions`, `kiwar-battle`, `kiwar-balance`.

## Intention du porteur

« Une fois les 12 parcelles conquises, c'est là qu'on comprend que la reine furet se cache dans
les tréfonds du kiwi adverse, et qu'elle vient de sortir. C'est ainsi qu'on peut enfin aller la
défier pour une bataille finale, difficile et épique, permettant la conquête totale de la planète
en cas de victoire. »

## Décisions déjà prises

- Une balise peut être attaquée **plus tard dans la partie**, de façon annoncée et défendable
  (décision du 23 octobre 2026). C'est ici qu'on l'introduit, à partir de l'âge du Fer de la
  civilisation.
- La victoire finale mène à la **conquête** (`conqueredAt`) puis à la **seconde colonie**
  (mission `found`, deux états liés, chantier 19), sans changement.
- La mort reste définitive pour un équipage vaincu, retraite comprise.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **La reine aujourd'hui** :
  - sol 24, air 14, ×0,85–1,2 ;
  - chaque tête de pont lui retire 15 % (10 % de plus près de son terrier), plafonné à 90 %
    (`data/siege.ts:21-29`, `sim/siege.ts:123-137`) ;
  - assaut final sol et air séparés (`landFinal`, `siege.ts:725-791`).
- **Contre-attaques** : `planCounter` et `strikeCounter` (`siege.ts:451-596`) gèrent l'annonce,
  l'escalade, la couverture et la fortification. C'est une **base réutilisable** pour les
  attaques de balises.
- Après le 40, l'écran Siège a disparu, sauf ce qui sert `found`.

## Proposition

### Les attaques de balises (à partir de l'âge du Fer de la civilisation)

- La civilisation choisit, de temps en temps, une balise exposée (près de ses casernes). L'attaque
  est **annoncée** (préavis de l'ordre de 6 h).
- Deux réponses, ou les deux :
  - **fortifier** la balise depuis chez soi (ressources et fer, temps) ;
  - envoyer une **garde** qui reste sur place, comme les anciennes têtes de pont (`outpost`), à
    ses risques.
- La bataille se joue avec le moteur du 36. Si la balise tombe, le brouillard revient sur la
  parcelle et ses bâtiments repoussent. On peut la reprendre par un nouveau débarquement.
- On reprend la logique de `planCounter` et `strikeCounter` (escalade, couverture,
  fortification).

### La reine

- Quand **les 12 parcelles sont balisées**, un grand événement annoncé : la reine sort des
  tréfonds au centre de la jumelle. Le terrier royal s'ouvre, une cinématique courte se joue et
  la carte change.
- La **bataille finale** se fait par débarquement `final`, avec un grand équipage (Kikiwiwi
  conseillé). La reine est une unité géante à **phases** :
  - charge au sol ;
  - appel de nuées de chauves-souris ;
  - furets d'élite sortis des tunnels ;
  - un dernier carré.
    Les ordres d'avant le départ comptent : priorités, seuil de retraite.
- **Victoire** : conquête totale, toutes les parcelles révélées, la planète-sœur s'éclaire, et la
  seconde colonie peut être fondée (19). **Défaite** : comme tout débarquement. La reine garde ses
  blessures un temps (une partie de ses PV perdus).
- Le spectacle reprend le 41 : grand cadrage, effets plus forts, musique (skill `kiwar-audio`).

### Fin de l'ancien siège

- On retire le code mort de `sim/siege.ts` et des écrans, en gardant `found` et les liaisons de
  la seconde colonie.
- La dette du chantier 19 dans `docs/DETTE.md` est mise à jour (le vaisseau invisible des retours
  de tête de pont disparaît avec les têtes de pont).

## Impact technique

- Simulation et serveur : attaques de balises (préavis, fortification, garde, bataille), reine
  (unité, phases, déclenchement), mission `final` sur le moteur, nettoyage du siège, migration,
  tests, `pnpm build:functions`.
- Client : annonce et défense des balises, cinématique de la reine, bataille finale, fin de partie
  et invitation à fonder la seconde colonie, i18n FR + EN, sons.
- Bot : il mène toute la conquête (débarquements, défense des balises, reine).
- Cible de travail : une conquête totale en **2 à 3 semaines** pour un·e joueur·euse
  attentif·ve. C'est une hypothèse à confirmer avec le porteur et à jouer.

## Découpage proposé

1. Attaques de balises : planification, préavis, fortification, garde, bataille ; tests.
2. Reine : déclenchement, unité à phases, mission `final` ; tests.
3. Client : défense des balises, cinématique, bataille finale, fin de conquête.
4. Nettoyage du siège, migration ; tests.
5. Bot complet, **rapport d'équilibrage complet** (fin d'acte), docs (`kiwar-colonies`,
   `kiwar-expeditions`, `kiwar-battle`), `DECISIONS.md`, `PLAN.md`, bilan de l'acte II dans le
   carnet.

## Critères d'acceptation

- Une balise menacée s'annonce et se défend ; perdue, elle se reprend.
- Les 12 balises font sortir la reine ; la bataille finale est longue, lisible et difficile.
- La victoire mène à la seconde colonie comme au chantier 19.
- Le bot conquiert une part mesurée des parties dans l'horizon visé ; Kiwisu et Kiwino à ±10 %.

## Ce qui a été fait

Questions posées au porteur (toutes tranchées par l'option recommandée) : une balise nue tombe
sans combat ; une garde vaincue meurt, avec un seuil de retraite ; cible de 2 à 3 semaines ; la
reine reste dehors une fois sortie.

1. **Attaques de balises** (et retrait de l'ancien siège) : `data/beacons.ts`,
   `sim/beacons.ts`, `battle/beacon.ts`. Heure publique, cible et force choisies par la
   civilisation là où la vérité est tenue ; fortification depuis chez soi (deux tourelles du
   premier niveau de notre âge et une tour, la moitié de leur prix, 4 h) ; garde par vaisseau
   (mission `guard`, ordres, relève) ; bataille avec retraite de la garde ; balise nue tombée
   sans combat ; sauvegarde v35. Bug corrigé : les balises sur les casernes n'affaiblissaient
   plus les vagues depuis le 40.
2. **La reine** : `sim/queen.ts`, `battle/queen.ts`. Sortie quand la 12e balise s'allume,
   vue publique suivie chaque jour, mission `final`, unité géante à phases (nuées, tunnels,
   rage ; le moteur gagne `wake`, `rage`, `leader`), conquête, trésor, blessures (au plus
   50 %, trois jours), puissance jamais sous le plein développement de la civilisation.
3. **Client** : écran « Conquête de la jumelle » (balises, attaque annoncée, défense,
   reine, rapports avec rejeu 2D), planificateur de garde et de bataille finale, alerte dans
   la barre du haut, reine dessinée sur la jumelle et sa sortie, bataille finale jouée sur la
   jumelle, toasts et sons.
4. **Nettoyage** : code, champs, textes et spectacle du siège retirés.
5. **Bot, mesures, docs** : défense des balises et bataille finale du bot, sonde
   `pnpm --filter @kiwar/balance conquest`, rapport d'équilibrage complet, skills, bilan de
   l'acte II.

## Reste

- ⚠️ **Le rythme de la conquête** n'est pas celui visé : sur 6 parties de 21 jours, la reine
  sort dans 3 (J2 à J5) et tombe dans 1 (J6,8) ; trois restent bloquées à 3–11 balises. À
  jouer avec le porteur (leviers dans `DECISIONS.md`).
- ⚠️ L'usure des kiwis sur les débarquements (chantier 40) : 9 à 99 morts en trois semaines.
- À tester : le prix de la fortification, la lisibilité de la bataille finale (8 min au plus),
  la scène de sortie de la reine (une caméra plus proche, un son propre), la garde (non
  dessinée sur la jumelle).
- Pas de spectacle 3D pour une attaque de balise (rejeu 2D dans le rapport).
