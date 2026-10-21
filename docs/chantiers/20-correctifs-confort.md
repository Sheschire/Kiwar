# Chantier 20 — Correctifs et confort

Retours de partie de fin octobre 2026 : un bug bloquant et une série de petits irritants
d'interface. **Client seulement** : peut tourner en parallèle du chantier 19 (colonisation) et
des chantiers 22 et 23. À lancer **en premier**.

## Intention du porteur

- « Parfois je dois **recharger la page** car je ne peux plus afficher l'écran de construction
  en cliquant sur une tuile. Cela arrive régulièrement. »
- Fiche d'un kiwi : des **boutons pour changer de kiwi collés en haut de la page**, pour ne pas
  avoir à remonter pour changer.
- **Trier les kiwis par stats.**
- **Pouvoir replier** la file de construction et les alertes de vague (toggle).
- **Barre de progression** de la formation à l'École.
- « **Bruit de nuit trop chiant** : réduire la fréquence des bruits de criquet. »
- Au **survol** d'un bâtiment, afficher la **zone concernée**.
- « La **surbrillance de la zone à poser** n'est pas assez visible par rapport à la surbrillance
  des cases éligibles. »
- « Pas d'**inertie caméra sur mobile** ? Je dois fastidieusement scroller pour me déplacer. »

## État actuel (code)

Chemins sous `apps/client/src/`.

- **Tap qui ne marche plus** (cause probable trouvée) : `render/picking.ts` (`TapDetector`)
  compte les pointeurs actifs (`activePointers`, lignes ~40-44 et 64). Il monte à chaque
  `pointerdown` et ne descend qu'à `pointerup`/`pointercancel` **reçus par le canvas**. Rien ne
  capture le pointeur et `pointerleave` ne décrémente pas. On appuie sur le canvas, on glisse
  sur un panneau de l'interface, on relâche : le compteur reste à 1. Ensuite chaque appui le
  met à 2, `down = null`, et **plus aucun tap ne part** jusqu'au rechargement. Même chose sur
  téléphone si un `pointerup` se perd (notification, geste système).
  Autres conditions à vérifier (`GameRenderer.ts` ~231-250, `startGame.tsx` ~56-60) :
  `painter.enabled` ou `this.intro` restés vrais, `visiting` non remis à zéro, `placing` resté
  non nul (le tap pose au lieu de sélectionner, et `.path-mode .sheet { display:none }` cache la
  fiche), et un kiwi dessiné à moins de 30 px qui ouvre le Village au lieu du menu.
- **Navigation entre kiwis** : `ui/components/VillageModal.tsx`, `SheetNavigator` (~656-712).
  La barre ◀ index/total ▶ est en haut de la fiche mais **défile avec elle** : sur une longue
  fiche, il faut remonter. Glisser horizontalement change aussi de kiwi sur téléphone.
- **Tri** : `sortedKiwis` (~45-56) ne propose que niveau, nom, métier, naissance. Choix gardé
  dans `uiStore.villageSort`. Les six stats : force, agilité, endurance, esprit, dextérité,
  charisme (`packages/shared/src/data/kiwis.ts`).
- **File de construction** : `ui/components/QueuePanel.tsx` (~138-177), toujours dépliée.
  **Alerte de vague** : `ThreatBadge` dans `ui/components/DefenseModal.tsx`, dans
  `.badge-stack`, ne se replie pas. Modèle à suivre : `ObjectivesPanel` et `objectivesOpen`.
- **Formation** : `Villager.job = {kind:'train', schoolId, classId, until, paid}` ; seul `until`
  est stocké. Affichage texte seulement (« encore 2 h ») dans `VillageModal.tsx` (~239-246) et
  `TilePanel.tsx` `SchoolInfo` (~495-527). La durée totale vient de `trainingDuration`.
- **Grillons** : `audio/synth.ts` (~51-75) : trois voix, trilles de 0,18-0,38 s séparées de
  0,55-1,45 s seulement ; préréglage `night` (~666-683) en boucle de 8 s ; volume 0,6 dans
  `audio/catalog.ts` (`ambience.night`).
- **Zone au survol** : `refreshCatchment` (`GameRenderer.ts` ~795-816) ne suit que
  `selectedTile` ; seul un placement de tourelle montre une portée au survol.
- **Surbrillance de pose** (`render/selection.ts`) : tuiles éligibles en `#ffe27a` à 0,45
  (pulsation 0,35-0,55) ; zone prévue sous le fantôme `#8df06e` à 0,5 (0,42-0,62). Les deux ont
  presque la même force : la zone visée ne ressort pas.
- **Inertie** : elle existe (`camera/inertia.ts`, `Glide`, `CameraRig.ts` ~316-363) pour le
  glisser à un doigt, mais elle ne part pas si le doigt s'est arrêté plus de 60 ms, ou si la
  vitesse est sous 0,6, et elle s'éteint vite (τ = 0,28 s : 12 % de la vitesse après 0,6 s). Le
  porteur ne la sent pas. Jamais testée sur un vrai téléphone (dette du chantier 10).

