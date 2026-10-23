# Chantier 37 — Classes, rôles de combat, camp d'entraînement

Acte II « La guerre des faces » du [carnet de route](../CARNET_DE_ROUTE.md) (ex-chantier 25,
adapté au moteur de bataille). **Simulation + client + bot.** Après le **36** (les classes y
prennent leur attaque) ; le camp d'entraînement occupe trois tuiles (35).

**Skills à charger** : `kiwar-rpg`, `kiwar-battle` (créé au 36), `kiwar-design` (+ `kiwar-tasks`
pour les postes, `kiwar-balance` à la fin).

## Intention du porteur

- « Une **classe dédiée pour récolter plus vite** (comme bâtisseur pour la construction). »
- « **Chaque classe doit être associée à une stat**, avec un **bénéfice colonie + combat**.
  **Proposer de nouvelles classes.** »
- « **Arbre d'améliorations de classe**, par exemple mage → archimage. Si possible des **classes
  avancées qui nécessitent deux stats** avancées. »
- « Les **mages doivent mener des recherches plus vite**. » « **Endurance et Force** augmentent
  les chances de réussite du passage à Kikiwiwi. **Le Kikiwiwi perd le métier.** »
- « Bâtiment **camp d'entraînement** (plusieurs cases) réunissant les différentes classes pour
  booster leur **XP de classe** et leur permettre à terme de **changer de classe**. »
- « La difficulté et les fonctionnalités actuelles n'encouragent que très peu à optimiser ses
  kiwis. »

## Décisions déjà prises

- Nouvelle classe **Cueilleur·euse** (Dextérité) pour la récolte ; l'éclaireur·euse reste la
  classe des expéditions (Agilité). Une classe par stat (réponse de fin octobre 2026).
- Questions de l'ancien chantier 25, tranchées par défaut (modifiables) :
  1. La classe de base **exige** sa stat ≥ 6.
  2. Le **Barde** (Charisme) est gardé : il sert le moral (actes II et III).
  3. Les noms proposés plus bas sont gardés.
  4. Le Kikiwiwi perd sa **classe** et ses compétences de classe (il n'a pas de métier de
     bâtiment).
- **Chaque classe a une attaque** dans le moteur de bataille (36). Le camp d'entraînement
  arrive à la **Pierre** (table des déblocages du carnet).

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Stats** (`data/kiwis.ts` ~8-15) : force, agilité, endurance, esprit, dextérité, charisme, de 1
  à 10 au départ, 20 au plus.
  - Dextérité +3 % de récolte par point, Force +2 % de construction et +6 % de combat.
  - Endurance +3 % de combat et moins d'exposition.
  - Esprit +4 % d'XP et +6 % de recherche.
  - Charisme, seulement via le·la maire ; **Agilité presque sans effet**.
- **Classes** (`data/classes.ts`) : builder, warrior, mage, scout, mayor.
  - Aucune n'exige de stat : il faut un niveau d'École, un niveau de kiwi, un coût et un temps.
  - Trois compétences, à 5, 10 et 20. Pas de paliers. Changer de classe coûte le double.
  - Le mage a la recherche ×1,2.
- **Recherche** : `researchPower` (`sim/research.ts` ~129-153). **Tâches** : postes remplis par
  stat (`sim/tasks.ts`).
- **Kikiwiwi** (`sim/kikiwiwi.ts` ~53-95) :
  - risque = 0,4 − 0,02·(endurance − 5) − 0,01·(niveau − 1) − bonus du labo − sang vert, borné à
    0,05–0,6 ;
  - **la Force ne compte pas** ;
  - `classId` est gardé.

## Proposition

### Une classe par stat (palier 1, École 1–2, stat ≥ 6)

| Stat      | Classe             | Colonie                                 | Combat (moteur du 36)                         |
| --------- | ------------------ | --------------------------------------- | --------------------------------------------- |
| Force     | Bâtisseur·euse     | construction ×1,3                       | masse : coups lourds et lents                 |
| Agilité   | Éclaireur·euse     | expéditions : poids ×0,5, voyage rapide | rapide, contourne, esquive                    |
| Endurance | Guerrier·ère       | réparations ×1,5 (neuf)                 | épée : ligne de front, beaucoup de PV         |
| Esprit    | Mage               | **recherche ×1,5** (était 1,2)          | boule de feu : zone, touche les volants       |
| Dextérité | **Cueilleur·euse** | récolte ×1,3, cratères ×1,3             | fronde : à distance, bonne contre les volants |
| Charisme  | **Barde**          | moral +1 % par barde (plafond 5 %)      | chant : bonus aux alliés proches              |
| Charisme  | Maire (unique)     | moral (Organisation, Discours)          | reste au village                              |

