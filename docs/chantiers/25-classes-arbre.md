# Chantier 25 — Classes : une par stat, arbre de classes

Retours de partie de fin octobre 2026. **Simulation** : à lancer **après le chantier 19**
(colonisation), qui touche aussi aux combats et aux Kikiwiwis.

## Intention du porteur

- « Une **classe dédiée pour récolter plus vite** (comme bâtisseur pour la construction). »
- « **Chaque classe doit être associée à une stat**, avec un **bénéfice colonie + combat** si
  possible. **Proposer de nouvelles classes.** »
- « **Arbre d'améliorations de classe**, exemple mage → archimage → etc. Si possible des
  **classes avancées qui nécessitent deux stats** avancées. »
- « Les **mages doivent mener des recherches plus vite**. »
- « **Endurance et Force** augmentent les chances de réussite du passage à Kikiwiwi. **Le
  Kikiwiwi perd le métier.** »

## Réponse du porteur (fin octobre 2026)

**Nouvelle classe Cueilleur·euse** (Dextérité) pour la récolte ; l'éclaireur·euse reste la
classe des expéditions (Agilité). Une classe par stat.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Stats** (`data/kiwis.ts` ~8-15) : force, agilité, endurance, esprit, dextérité, charisme
  (1-10 au départ, 20 au plus, moyenne 5). Effets : Dextérité +3 % récolte par point au-dessus
  de 5 ; Force +2 % construction et +6 % combat ; Endurance +3 % combat et moins d'exposition ;
  Esprit +4 % XP et +6 % recherche ; Charisme seulement via le·la maire ; **Agilité presque
  sans effet**.
- **Classes** (`data/classes.ts`) : builder, warrior, mage, scout, mayor. **Aucune n'exige de
  stat** : il faut un niveau d'École, un niveau de kiwi, un coût, un temps. Trois compétences à
  5 / 10 / 20. **Pas de paliers.** Changer de classe coûte le double.
  - mage : combat ×1,3, récolte ×1,15, construction ×0,9, **recherche ×1,2** (le rêveur
    ×1,15) ; Main verte, Pluie, Foudre.
  - scout : combat ×1,1, poids ×0,5, récolte ×1,05 ; Vol plané, Repérage, Vent arrière.
  - warrior : combat ×1,5, construction ×1,1, récolte ×0,95.
  - builder : construction ×1,3. mayor : unique, Organisation, Discours, Fête.
- **Recherche** (`sim/research.ts` ~129-153) : `researchPower` = (1 + 0,06·(esprit−5)) ×
  (1 + 0,03·rang) × `modifiers.research`.
- **Tâches** (chantier 15, `sim/tasks.ts`) : les postes sont remplis par stat (construction par
  Force, recherche par Esprit, cratères et poussière par Dextérité).
- **Kikiwiwi** (`sim/kikiwiwi.ts` ~53-95, `data/kikiwiwi.ts`) : risque = 0,4 − 0,02·(endurance
  − 5) − 0,01·(niveau − 1) − bonus labo − sang vert, borné 0,05-0,6. **La Force ne compte pas.**
  En cas de succès, `classId` est **gardé** (ses modificateurs se multiplient avec ceux du
  Kikiwiwi).

## Proposition

### Une classe par stat (palier 1, École 1-2)

| Stat      | Classe                     | Colonie                                    | Combat                           |
| --------- | -------------------------- | ------------------------------------------ | -------------------------------- |
| Force     | Bâtisseur·euse             | construction ×1,3                          | coups de masse : combat sol ×1,1 |
| Agilité   | Éclaireur·euse             | expéditions : poids ×0,5, voyage plus vite | esquive : exposition ×0,7        |
| Endurance | Guerrier·ère               | réparations ×1,5 (nouveau)                 | combat ×1,5 (garnison)           |
| Esprit    | Mage                       | **recherche ×1,5** (était 1,2)             | foudre : touche les volants      |
| Dextérité | **Cueilleur·euse** (neuve) | récolte ×1,3, cratères ×1,3                | fronde : combat volants ×1,2     |
| Charisme  | Maire (unique)             | moral (Organisation, Discours)             | —                                |
| Charisme  | **Barde** (neuve)          | moral +1 % par barde (plafond 5 %)         | chant de guerre : garnison ×1,05 |

- **Lien à la stat** : le bonus de classe grandit avec sa stat (par exemple +2 % par point
  au-dessus de 5), et la classe demande sa stat **≥ 6** pour être formée (à confirmer).
