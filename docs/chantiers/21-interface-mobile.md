# Chantier 21 — Interface mobile

Retours de partie de fin octobre 2026. **Client seulement**, à lancer **après le chantier 20**
(mêmes fichiers de style).

## Intention du porteur

- « Sur mobile : **trop de boutons sur le côté**. Besoin d'un **dropdown avec les noms des
  boutons** affichés et mieux agencés. »
- « Revoir l'UX sur mobile pour un **gameplay fluide** avec les **boutons principaux facilement
  accessibles**. »
- Règle du projet : « Mobile très fluide et réactif ».

## État actuel (code)

Chemins sous `apps/client/src/`.

- **Colonne en haut à droite** (`ui/components/TopBar.tsx`, `.topbar-buttons` ~350-425) :
  Village (avec ses points), Défense, Plans, Univers, Chat (non lus), Objectifs, Son, Réglages.
  En portrait elles s'empilent à la verticale (`styles.css` ~1523), en paysage en rangée
  (~1665). Icônes seules, sans nom.
- **Boutons ronds en bas à droite**, de bas en haut : Œuf (`EggButton`, 60 px), Chemins
  (`PathTools.tsx`), Boussole (`Compass.tsx`), Niveaux et Logistique (`BuildingTree.tsx`),
  décalés à la main (+72, +130, +182, +232 px).
- Le tout est monté dans `ui/App.tsx` (~143-160). Points de rupture : `max-width: 760px`,
  paysage `(max-width:760px) and (orientation:landscape), (max-height:520px)`, intermédiaire
  761-1500 px.
- Avec une fiche ouverte (`.has-sheet`), la plupart sont cachés ; la file, les objectifs, les
  badges et les expéditions ont chacun leur règle.
- Treize boutons environ, sans hiérarchie : les actions de chaque minute (construire, Village,
  œuf) ont le même poids que Son ou Réglages.

## Proposition

### Une barre au pouce et un menu nommé

- **Barre du bas** (zone du pouce, 56-64 px, au-dessus de la zone de geste du système,
  `env(safe-area-inset-bottom)`), quatre ou cinq actions principales :
  **Construire** (ouvre l'écran Plans / le menu de pose), **Village**, **Œuf**, **Défense**
  (avec le compte à rebours de vague), **Menu**.
- **Menu** (tiroir qui monte du bas, ou liste déroulante sous le bouton) : chaque entrée avec
  son **icône et son nom** et ses pastilles (non lus, points) : Univers, Chat, Objectifs,
  Chemins, Logistique, Niveaux, Boussole, Son, Réglages. Groupes : « Colonie », « Carte »,
  « Social », « Réglages ».
- **Ressources** en haut, sur une ligne compacte (touche pour le détail) ; l'horloge et la
  saison à côté.
- La file de construction et l'alerte de vague (repliables depuis le chantier 20) se rangent
  au-dessus de la barre, jamais sous le pouce de la caméra.
- **Paysage** : la barre passe à la verticale sur le bord droit (le pouce droit), le menu
  s'ouvre en panneau latéral.
- **Desktop** inchangé (ou seulement aligné sur les mêmes groupes et noms).

### Fluidité

- Cibles tactiles de 44 px minimum, retours visuels immédiats (état pressé) sans attendre le
  rendu.
- Le menu s'ouvre sans recalcul lourd (pas de rendu des écrans cachés, animation en
  `transform`/`opacity`).
- Revoir les écrans qui empilent trop d'informations sur un téléphone (fiche de tuile, fiche de
  kiwi) : sections repliables, actions principales en bas.

## Impact technique

- Client seulement : `TopBar.tsx`, `App.tsx`, `PathTools.tsx`, `Compass.tsx`,
  `BuildingTree.tsx`, `EggButton`, un nouveau `MobileNav.tsx`, `ui/styles.css` (simplifier les
  décalages à la main), i18n FR + EN (noms des entrées).
- Le tutoriel et les flèches qui pointent vers des boutons (objectifs) doivent viser les
  nouveaux emplacements : vérifier chaque étape du tutoriel sur téléphone.

## Découpage proposé

1. Maquette en capture (portrait et paysage) soumise au porteur avant de coder le reste.
2. Barre du pouce + menu nommé en portrait.
3. Paysage, intermédiaire, rangement de la file et des alertes.
4. Tutoriel, écrans chargés (fiches), captures sur plusieurs tailles (iPhone SE, iPhone 15,
   Android paysage), docs, skill `kiwar-client`.

## Critères d'acceptation

- Toutes les fonctions restent accessibles en deux touches au plus.
- Construire, Village et Œuf sont atteignables au pouce d'une main.
- Aucun bouton ne recouvre une partie de la carte qu'on touche souvent.
- Le tutoriel se termine sur téléphone sans bloquer.

## Questions ouvertes

1. Quelles actions dans la barre du pouce : Construire, Village, Œuf, Défense, Menu (proposé) ?
   Ou Expéditions à la place de Défense ?
2. Menu : tiroir qui monte du bas (proposé, plus facile au pouce) ou liste déroulante en haut à
   droite (comme demandé au départ) ?
3. Desktop : garder la colonne actuelle, ou prendre les mêmes groupes nommés ?
