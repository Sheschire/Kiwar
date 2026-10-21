# Chantier 23 — Lumières HD, tuiles vivantes, chemins pavés et sobriété

Retours de partie de fin octobre 2026. **Client seulement**. Peut tourner en parallèle des
chantiers 19 et 22 ; après le chantier 20 si possible (même `GameRenderer.ts`).

## Intention du porteur

- « Le **PC chauffe** à l'utilisation. Le jeu est-il bien optimisé niveau calculs ? »
- « **Meilleur jeu de lumières**, même au crépuscule et/ou à l'aube. Ambiance plus **haut de
  gamme et réaliste HD** sur les lumières en fonction du moment de la journée, et les
  **animations simples**. »
- « Changer le design des **tuiles de chemin** : plutôt des petits **pavés de bois / pierre /
  route** au fur et à mesure des âges. »
- « Des **animations simples sur les tuiles concernées par un bâtiment** (par exemple, les
  tuiles de cueillette du bâtiment doivent avoir une **apparence différente**). Je veux que
  visuellement on **voie les récoltes se développer**, qu'on **comprenne quelle case est
  exploitée**. Mais de façon **naturelle, vivante**, pour **embellir notre kiwi**. »

## État actuel (code)

Chemins sous `apps/client/src/`.

- **Boucle de rendu** : `renderer.setAnimationLoop` (`GameRenderer.ts` ~278) dessine **chaque
  image, sans limite**, même quand rien ne bouge. À 120/144 Hz, deux fois plus de travail qu'à 60. Seule pause : un menu qui couvre la scène (`setBackground`, ~980-998). `updateScene`
  passe toutes les vues à chaque image, le calendrier et le ciel sont recalculés à chaque
  image, la jumelle refait sa matrice à chaque image.
