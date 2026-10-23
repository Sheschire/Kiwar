# Chantier 32 — Correctifs et ciel

> **Fait** (octobre 2026, six commits « Chantier 32 (part 1–6) »). Ce qui a été fait et ce qui
> reste : en bas du document.

Acte I « Le rythme » du [carnet de route](../CARNET_DE_ROUTE.md). **Client seul** : peut tourner
en parallèle des chantiers 30 et 31.

**Skills à charger** : `kiwar-client`, `kiwar-world` (caméra, espace, intro), `kiwar-sky`
(comètes).

## Intention du porteur (retours d'octobre 2026)

- « Caméra bloquée en axe y si on part trop loin, obligé de rezoomer pour pouvoir incliner à
  nouveau ; caméra pas si libre, compliquée à utiliser. »
- « Chargement looong au refresh. »
- « Card expédition par-dessus la pile de travaux. » « Pop-up quêtes/objectifs qui s'ouvre à
  chaque fois. »
- « Plus d'attente après avoir slice la face du kiwi dans l'intro pour contempler la surface
  kiwi réaliste, puis révélation comme actuellement. »
- « Recherches des âges non débloqués affichées ??? jusqu'à les déverrouiller. »
- « Les comètes dans l'espace suivent la caméra, ce n'est pas bon : ce doivent être des objets
  3D dans l'espace qu'on peut observer avec la caméra libre, comme les planètes. » « Ciel du
  monde : cosmos étoilé. »
- « Revoir l'esthétique des chemins. » « Visuels des champs de graines très moches. »

## Décisions déjà prises

- Tourelles et chauves-souris : redessinées aux chantiers 33 (tourelles) et 34 (créatures), pas
  ici.
- Le panneau d'objectifs sera refait au chantier 31 ; ici on corrige seulement sa réouverture.

## État actuel et pistes (chemins sous `apps/client/src/`)

| Sujet               | Où                                                                                      | Cause probable                                                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inclinaison bloquée | `camera/CameraRig.ts:399-411` (`updateLift`), `SPACE_POLAR` 1,42 (:39-52)               | l'inclinaison est forcée vers `liftPolar(k)` et `maxPolarAngle = lift + 0,04` : au zoom lointain il reste ~0,04 rad de liberté                                                                                             |
| Chargement          | `game/GameController.ts:210-217` et :614-624, `startGame.tsx:420-439`                   | en ligne : import du backend, `init`, `loadFromServer`, `importLocalSaveOnce`, `offerGuestTransfer` attendus l'un après l'autre ; l'état en cache ne sert qu'en cas d'échec ; en local, `loadLocal` rejoue toute l'absence |
| Carte d'expédition  | `ui/styles.css:1329-1332` et `.queue` (:935)                                            | `.expeditions` est fixée à `bottom: … + 150px` : une file plus haute (chantiers en parallèle) passe dessous                                                                                                                |
| Pop-up d'objectifs  | `ui/store.ts:223`                                                                       | `objectivesOpen: wideScreen` n'est pas mémorisé, contrairement à `queueOpen` / `threatOpen` (`loadFlag` :225-226, `setPanelOpen` :203)                                                                                     |
| Intro               | `render/intro.ts`, `render/introFx.ts`, `ui/intro.ts` (chantier 22)                     | la révélation suit la découpe sans pause                                                                                                                                                                                   |
| Recherches futures  | `ui/components/ResearchModal.tsx:191-198`, `.is-later` (`ui/styles.css:3322`)           | tous les âges et leurs technologies sont listés                                                                                                                                                                            |
| Comètes             | `render/comets.ts:275-311` (`updateComet`, `place`)                                     | position recalculée chaque image depuis l'écran, à la distance de la caméra : voulu au chantier 13 (« toujours visible »)                                                                                                  |
| Ciel                | `render/environment.ts`, `render/space.ts`, `render/dayCycle.ts`                        | ciel pastel ; la vue espace du chantier 24 existe                                                                                                                                                                          |
| Chemins             | `render/paths.ts:59-62` (styles par âge), `segmentGeometry` :106                        | segments fusionnés et instanciés, look de « tube »                                                                                                                                                                         |
| Champs de graines   | `render/crops.ts:108` (pièce `seed`, une petite sphère), mise en page `'seedRing'` :410 | deux sillons sombres avec des billes                                                                                                                                                                                       |

## Proposition

1. **Caméra** : l'inclinaison reste libre dans une plage confortable à tous les zooms ; la montée
   vers la vue espace (chantier 24) ne fixe qu'un minimum doux, sans verrouiller. Vérifier
   souris, pavé tactile, deux doigts, inertie (chantier 20), voyage entre planètes.
2. **Chargement** :
   - mesurer d'abord (temps par étape avec `?debug`) ;
   - puis afficher tout de suite l'état en cache (lecture seule) pendant la synchronisation ;
   - paralléliser ce qui peut l'être et reporter `offerGuestTransfer` et l'import après
     l'affichage ;
   - en local, vérifier le coût de `loadLocal` après une longue absence ; si c'est lui, afficher
     d'abord, puis avancer.
3. **Petits correctifs d'interface** :
   - la carte d'expédition et la file dans une même colonne (flex), sans position fixe calculée ;
   - `objectivesOpen` mémorisé comme les autres panneaux ;
   - les technologies d'un âge non atteint en « ??? » (nom, effet et coût masqués). Seule la
     technologie de passage de l'âge suivant reste lisible, comme but.
