# Chantier 49 — La tranche : les Tréfonds vus en coupe

Acte IV « Au-delà » du [carnet de route](../CARNET_DE_ROUTE.md) (section 9). **Client
seul.** Après le **48** ; il peut tourner **en parallèle du 50** (prudence : ne pas toucher aux
mêmes textes i18n en même temps).

**Skills à charger** : `kiwar-client`, `kiwar-world`, `kiwar-battle` (spectacles), et
`kiwar-depths` (créé au 48).

## Intention du porteur

« On le voit en tournant la caméra : la tranche de la planète montre les galeries. »
(carnet, section 9). Regarder ses kiwis creuser et descendre doit être un plaisir en soi (charte
9, le jeu délégué), comme la bataille en direct l'est pour les débarquements (chantier 41).

## Décisions déjà prises

- La mécanique des Tréfonds est faite au chantier 48 : le graphe de salles, les galeries, les
  descentes et leurs journaux, ainsi que les remontées. Ici, on ne fait que la montrer.
- **Le journal fait foi** : une descente se rejoue depuis son journal, sans jamais recalculer
  (règle du 36).
- Le téléphone doit rester fluide : la coupe se dessine à la demande, et rien ne coûte quand on
  ne la regarde pas (chantiers 10 et 23).

## État actuel (code)

Chemins sous `apps/client/src/`.

- **Le dôme** : `createKiwiDome` (`render/terrain.ts` ~356-400, `DOME_TOP` −1,9) est une
  demi-sphère à fourrure sous les tuiles. Un disque (`SKIN_CUT`) ferme la coupe, et il n'est
  vu qu'entre les tuiles. **Aucune tranche n'est dessinée aujourd'hui.**
- **Caméra** : `camera/CameraRig.ts` (~33 : `MIN_POLAR` 0,32, `MAX_POLAR` 1,12, `TOP_POLAR`
  1,5), `visit` / `flyTo`, `shift` (la jumelle).
- **Spectacles** : `BattleShow.play(state, source, from, opts)` (`ShowSource` : une vague ou un
  débarquement) dans `render/battle/` ; `TwinView.attach` dessine dans le repère de la jumelle.
  Tout passe par le `show` actif de `GameRenderer`.
- **Kit d'âge** : `render/models/ageKit.ts`. **Animations** : `render/anim/`. **Effets** :
  `particles.ts` (`EFFECTS`). Les planches de vérification sont `?kiwis` et `?sheet`.
- **Boucle** : `renderer.wake()` et `render/frameLimiter.ts`.

## Proposition

- **Une vue en coupe** (bouton « Tréfonds » de l'écran du 48, plus un geste : incliner au-delà du
  bord). La caméra descend le long du dôme, et un **quartier du dôme s'ouvre** comme une part de
  fruit. On y voit :
  - les couches : la chair verte et ses faisceaux clairs, l'anneau blanc des loges et ses
    graines noires, le cœur crème (couches 2 et 3 en silhouette tant qu'elles sont fermées) ;
  - les salles vues, creusées dans la paroi, et les galeries éclairées de lanternes ; le
    brouillard sur le reste ;
  - les mineur·euses au travail (pose de pic, wagonnet de sève) et les kiwis qui descendent par
    l'entrée.
- **Descente en direct** : une nouvelle `ShowSource` `delve`, rejouée dans la salle en coupe
  (avance et traîne comme au 41). On peut toucher une unité pour voir sa fiche. Absent·e, on
  regarde le replay.
- **Remontée** : la vague sort de l'entrée de tunnel en surface, montrée par le spectacle
  existant des vagues.
- **Effets** : poussière de creusement, gouttes de sève, éclats de raphides, et les lacs
  d'actinidine qui fument (en silhouette jusqu'au 50).
- **Performance** : la coupe est un maillage construit à l'ouverture et libéré à la fermeture,
  avec peu de lumières (le chantier 23). En qualité basse, les salles sont des disques peints.

## Grille de décision (kiwar-design)

- **Boucle** : cœur (observer → décider). Il n'y a pas de nouveau robinet ni de nouveau puits.
- **Personnes** : l'effet relève du ressenti (le plaisir de regarder). Le porteur doit le jouer,
  et on le note « à tester » dans `DECISIONS.md`.

## Découpage proposé

1. **La coupe** : le quartier de dôme ouvert, les couches, la caméra et le geste ; planche
   `?depths`.
2. **Salles et galeries** : les salles vues, le brouillard, les lanternes, les mineur·euses.
3. **Descente en direct** : `ShowSource` `delve`, le rejeu, la fiche d'unité.
4. **Finitions** : effets, sons (skill `kiwar-audio`), qualité basse, captures desktop et
   téléphone, `DECISIONS.md`, `kiwar-depths`, `kiwar-client`.

## Critères d'acceptation

- En inclinant la caméra ou par le bouton, la tranche montre les galeries et les kiwis qui y
  travaillent.
- Une descente se regarde en direct ou en replay, à l'identique de son rapport.
- Sur téléphone, la vue en coupe tient les images/s de la vue normale (mesure `?debug`).
