# Chantier 10 — Confort visuel et performance

Retours de partie d'octobre 2026 sur la caméra, le rendu et la fluidité. Ce chantier ne touche
que le client : il peut tourner en parallèle d'un chantier de simulation.

## Intention du porteur

- La **planète alien** tourne en même temps que les mouvements de caméra : elle devrait être
  fixe. Ça aiderait aussi à voir d'où viennent les attaques (voir le chantier 12).
- **Qualité haute** : un peu trop de flou, à réduire.
- **Inertie de la caméra sur mobile** : éviter de devoir faire défiler l'écran à la main,
  laborieusement, pour aller d'un point à l'autre de la planète.
- **Lenteurs** : « Je suis sur un MacBook Pro 2015, les navigations dans les menus sont très
  laborieuses et lentes, le ressenti général est saccadé. Y a-t-il des optimisations à faire ? »
- Quand la caméra montre la planète de profil, **on voit l'intérieur** de la planète : il faut
  corriger ces défauts visuels.
- **Kiwi du début du jeu** (intro) : il n'est pas rond, le flash est mauvais, l'animation est à
  retravailler, et du jus doit gicler au coup de lame.

## État actuel (code)

- **Planète jumelle** (`apps/client/src/render/twin.ts`) : c'est un groupe à part, mais il est
  **replacé à chaque image** depuis la caméra : le long de la direction de vue, à la distance de
  la caméra + 34, tourné selon l'azimut de la caméra (`rotateY(azimuth)`), penché de 0,45 rad,
  avec une oscillation de ±0,6. Il apparaît entre les ratios de zoom 1,08 et 1,75.
- **Qualité** (`render/quality.ts`, `render/postfx.ts`) : le préréglage haut ajoute N8AO
  (occlusion ambiante), le bloom, un **tilt-shift** (focusArea 0,5, feather 0,32 : c'est lui, le
  flou), MSAA 4 et un DPR de 2. Le mode « auto » choisit selon le GPU et peut baisser en cours de
  partie.
- **Caméra** (`camera/CameraRig.ts`) : camera-controls avec `smoothTime 0.2` et
  `draggingSmoothTime 0.09`. **Aucune inertie propre après le lâcher**. Rotation à deux doigts
  appliquée sans transition, angle polaire entre 0,32 et 1,12 rad.
- **Intérieur visible** : la moitié poilue du bas est une demi-sphère ouverte en `DoubleSide`
  (`render/terrain.ts`), le plan proche est à 0,5 (`GameRenderer.ts`), et la jumelle réutilise
  le même `TerrainView`. Selon l'angle, on voit par le bord ouvert ou par des trous sous les
  tuiles.
- Les animations des bâtiments utilisent un mesh par partie animée (dette notée dans
  `PLAN.md`).

## Proposition

### Caméra et ciel

- **Planète alien fixe** dans le repère du monde : une position et une orientation constantes
  (au-dessus du bord de la falaise côté « front », voir le chantier 12), une lente rotation
  propre, et toujours visible au dézoom. Elle sert de repère d'orientation.
- **Inertie mobile** : à la fin d'un glissement, on garde la vitesse du doigt et on la laisse
  décroître (≈ 0,6 s), avec des bornes souples. On ajoute un **double tap sur une tuile** pour y
  voler, et une **mini-boussole** (tap = recentrer sur le Nid).
- La rotation à deux doigts est lissée comme le reste.

### Rendu

- Qualité haute : tilt-shift beaucoup plus léger (focusArea ≈ 0,75, feather ≈ 0,2) ou
  désactivable dans les réglages (« Flou de profondeur : oui/non »).
- **Planète fermée** : on ferme la coque (un disque de coupe ou une sphère pleine en `FrontSide`
  avec une face intérieure « pulpe » volontaire), on vérifie les jupes sous les tuiles, et on
  limite l'angle polaire et le plan proche pour ne jamais passer dedans.

### Performance (petites configurations)

- **Mesurer d'abord** : un profil de rendu (images par seconde, ms CPU/GPU, appels de dessin)
  affiché en mode debug, plus une mesure des re-rendus Preact pendant l'ouverture des menus.
- Pistes probables :
  - Les menus re-rendus à chaque tic du store : sélecteurs plus fins, mémoïsation, listes
    virtualisées dans l'écran du village et la recherche.
  - Pas de flou d'arrière-plan CSS (`backdrop-filter`) sur les vieux GPU.
  - Rendu 3D en pause ou à 30 images/s quand un menu plein écran est ouvert.
  - Instancing des parties animées.
  - Un préréglage auto plus prudent pour les GPU intégrés (Intel Iris, typique d'un MacBook Pro 2015) : moyen sans N8AO, avec un DPR de 1,25.
- Objectif : ouverture d'un menu en moins de 100 ms, 50 images/s et plus en préréglage moyen sur
  un MacBook Pro 2015.

### Intro

- Un kiwi bien rond (sphère plus résolue, ombrage doux), un coup de lame avec une traînée nette
  (sans flash blanc plein écran), une **giclée de jus** (particules vertes, gouttes qui tombent),
  et un son synchronisé.

## Découpage proposé

1. **Mesures de performance** et premières optimisations (menus, pause du rendu 3D, préréglage
   auto).
2. **Caméra** : inertie mobile, double tap pour voler, boussole, rotation lissée.
3. **Planète alien fixe**, flou réduit et réglable.
4. **Planète fermée**, sans intérieur visible sous aucun angle.
5. **Intro retravaillée** (kiwi rond, coup de lame, jus).
6. Captures desktop et téléphone, docs, skill `kiwar-client`.

## Critères d'acceptation

- On traverse la planète d'un bord à l'autre en un ou deux gestes sur téléphone.
- On ne voit jamais l'intérieur de la planète, quel que soit l'angle de caméra.
- La planète alien reste au même endroit du ciel quand on tourne la caméra.
- Les menus s'ouvrent sans latence perceptible sur un MacBook Pro 2015 (mesure avant/après
  notée dans `DECISIONS.md`).

## Questions ouvertes

1. Le porteur peut-il partager une mesure de son MacBook (le compteur d'images/s du mode debug)
   avant et après ?
2. Garder le tilt-shift, même léger, ou le supprimer complètement ?
3. Double tap pour voler vers une tuile : est-ce que ça gêne la sélection d'un bâtiment (on garde
   le tap simple pour sélectionner) ?
