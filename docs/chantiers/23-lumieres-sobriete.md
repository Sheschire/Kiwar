# Chantier 23 — Lumières HD, chemins pavés et sobriété

Retours de partie de fin octobre 2026. **Client seulement**. Peut tourner en parallèle des
chantiers 19 et 22 ; après le chantier 20 si possible (même `GameRenderer.ts`).

## Intention du porteur

- « Le **PC chauffe** à l'utilisation. Le jeu est-il bien optimisé niveau calculs ? »
- « **Meilleur jeu de lumières**, même au crépuscule et/ou à l'aube. Ambiance plus **haut de
  gamme et réaliste HD** sur les lumières en fonction du moment de la journée, et les
  **animations simples**. »
- « Changer le design des **tuiles de chemin** : plutôt des petits **pavés de bois / pierre /
  route** au fur et à mesure des âges. »

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

### 3. Chemins pavés par âge

- **Éden** : planches de bois et rondins posés en travers ; **Pierre** : pavés irréguliers ;
  **Fer** : pavés taillés avec bordure ; **Industrie** : route lisse avec marquage.
- Chaque style = quelques géométries en `InstancedMesh` (une par style, pas un mesh par
  tuile), orientées selon les tuiles voisines pour que les chemins se raccordent.

## Impact technique

- Client seulement : `GameRenderer.ts`, `render/quality.ts`, `render/postfx.ts`,
  `render/lighting.ts`, `render/dayCycle.ts`, `render/environment.ts`, `render/paths.ts`,
  `render/buildingModels.ts` (fenêtres émissives), réglages, i18n FR + EN.
- Aucune lumière ponctuelle en plus (coût par fragment) : tout passe par l'émissif et le bloom.
- Le chantier 24 (caméra libre) change la profondeur et le ciel : se coordonner si les deux
  tournent en même temps.

## Découpage proposé

1. Mesures, limite d'images/s, repos, `auto` revu (pousser seul : c'est le plus utile).
2. Courbes de lumière continues, aube et crépuscule.
3. Nuit : fenêtres et lanternes ; animations de vent.
4. Chemins pavés par âge.
5. Planche de captures (heures × saisons), mesures avant/après, docs, skills `kiwar-client` et
   `kiwar-cycles`.

## Critères d'acceptation

- Au repos, la colonie consomme nettement moins (images/s et temps GPU divisés au moins par
  deux sur la mesure `?debug`).
- Une capture à l'aube et une au crépuscule paraissent « dorées » et différentes de midi.
- Les chemins changent de matière à chaque âge et se raccordent.
- Pas de baisse d'images/s en partie (mesure avant/après).

## Questions ouvertes

1. Limite par défaut : 60 images/s (proposé), ou 30 sur portable sur batterie ?
2. Fenêtres allumées la nuit : sur tous les bâtiments, ou seulement là où des kiwis dorment /
   travaillent ?
3. Faut-il garder le tilt-shift (flou des bords) en Haute s'il coûte cher ?