## Proposition

### Tap fiable (priorité 1)

- Compter les pointeurs par `pointerId` (un `Set`), retirés sur `pointerup`, `pointercancel`,
  `lostpointercapture` et, pour la souris, `pointerleave` sans bouton enfoncé ; ou
  `setPointerCapture` au `pointerdown`. Vider le `Set` sur `blur` et `visibilitychange`.
- Garde-fou : si aucun bouton n'est enfoncé (`event.buttons === 0`) au `pointerdown` suivant,
  repartir d'un compteur propre.
- Sur téléphone : un bouton « Annuler » toujours visible pendant `placing` et `pathMode` (pas de
  touche Échap), et sortie automatique de ces modes quand on ouvre un autre écran.
- Test unitaire du `TapDetector` (appui, sortie du canvas, relâche dehors, nouvel appui → tap).

### Petits conforts

- **Barre de navigation collante** (`position: sticky; top: 0`) dans la fiche : ◀ ▶, le nom et
  la classe du kiwi restent visibles en défilant.
- **Tri par stat** : un sélecteur « Trier par » avec les six stats (décroissant), en plus des
  tris actuels ; la valeur de la stat triée s'affiche en badge sur chaque ligne.
- **Replier la file et les alertes** : un chevron sur chaque panneau ; replié, il reste une
  pastille (nombre de chantiers et le temps restant du premier ; icône de vague et le compte à
  rebours). Choix mémorisé (`uiStore`, persistant comme `objectivesOpen`). Une vague qui passe à
  moins d'une heure redéplie l'alerte une fois.
- **Barre de formation** : `(now − (until − trainingDuration)) / trainingDuration`, dans la
  fiche du kiwi, la fiche de l'École et la liste du Village (petite barre sous le nom).
- **Grillons** : silence entre deux trilles de 3 à 8 s, deux voix au lieu de trois, volume
  0,35 ; le chœur s'éteint après le premier tiers de la nuit (fondu). À régler à l'oreille avec
  le porteur (valeurs remplaçables depuis `/admin`).
- **Zone au survol** (desktop) : survoler un bâtiment montre sa zone (récolte, portée de
  tourelle, lits d'une hutte) avec la couche de sélection, plus pâle ; sur téléphone, le premier
  tap la montre déjà (sélection).
- **Surbrillance de pose** : tuiles éligibles plus discrètes (0,22, sans pulsation) ; tuiles de
  la zone visée franches (0,75, pulsation, liseré blanc) ; la tuile du fantôme encore au-dessus.
  Vérifier en plein jour, au crépuscule et la nuit.
- **Inertie** : départ si le doigt bougeait dans les 120 dernières ms, seuil 0,3, τ 0,6 s,
  vitesse plafond plus haute ; aussi pour la rotation à deux doigts ; essai sur un vrai
  téléphone (le porteur) avec une capture vidéo.

## Impact technique

- Client seulement : `render/picking.ts`, `GameRenderer.ts`, `startGame.tsx`,
  `VillageModal.tsx`, `TilePanel.tsx`, `QueuePanel.tsx`, `DefenseModal.tsx`, `uiStore`,
  `render/selection.ts`, `camera/inertia.ts`, `audio/synth.ts`, `audio/catalog.ts`,
  `ui/styles.css`, i18n FR + EN.
- Aucun changement de la simulation ni de la base.
- Le chantier 21 (interface mobile) repasse ensuite sur `styles.css` : finir celui-ci avant.

## Découpage proposé

1. **Tap fiable** + bouton Annuler sur téléphone + test (pousser tout de suite, c'est le bug).
2. Fiche : navigation collante, tri par stat, barre de formation.
3. File et alertes repliables.
4. Zone au survol et surbrillance de pose.
5. Inertie mobile et grillons ; captures desktop + téléphone, docs, skill `kiwar-client`.

## Critères d'acceptation

- Appuyer sur la carte, relâcher sur un panneau, puis taper une tuile ouvre bien le menu (test
  automatique + essai manuel desktop et téléphone).
- On change de kiwi sans remonter, on trie par Dextérité.
- File et alerte se replient et le restent après un rechargement.
- On distingue d'un coup d'œil la zone visée des tuiles éligibles.
- Un lancer du doigt traverse la planète sur téléphone.

## Questions ouvertes

1. Les grillons : les garder plus rares, ou les remplacer par une autre ambiance de nuit (vent,
   chouette lointaine) ?
2. Repliées, la file et l'alerte gardent-elles une pastille (proposé), ou disparaissent-elles
   complètement ?
3. Le tri par stat : décroissant seulement, ou bascule croissant/décroissant ?