- Le mage perd son bonus de récolte (il passe au·à la cueilleur·euse) ; les chiffres exacts se
  fixent avec le bot.
- **Agilité** gagne enfin des effets : vitesse de marche des kiwis (logistique), esquive.

### Arbre de classes

- **Palier 2 — classe avancée** (École niveau 3, kiwi niveau 10, sa stat ≥ 10) :
  Bâtisseur·euse → **Architecte** ; Éclaireur·euse → **Navigateur·rice** ; Guerrier·ère →
  **Champion·ne** ; Mage → **Archimage** (recherche ×2) ; Cueilleur·euse → **Herboriste** ;
  Barde → **Ménestrel**. Bonus du palier 1 renforcés + une nouvelle compétence.
- **Palier 3 — classe de maître, deux stats** (École niveau 4+, âge du Fer, kiwi niveau 20,
  deux stats ≥ 12), venant de l'une des deux classes avancées :
  - **Ingénieur·e** (Force + Esprit) : construction et recherche, répare les vaisseaux ;
  - **Paladin·e** (Endurance + Charisme) : garnison et moral de la garnison ;
  - **Druide** (Esprit + Dextérité) : repousse des gisements, Pluie plus forte ;
  - **Rôdeur·euse** (Agilité + Dextérité) : expéditions et butin ;
  - **Titan·e** (Force + Endurance) : combat lourd, travaux pénibles ;
  - **Oracle** (Esprit + Charisme) : recherche et prévision des vagues plus tôt.
- Monter de palier = une nouvelle formation à l'École (coût et temps croissants), sans perdre
  les compétences déjà acquises.
- Écran Village : un **arbre** lisible (palier, stats exigées en vert/rouge pour le kiwi
  choisi).

### Kikiwiwi

- Risque : −0,02 par point d'**Endurance** et −0,02 par point de **Force** au-dessus de 5 (en
  plus du niveau et du labo), même bornes.
- **Le Kikiwiwi perd sa classe** (et ses compétences de classe) : `classId` remis à zéro, les
  modificateurs du Kikiwiwi seuls s'appliquent. La fiche l'annonce avant l'infusion.

## Impact technique

- Simulation (skill `kiwar-rpg`, `kiwar-sim`) : `data/classes.ts` (stat liée, palier, parent,
  exigences), `modifiers(v)`, `train` (vérifie stats et palier), `researchPower`, réparations,
  `workerPower` (cueilleur·euse), tâches du chantier 15 (préférer la classe du poste),
  `sim/kikiwiwi.ts`, migration de sauvegarde (les mages gardent leur classe ; un kiwi déjà
  Kikiwiwi perd sa classe).
- Le serveur embarque la simulation : `pnpm build:functions`. Pas de SQL a priori.
- Client : écran Village (arbre), fiches, icônes et tenues des nouvelles classes, i18n FR + EN
  (formes inclusives).
- **Bot et équilibrage** (skill `kiwar-balance`) : le bot forme des cueilleur·euses et des
  mages ; Kiwisu et Kiwino à ±10 %.

## Découpage proposé

1. Données : stat liée, Cueilleur·euse et Barde, mage ×1,5, réparations du·de la guerrier·ère ;
   tâches qui préfèrent la classe ; bot.
2. Kikiwiwi : Force + Endurance, perte de la classe.
3. Paliers 2 (avancés) et l'arbre dans l'écran Village.
4. Paliers 3 (deux stats), compétences, tenues.
5. Équilibrage, docs, skill `kiwar-rpg`.

## Critères d'acceptation

- Chaque stat a une classe ; chaque classe a un effet colonie et un effet combat lisibles dans
  sa fiche.
- Une bibliothèque tenue par des mages avance nettement plus vite (mesure du bot).
- On voit dans l'arbre ce qu'il manque à un kiwi pour devenir Archimage ou Oracle.
- Le rapport d'équilibrage reste à ±10 % entre faces.

## Questions ouvertes

1. Exiger la stat ≥ 6 pour la classe de base (proposé), ou seulement la recommander ?
2. Le Barde (Charisme) : à garder, ou le Charisme reste-t-il au seul·e maire ?
3. Noms des classes avancées et de maître : à valider (Architecte, Navigateur·rice,
   Champion·ne, Archimage, Herboriste, Ménestrel ; Ingénieur·e, Paladin·e, Druide,
   Rôdeur·euse, Titan·e, Oracle).
4. Le Kikiwiwi perd-il seulement sa classe, ou aussi son métier (il ne travaille déjà jamais
   dans un bâtiment) ?