- **Qualité** (`render/quality.ts`) : `auto` choisit **Haute** sur GPU dédié ou Apple (N8AO,
  bloom, tilt-shift, MSAA, ratio 2) : c'est le préréglage qui fait le plus chauffer. Mesures
  existantes : panneau `?debug` (passe perf d'octobre 2026, voir `DECISIONS.md`).
- **Lumières** (`render/lighting.ts`, `render/dayCycle.ts`) : une `HemisphereLight` + un soleil
  directionnel qui porte les ombres ; quatre préréglages DAY / NIGHT / DAWN / DUSK mélangés
  (`smoothstep` sur l'élévation, poids gaussien ×0,65 au crépuscule). Le soleil ne descend
  jamais très bas, la lune reste haute. Rendu : sRGB, ombres PCFSoft mises à jour seulement
  quand le soleil bouge, tone mapping NEUTRAL ; chaîne postfx : N8AO, bloom, tilt-shift,
  teinte, contraste, vignette.
- **Tuiles exploitées** : rien ne les distingue d'une tuile sauvage tant qu'on ne sélectionne
  pas le bâtiment (anneau de zone, `refreshCatchment`) ou qu'on n'ouvre pas le calque
  Logistique (`refreshZones`). Seul signe permanent : `TerrainView.setDepletion`
  (`render/terrain.ts` ~270) teinte une tuile vidée vers une couleur de paille sèche (8 paliers,
  par la couleur d'instance). Les décors (`render/props.ts`, arbres, rochers, en
  `InstancedMesh` par lot) sont fixes et ne savent pas qu'une tuile est récoltée. L'onde de fin
  de construction (`render/tileWave.ts`, chantier 16) allume la zone une seule fois, avec
  quelques pousses.
- **Chemins** (`render/paths.ts`) : une dalle hexagonale plate + 3 cailloux par tuile, en
  `InstancedMesh` (max 200). `PATH_LOOKS` ne change que les couleurs avec l'âge (sable → gris).

## Proposition

### 1. Sobriété d'abord (le PC chauffe)

- **Limite d'images/s** : réglage « Images/s : 30 / 60 / illimité », 60 par défaut (on saute les
  images en trop dans la boucle).
- **Repos** : quand rien ne bouge (caméra immobile, pas d'animation visible importante, pas
  d'interaction depuis 3 s), descendre à 20-30 images/s ; reprendre à 60 au moindre geste. Le
  tick de simulation garde son rythme.
- Onglet caché : déjà géré (le minuteur prend le relais) ; vérifier qu'aucun rendu ne
  continue.
- `auto` : Haute seulement si le GPU tient 60 images/s avec marge ; sinon Moyenne. Mesurer le
  coût de N8AO et du tilt-shift et proposer de les retirer de Haute s'ils coûtent trop pour ce
  qu'ils apportent.
- Profilage avec `?debug` sur une colonie avancée (`perfSave`) : rapporter avant/après
  (images/s, temps GPU, JS par image, consommation estimée).

### 2. Lumières par moment de la journée

- **Aube et crépuscule** : soleil bas sur l'horizon (ombres longues), lumière chaude et rasante
  orangée à rose, remplissage du ciel bleu-violet par l'hémisphère, léger contre-jour doré sur
  les bords (rim) ; la mer de nuages se teinte, brume chaude au loin.
- **Midi** : lumière plus neutre et franche, ombres courtes et nettes.
- **Nuit** : lune froide, et surtout des **lumières locales** : fenêtres des huttes et
  bâtiments qui s'allument au crépuscule (émissif + bloom, pas de vraies lumières ponctuelles),
  lanternes sur les chemins à partir d'un âge, lucioles en été.
- Courbes de couleur continues sur la journée (dégradés) au lieu de quatre préréglages, avec
  une exposition qui suit (pas de nuit trop sombre).
- **Animations simples** : herbe et feuillages qui ondulent au vent (shader de sommets), fumée
  des cheminées, reflets qui bougent sur le jus. Toutes en shader, sans coût CPU.
- Réglées par une planche de captures (`?sheet`-like) aux huit heures clés de la journée et aux
  quatre saisons.

### 3. Tuiles exploitées vivantes

But : qu'on voie d'un coup d'œil **quelle case est cultivée** et **où en est la récolte**, sans
calque ni sélection, de façon naturelle (pas de contour ni de couleur d'interface).

- **Aspect « cultivé »** selon la ressource de la tuile, dès qu'un bâtiment la récolte :
  - **chair (pulpe)** : rangées de petits buttes de pulpe ou de jeunes pousses alignées, terre
    un peu retournée ;
  - **bosquet (fibre)** : tiges de fibre en touffes taillées, quelques bottes liées ;
  - **couronne de pépins (graines)** : pépins rangés en tas ou en sillons, petit outil posé ;
  - **jus** : un ponton ou une rigole en bois au bord, des seaux, des reflets qui bougent ;
  - les tuiles sauvages gardent leur décor naturel : le contraste suffit à lire la zone.
- **La récolte qui pousse** : la hauteur, la densité et la couleur des pousses suivent le
  remplissage du gisement (le même ratio que `setDepletion`) : pleine = touffue et colorée,
  entamée = clairsemée, vidée = terre nue et paille ; la repousse se voit grandir doucement.
  Les paliers évitent de reconstruire à chaque tick (même principe que `depletionSig`).
- **Vie** : les pousses ondulent au vent (shader de sommets, phase par tuile), un kiwi qui
  récolte fait frémir la touffe, quelques particules (feuilles, gouttes, poussière de pépins)
  au moment de la cueillette ; en hiver neige sur les buttes, au printemps petites fleurs.
- **Tuile convoitée par deux bâtiments** : partagée, elle porte les deux aspects mêlés (pas de
  signal d'alerte : le calque Logistique reste l'outil d'analyse).
- **Coût** : un `InstancedMesh` par type de pousse pour toute la carte (quelques appels de
  dessin), matrices et couleurs mises à jour seulement quand un palier change ; animation dans
  le shader. Qualité Basse : pousses moins nombreuses, sans vent.

### 4. Chemins pavés par âge

- **Éden** : planches de bois et rondins posés en travers ; **Pierre** : pavés irréguliers ;
  **Fer** : pavés taillés avec bordure ; **Industrie** : route lisse avec marquage.
- Chaque style = quelques géométries en `InstancedMesh` (une par style, pas un mesh par
  tuile), orientées selon les tuiles voisines pour que les chemins se raccordent.

## Impact technique

- Client seulement : `GameRenderer.ts`, `render/quality.ts`, `render/postfx.ts`,
  `render/lighting.ts`, `render/dayCycle.ts`, `render/environment.ts`, `render/paths.ts`,
  `render/buildingModels.ts` (fenêtres émissives), `render/terrain.ts` et un nouveau
  `render/crops.ts` (tuiles exploitées, à partir des zones de récolte déjà calculées par
  `game/perState.ts` et `catchmentPlan`), `render/props.ts` (masquer le décor sauvage d'une
  tuile cultivée), réglages, i18n FR + EN.
- Aucune lumière ponctuelle en plus (coût par fragment) : tout passe par l'émissif et le bloom.
- Le chantier 24 (caméra libre) change la profondeur et le ciel : se coordonner si les deux
  tournent en même temps.

## Découpage proposé

1. Mesures, limite d'images/s, repos, `auto` revu (pousser seul : c'est le plus utile).
2. Courbes de lumière continues, aube et crépuscule.
3. Nuit : fenêtres et lanternes ; animations de vent.
4. Tuiles exploitées vivantes : aspect cultivé par ressource, pousses qui suivent le
   gisement, vent et frémissement.
5. Chemins pavés par âge.
6. Planche de captures (heures × saisons), mesures avant/après, docs, skills `kiwar-client` et
   `kiwar-cycles`.

## Critères d'acceptation

- Au repos, la colonie consomme nettement moins (images/s et temps GPU divisés au moins par
  deux sur la mesure `?debug`).
- Une capture à l'aube et une au crépuscule paraissent « dorées » et différentes de midi.
- Sans rien sélectionner, on reconnaît les cases exploitées et on voit si leur gisement est
  plein, entamé ou vide ; la colonie paraît cultivée et vivante (planche de captures avant /
  après).
- Les chemins changent de matière à chaque âge et se raccordent.
- Pas de baisse d'images/s en partie (mesure avant/après).

## Questions ouvertes

1. Limite par défaut : 60 images/s (proposé), ou 30 sur portable sur batterie ?
2. Fenêtres allumées la nuit : sur tous les bâtiments, ou seulement là où des kiwis dorment /
   travaillent ?
3. Faut-il garder le tilt-shift (flou des bords) en Haute s'il coûte cher ?
4. Tuiles exploitées : l'aspect cultivé apparaît dès que le bâtiment est posé (zone entière),
   ou seulement sur les tuiles où des kiwis récoltent vraiment (plus juste, mais la zone se
   remplit au fil du travail) ?

Réponses du porteur : 60 images/s par défaut avec ralenti au repos ; fenêtres allumées là où
des kiwis dorment ou travaillent ; tilt-shift gardé s'il coûte peu (≈ 3 % mesuré : gardé) ;
aspect cultivé dès que le bâtiment est posé (zone entière).

## Bilan

Fait (détail et mesures dans `DECISIONS.md`) :

1. **Sobriété** : limite d'images/s (30 / 60 / illimité, 60 par défaut, Réglages), ralenti au
   repos (30 images/s après 3 s, 20 après 20 s, réveil au moindre geste ou spectacle), rien
   dessiné onglet caché, qualité adaptative jugée sur la cadence visée, `auto` qui part de
   Moyenne et ne monte à Haute qu'avec de la marge GPU. `?debug` montre la cadence visée.
   `scripts/sobriety.mjs` : au repos 60 → 30 → 20 images dessinées par seconde.
2. **Lumière continue** : deux chapelets de clés le long de l'élévation du soleil (matin rosé,
   soir doré, heure bleue, nuit), contre-jour chaud aux heures dorées (coupé en Basse), lune
   plus froide et plus basse. `scripts/lightSheet.mjs` : planche 8 heures × 4 saisons.
3. **Nuit et vent** : vitres chaudes sur les portes et fenêtres posées au lancer de rayon,
   allumées au coucher là où des kiwis dorment, travaillent ou étudient ; halos sur les mêmes
   bâtiments ; vent dans l'herbe, les touffes et les poils (shader, coupé en Basse).
4. **Tuiles exploitées vivantes** (`render/crops.ts`) : aspect cultivé par ressource, pousses
   qui suivent le gisement (8 paliers, éclaircies, sèches, repousse douce).
5. **Chemins pavés par âge** raccordés aux voisins et aux bâtiments, lanternes dès Pierre.

Reste : frémissement d'une touffe et particules quand un kiwi récolte ; reflets mouvants du
jus ; soleil vraiment rasant (essayé, sol trop sombre) ; mesure du temps GPU réel et du
passage `auto` → Haute sur le PC du porteur.
