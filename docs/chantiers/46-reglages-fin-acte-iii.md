# Chantier 46 — Réglages d'après l'acte III

Entre l'acte III et l'acte IV du [carnet de route](../CARNET_DE_ROUTE.md) (section 8 ter, bilan
de l'acte III). **Simulation + bot**, peu de client. Après le 45.

**Skills à charger** : `kiwar-design`, `kiwar-balance`, `kiwar-cycles` (moral),
`kiwar-expeditions` et `kiwar-colonies` (débarquements, balises, reine), `kiwar-civ`,
`kiwar-threats` (vagues).

## Intention du porteur

Le 25 octobre 2026, à la lecture du bilan de l'acte III : « Je suis tes recommandations sur
tous ces sujets. » Les points du bilan et les décisions encore ouvertes de l'acte II sont donc
tranchés comme ci-dessous.

## Décisions déjà prises

1. **Blessés plutôt que morts quand le terrain est tenu** (question 1 de l'acte II) : un kiwi
   tombé dans un débarquement **gagné** ou dans l'attaque d'une balise **tenue** revient
   blessé (comme une blessure de vague : soigné au repos), au lieu de mourir. Une retraite ou
   une défaite tue toujours (« tout kiwi tombé meurt » ne vaut plus que là). L'équipement reste
   sur le terrain tenu comme aujourd'hui. Les deuils (chantier 43) ne viennent plus que des
   vrais morts.
2. **Un moral plus exigeant** : le village bâti doit placer un kiwi autour de **60–75** à la
   Pierre et au Fer chez le bot attentif ; dépasser 85 doit demander **des dépenses qui
   reviennent** (discours, soupers, cabaret, feux d'artifice), pas des bâtiments posés une
   fois. Point de départ (à calibrer par la sonde du village) :
   - bases par âge `MORALE.base` 46 / 36 / 31 / 26 → **46 / 30 / 22 / 16** (l'Éden ne change pas) ;
   - beauté plafonnée à **+5** (au lieu de +8) ;
   - loisirs plafonnés à **+10** (au lieu de +14).
     Un kiwi qui boude (< 20) reste rare, mais possible en deuil.
3. **Les vagues du joueur occasionnel** : retrouver **≤ 10 % de vagues perdues** (20 %
   aujourd'hui, 9 % à la fin de l'acte II), sans mort. Diagnostiquer d'abord (vagues plus
   fortes de la civilisation ? moins de tourelles ? réserves pillées ?), puis corriger la
   cause. Chaque menace garde au moins deux parades annoncées.
4. **L'écart de face sur la jumelle** (question 4 de l'acte II) : diagnostiquer d'abord si
   l'écart vient du bot ou de la civilisation de chaque face. Aujourd'hui la balise du centre
   tombe en 37 h côté Kiwino et en 2,6 jours côté Kiwisu. La cible est un écart de **±15 %**
   sur la première balise du centre.
5. **Le rythme de la conquête** (question 2 de l'acte II) : d'abord appliquer le point 1 et
   remesurer, puis viser **la reine sortie entre le jour 7 et le jour 14** et **la conquête
   entre le jour 14 et le jour 21 dans au moins 3 parties sur 6**. Les leviers :
   - une conquête trop tôt → une reine plus solide (`SIEGE.final`) ;
   - un blocage → un centre qui grandit moins vite à l'Industrie (`CIV.innerMultiple`,
     `ageMultiple`).
6. **Le prix de la fortification** (question 3 de l'acte II) ne change pas : la moitié de deux
   tourelles du premier niveau de l'âge.
7. **La Pierre à 13,5–15,5 h** : la règle ne change pas (l'âge reste dans les ±15 % de la cible
   de 12 h). Si les réglages ci-dessus la poussent au-delà de 13,8 h de médiane, le **bot**
   bâtit ses décors après le monument (c'est un choix du bot, pas une règle).
8. **Le ressenti, inchangé jusqu'à ce que le porteur joue** :
   - les rives fertiles (+30 %) et les canaux (80 pulpe + 40 fibre, 1 h, plafond 3 / 6 / 10 / 15) ;
   - le cabaret (60 de jus) et les feux d'artifice ;
   - la beauté sans placement ;
   - la valeur d'un discours.
9. Les **hauts plateaux** lents en longue partie (Fer 3,6 j, pas d'Industrie en 12 jours) :
   remesurer avec plus de graines avant toute retouche du biome.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- Morts d'un débarquement : `sim/landing.ts` `resolveLanding` (~308 : `log.result.lost` →
  `removeVillagers(state, dead, 'battle', at, outcome !== 'victory')`).
- Morts d'une attaque de balise : `sim/beacons.ts` (~259 : `dead = log.result.fallen…`).
- Blessures : celles des vagues et de l'infusion ratée (`injured`, `healInjuries`, skill
  `kiwar-threats`).
- Moral : `data/needs.ts` `MORALE` (`base`, `beauty`, `leisureMax`), `sim/rest.ts`
  `colonyMood`, `kiwiMorale`, `moraleOf`.
- Vagues et profils : `RunResult.final.wavesLost`, rapport « Waves by profile » ; profil
  occasionnel `activeMs` 6 h + `sessionEveryMs` 8 h.
- Jumelle : `RunResult.times.centreWon` par face ; civilisation `sim/civ.ts`, `data/aliens.ts`.

## Découpage proposé

1. **Blessés sur un terrain tenu** : débarquement gagné, balise tenue ; tests (exactitude,
   gear gardé, pas de deuil) ; textes du rapport de bataille (« revenu·e blessé·e »).
2. **Moral plus exigeant** : nouvelles bases et plafonds, calibrés avec la sonde du village
   (6 biomes × 72 h, moyenne à 12 / 24 / 48 / 72 h), tests à valeurs exactes recalés.
3. **Vagues de l'occasionnel** : diagnostic (scratch `runBot` avec le profil occasionnel,
   chaque vague perdue : sa force, nos tourelles, les réserves), puis le correctif.
4. **Écart de face sur la jumelle** : diagnostic puis correctif.
5. **Conquête** : la sonde de 21 jours, puis le levier s'il le faut.
6. Rapport complet, sonde de conquête, `DECISIONS.md`, `PLAN.md`, skills.

## Critères d'acceptation

- Aucun kiwi ne meurt sur un terrain que nous tenons ; les morts en 21 jours sont nettement
  moins nombreux (aujourd'hui de 7 à 71).
- Moral moyen du bot attentif à 60–75 avec le village bâti, au-dessus de 85 seulement avec
  des soirées et des discours.
- L'occasionnel perd au plus une vague sur dix, sans mort.
- La balise du centre tombe dans les ±15 % entre Kiwisu et Kiwino.
- La conquête aboutit entre le jour 14 et le jour 21 dans au moins 3 parties sur 6.
- L'économie reste dans ±10 % entre biomes et entre faces.