- Le bonus de classe grandit avec sa stat, par exemple +2 % par point au-dessus de 5.
- Le mage perd son bonus de récolte, qui passe au·à la cueilleur·euse.
- L'Agilité gagne des effets : vitesse de marche des kiwis (logistique), esquive.
- Les tâches du chantier 15 préfèrent la classe du poste.

### Arbre de classes

- **Palier 2 — classe avancée** : au camp d'entraînement, avec un kiwi de niveau 10, sa stat ≥ 10
  et un rang de classe 3.
  - Bâtisseur·euse → **Architecte** ;
  - Éclaireur·euse → **Navigateur·rice** ;
  - Guerrier·ère → **Champion·ne** ;
  - Mage → **Archimage** (recherche ×2) ;
  - Cueilleur·euse → **Herboriste** ;
  - Barde → **Ménestrel**.
- **Palier 3 — classe de maître, deux stats** : âge du Fer, kiwi de niveau 20, deux stats ≥ 12.
  - **Ingénieur·e** (Force + Esprit) : construction et recherche, répare les vaisseaux ;
  - **Paladin·e** (Endurance + Charisme) : garnison et moral de la garnison ;
  - **Druide** (Esprit + Dextérité) : repousse des gisements, Pluie plus forte ;
  - **Rôdeur·euse** (Agilité + Dextérité) : débarquements et butin ;
  - **Titan·e** (Force + Endurance) : combat lourd, travaux pénibles ;
  - **Oracle** (Esprit + Charisme) : recherche et vagues prévues plus tôt.
- Chaque palier apporte une attaque ou une compétence de combat neuve, et l'on garde les
  compétences acquises.

### Le camp d'entraînement (3 tuiles, âge de Pierre)

- **XP de classe** : un rang de classe de 1 à 5, gagné en combattant (vagues, débarquements) et à
  l'entraînement au camp (postes d'entraîné·e, temps et nourriture).
- C'est au camp qu'on **monte de palier** (2 et 3). L'École garde le palier 1.
- **Changer de classe** au camp : moins cher que le double coût de l'École. On perd le rang de
  classe, pas le niveau du kiwi.
- On y voit les classes s'entraîner : mannequins, cibles, cercle de sorts (animations du 34).

### Kikiwiwi

- Risque : −0,02 par point d'**Endurance** et −0,02 par point de **Force** au-dessus de 5, en plus
  du niveau et du labo, avec les mêmes bornes.
- **Le Kikiwiwi perd sa classe** : `classId` est remis à zéro. Il devient une unité géante dans le
  moteur de bataille. La fiche l'annonce avant l'infusion.

## Impact technique

- Simulation (skills `kiwar-rpg`, `kiwar-battle`, `kiwar-sim`) :
  - `data/classes.ts` : stat liée, palier, parent, exigences, rang ;
  - `data/units.ts` : profil de combat par classe ;
  - `modifiers(v)`, `train` (vérifie stats et palier), `researchPower`, réparations,
    `workerPower` ;
  - les tâches (`sim/tasks.ts`), le nouveau bâtiment `trainingCamp` (3 tuiles) et ses postes,
    `sim/kikiwiwi.ts` ;
  - migration : les mages gardent leur classe, un Kikiwiwi perd la sienne.
  - `pnpm build:functions`. Pas de SQL.
- Client : écran Village avec un **arbre** lisible (palier, stats exigées en vert ou en rouge pour
  le kiwi choisi), fiches, tenues et accessoires des classes (34), modèle du camp (kit du 33),
  i18n FR + EN (formes inclusives).
- Bot : former des cueilleur·euses, des mages et des guerrier·ères ; s'entraîner au camp.
  Kiwisu et Kiwino à ±10 %.

## Découpage proposé

1. Données : stat liée, Cueilleur·euse et Barde, mage ×1,5, réparations, profils de combat ;
   tâches qui préfèrent la classe.
2. Kikiwiwi : Force + Endurance, perte de la classe, unité géante.
3. Camp d'entraînement : bâtiment, rang de classe, changement de classe, palier 2.
4. Palier 3 (deux stats), compétences, arbre dans l'écran Village, tenues.
5. Bot, équilibrage, docs (`kiwar-rpg`, `kiwar-battle`), `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- Chaque stat a une classe ; chaque classe a un effet colonie et une attaque, lisibles dans sa
  fiche et visibles en bataille.
- Une Bibliothèque tenue par des mages avance nettement plus vite (mesure du bot).
- On voit dans l'arbre ce qu'il manque à un kiwi pour devenir Archimage ou Oracle.
- Deux équipes de même taille mais de compositions différentes donnent des batailles
  différentes : optimiser ses kiwis paie.
- Le rapport d'équilibrage reste à ±10 % entre les faces.