4. **Intro** : après la découpe, ~2–3 s de contemplation de la surface (lente dérive de caméra,
   lumière rasante), puis la révélation actuelle. « Passer » reste possible.
5. **Cosmos étoilé** : un fond d'étoiles et de nébuleuses douces autour de la face, de jour comme
   de nuit (plus dense la nuit). Il est instancié, s'intègre au limiteur d'images
   (`render/frameLimiter.ts`) et reste cohérent avec la vue espace.
6. **Comètes en 3D** : la comète suit une trajectoire dans le repère de l'espace
   (`render/space.ts`). Elle se voit quand on la regarde, avec une flèche au bord de l'écran
   quand elle est hors champ pendant son passage. Le calendrier (skill `kiwar-sky`) ne change
   pas.
7. **Chemins et champs** :
   - des chemins posés dans le terrain (pierres plates, terre tassée, bordures irrégulières,
     selon l'âge), sans relief de tube ;
   - des champs de graines en rangs de pousses et de cosses, de taille et d'orientation
     variées.
     Garder l'instanciation.

## Découpage proposé

1. Caméra.
2. Chargement (mesure, puis affichage immédiat).
3. Carte et file, pop-up d'objectifs, recherches « ??? ».
4. Intro contemplative et cosmos étoilé.
5. Comètes en 3D.
6. Chemins et champs de graines, captures, docs (`kiwar-client`, `kiwar-world`, `kiwar-sky`),
   `PLAN.md`.

## Critères d'acceptation

- On incline la caméra à tout zoom sans devoir rezoomer.
- Le chargement après un rafraîchissement montre la colonie vite : mesure avant/après dans le
  document.
- La carte d'expédition ne recouvre jamais la file. Le panneau d'objectifs garde son état.
- Les âges futurs sont en « ??? ».
- La comète reste à sa place dans l'espace quand on tourne la caméra.
- Captures desktop + téléphone : ciel, chemins, champs ; images/s au repos inchangées.

## Fait

1. **Caméra** (`camera/CameraRig.ts`) : la montée vers la vue espace est un **décalage**
   ajouté à l'inclinaison quand le zoom change (`liftOffset`), plus un plancher ; plage
   `polarRange(k)` = `MIN_POLAR` … min(1,5, `MAX_POLAR` + montée). On incline à tout zoom
   (vérifié : au zoom maximal, de 1,42 à 0,44 au clic droit, puis retour au zoom proche).
2. **Chargement** : `game/bootTimes.ts` (ligne « Chargement » du panneau `?debug`, console
   avec `?debug`). Mesures headless, build de production, colonie de 72 h :
   - local : script ≈ 250 ms, colonie prête ≈ 0,7–1 s, puis **3–4 s de liaison des shaders**
     avant la première image (rendu logiciel, 39 programmes) ; une absence de 48 h coûte
     0,3 s d'`advance` ;
   - en ligne (serveur simulé, +400 ms par requête) : **avant** la colonie s'affichait
     ≈ 1,7 s après le script (import du backend, connexion, `load`) ; **après** la colonie en
     cache s'affiche ≈ 0,36 s après le script, en lecture seule (`errors.syncing`), et
     l'import d'une sauvegarde locale et le transfert d'invité passent après l'affichage ;
   - `compileAsync` avant la première image là où `KHR_parallel_shader_compile` existe (vrais
     GPU) ; le loader attend la première image dessinée ; `checkShaderErrors` seulement en
     développement.
3. **Interface** : `.left-stack` (expéditions au-dessus de la file, une seule colonne) ;
   `setPanelOpen('objectives')` mémorisé ; âges futurs en petites tuiles « ??? » avec le
   nombre de technologies à découvrir.
4. **Intro** : 2,6 s de contemplation de la chair (caméra qui s'approche et glisse sur grand
   écran, lumière rasante `sheen` du `FleshVeil`), puis la fonte d'avant. **Cosmos**
   (`render/cosmos.ts`) : 5000 étoiles colorées (un `Points`), six nébuleuses, à l'infini
   comme le ciel ; peu d'étoiles de jour, toutes la nuit ; nébuleuses coupées en qualité basse.
5. **Comètes** : `cometPath` dans `render/space.ts` (arc de 140° à 340 unités, hauteur
   20–46) ; queue orientée le long du vol ; flèche `CometArrow` au bord de l'écran
   (`edgeArrow`), un toucher tourne la caméra vers elle (`lookToward`).
6. **Chemins** posés dans le sol (ruban plat, bords irréguliers, liseré sombre, détails plats
   par âge, carrefours en galettes) et **champs de graines** en buttes avec tiges et cosses
   variées. Coût : +6 % de triangles, +2 appels de dessin sur la colonie de 72 h.

## Reste

- Mesurer le chargement sur le MacBook et un vrai téléphone (`?debug`) : ce que
  `compileAsync` gagne avec un vrai GPU (voir `DETTE.md`).
- De jour, le cosmos reste discret sur le ciel pastel ; à renforcer si le porteur le souhaite.
- Les images/s au repos n'ont pas pu être mesurées sur un vrai GPU (le cosmos ajoute 7 appels
  de dessin, les nébuleuses sont coupées en qualité basse).
