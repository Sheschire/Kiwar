# Kiwar — Prompt de démarrage pour Claude Code

> Ce document est à la fois le brief du projet et ta mission pour le Jalon 1.
> Conserve-le dans le dépôt sous `docs/GAME_DESIGN.md` et relis-le avant chaque grande décision.

---

## 0. Ta mission

Tu vas créer **Kiwar**, un jeu de gestion cozy en 3D isométrique jouable dans le navigateur (desktop + mobile).

**Pour ce premier lancement, tu réalises uniquement le Jalon 1** (section 7), mais en posant une architecture qui ne bloque aucun des jalons suivants (section 8).

Façon de travailler :
1. **Commence par me proposer un plan** : arborescence du monorepo, choix de librairies justifiés, découpage du Jalon 1 en étapes livrables. Attends ma validation avant de coder.
2. Avance **par petites étapes jouables**, avec un commit Git clair à chaque étape.
3. Après chaque étape : `typecheck`, `lint` et tests doivent passer. Dis-moi ce que je dois regarder dans le navigateur pour valider.
4. Si une décision de design n'est pas couverte ici, **pose-moi la question** plutôt que d'inventer en silence. Pour les petits détails, choisis le défaut raisonnable et note-le dans `docs/DECISIONS.md`.
5. Je suis développeur, sur Mac, avec Node, pnpm/npm et Git installés. Rédige un `README.md` clair (installation, scripts, architecture, crédits des assets).

---

## 1. Vision

**Kiwar** (Kiwi War) : des **oiseaux kiwis** (oui, les oiseaux de Nouvelle-Zélande) vivent sur une **planète-kiwi coupée en deux**. Les deux faces de la coupe sont deux mondes plats et ronds :
- **Kiwisu** (Kiwi Sud)
- **Kiwino** (Kiwi Nord)

Le joueur démarre sur une face, récolte littéralement la planète, développe sa civilisation (bâtiments, recherche, unités, récolte) et finit par envoyer des expéditions vers l'autre face, défendue par des extraterrestres agressifs ou par un autre joueur.

### Piliers de design
1. **Cozy et mignon.** Pas de jeu hardcore façon Age of Empires. C'est de la gestion de civilisation où l'on améliore, optimise et planifie.
2. **Sessions courtes, progression longue.** Façon Ogame : jouable au bureau en quelques minutes, plusieurs fois par jour. Beaucoup d'actions au début pour accrocher, puis des **cooldowns de plus en plus longs**. Le jeu avance même quand on est déconnecté.
3. **Les décisions sont récompensées.** Choix d'emplacements, ordre de construction, spécialisation de sa face.
4. **Viral.** On rejoint la partie d'un collègue en un clic sur un lien, et on joue en équipe ou les uns contre les autres.
5. **La sensation de récolter un kiwi.** Ressources, tuiles et bâtiments sont tous thématiques.

### Inspiration visuelle
Builder d'île hexagonale cozy en low-poly :
- tuiles hexagonales **épaisses** dont on voit la tranche de terre et de roche ;
- écume animée sur les bords, eau brillante avec reflets de soleil ;
- lumière chaude, ombres douces, légère profondeur de champ (effet maquette ou tilt-shift) ;
- UI « parchemin » : typo serif, cartes illustrées, panneau d'objectifs.

---

## 2. Monde et carte

### Structure d'un univers
- Une **planète-kiwi** = 2 faces (Kiwisu + Kiwino).
- **1 joueur** : il choisit Kiwisu ou Kiwino, et l'autre face est tenue par les extraterrestres.
- **2 joueurs** : un joueur par face.
- **3 joueurs et plus** : l'univers contient plusieurs kiwis (paires Kiwisu/Kiwino), un joueur par face. Une face sans joueur est tenue par les extraterrestres.
- Chaque face est **générée procéduralement** à partir d'une graine (seed). Kiwisu et Kiwino ont des **conditions différentes**, par exemple des biais de ressources, de relief ou de climat, mais doivent rester **équilibrées** (voir section 6, outil d'équilibrage).

### Une face = un disque de tuiles hexagonales
Grille hexagonale en coordonnées axiales/cubiques, découpée en **disque**, avec possibilité de déformer légèrement en ellipse. La disposition reprend **l'anatomie d'une tranche de kiwi** :

| Zone | Position | Rôle (proposition, à affiner) |
|---|---|---|
| **Cœur** (columelle blanche) | centre | Emplacement du Nid-capitale |
| **Rayons** | lignes blanches qui partent du cœur | Sentiers, bonus de déplacement des villageois |
| **Anneau de graines** | couronne intermédiaire | Gisements de **graines** (ressource rare, équivalent minerai) |
| **Chair** (pulpe verte) | majorité de la surface | Prairies de **pulpe** (nourriture) |
| **Bosquets de duvet** | près du bord | « Forêts » de poils de kiwi : **fibre** (équivalent bois) |
| **Poches de jus** | dispersées | Mares de **jus** (énergie/eau), avec le shader d'eau |
| **Peau** | bord du disque | Falaises brunes poilues, non constructibles, qui ferment le monde |

Les noms de tuiles et de ressources sont des propositions. Garde-les centralisés dans les données et les fichiers de traduction pour pouvoir les changer facilement.

Le disque flotte dans un ciel cosmique pastel. Fais-moi une proposition visuelle pour l'environnement autour du disque (vide étoilé doux, mer de jus, nuages…).

### Habitants
- **Joueurs** : des oiseaux kiwis, ronds, à long bec, qui se dandinent.
- **Créatures et PNJ** : des créatures-fruits/kiwi, à concevoir plus tard.
- **Ennemis** : des extraterrestres agressifs qui déciment les premiers colons lors des expéditions vers l'autre face. Il faut donc une économie stable pour envoyer plusieurs voyages.

---

## 3. Boucle de jeu (vision complète)

- **Ressources** : pulpe, fibre, graines, jus (liste extensible).
- **Bâtiments** avec niveaux d'amélioration. Coûts et durées croissent selon des courbes data-driven.
- **Villageois autonomes.** On ne fait pas de micro-gestion d'unités : le joueur donne des ordres de haut niveau (construire, améliorer, affecter à une production) et les kiwis s'en chargent visuellement.
- **Éclosion** : la population grandit en faisant éclore des œufs (avec cooldown), plafonnée par le logement.
- **Recherche** : arbre technologique qui débloque bâtiments, bonus et, à terme, les expéditions vers l'autre face.
- **Objectifs et tutoriel** : panneau de quêtes guidées, comme dans l'inspiration visuelle.
- **Expéditions et combats** (jalons ultérieurs) : on envoie une expédition, elle voyage X temps, puis le combat se **résout automatiquement si le joueur est absent**. **S'il est présent, il peut intervenir** (décisions tactiques légères), avec un replay animé mignon.
- **Saisons** de quelques semaines, avec **récompenses de fin de saison**.
- **Plus tard** : héros personnalisables, cosmétiques. L'architecture doit les permettre sans refonte.

---

## 4. Stack technique

| Couche | Choix |
|---|---|
| Langage | **TypeScript** strict partout |
| Monorepo | **pnpm workspaces** |
| Rendu 3D | **Three.js** en vanilla, sans React Three Fiber, pour garder le contrôle des performances |
| Post-processing | `postprocessing` (pmndrs) ou équivalent : AO (N8AO/SSAO), bloom léger, profondeur de champ/tilt-shift, tone mapping, color grading |
| UI / HUD | Overlay HTML/CSS au-dessus du canvas, avec **React** (ou Preact) et un store léger (Zustand ou équivalent). Pas d'UI dessinée dans WebGL. |
| Build | **Vite** |
| Tests | **Vitest** |
| i18n | **FR + EN dès le départ**, détection de la langue du navigateur, sélecteur dans l'UI, aucun texte en dur |
| Mobile | PWA installable, contrôles tactiles, presets de qualité graphique avec détection automatique |
| Backend (Jalon 2+) | **Supabase** (Postgres, Auth, Realtime, Edge Functions). Pas dans le Jalon 1. |

Code, identifiants et commentaires en **anglais**. Textes du jeu en FR/EN via l'i18n.

---

## 5. Architecture : règles non négociables

### 5.1 Séparation simulation / rendu
```
packages/shared   → règles du jeu, données, simulation, génération procédurale (TS pur, zéro dépendance DOM/Three)
apps/client       → rendu Three.js + UI React, qui LIT l'état et ENVOIE des commandes
tools/balance     → simulations headless pour l'équilibrage (CLI)
(plus tard) supabase/ ou apps/server → autorité serveur
```
- `shared` ne connaît ni Three.js, ni le DOM, ni le réseau.
- Le client ne modifie **jamais** l'état directement. Il émet des **commandes** (`BuildCommand`, `UpgradeCommand`, `AssignWorkersCommand`…) validées par les règles de `shared`. Au Jalon 2, ces mêmes commandes partiront vers le serveur, qui fera autorité.

### 5.2 Simulation basée sur le temps (modèle Ogame)
- L'état stocke des **horodatages**, pas des ticks : « construction de la Cueillerie niv. 2 démarrée à T0, durée D ».
- Une fonction pure `advance(state, now): state` calcule tout ce qui s'est passé jusqu'à `now` (constructions terminées, ressources produites, éclosions), y compris après des heures d'absence.
- **Déterminisme** : aucun `Math.random()` ni `Date.now()` dans `shared`. Le hasard passe par un **RNG à graine injecté** et le temps par une **horloge injectée**.
- La 3D est une **visualisation** de cet état. Les kiwis qui marchent vers un bosquet représentent une affectation de travail : leurs positions sont cosmétiques et ne font pas partie de l'état de jeu.

### 5.3 Contenu data-driven
Tuiles, ressources, bâtiments, niveaux, coûts, durées et recherches sont définis dans des **fichiers de données typés** dans `shared`, pas dispersés dans le code. Changer un équilibrage = changer une donnée.

### 5.4 Prévoir sans implémenter
Les types doivent déjà prévoir : `playerId`, `universeId`, `kiwiId`, `face: 'kiwisu' | 'kiwino'`, `seasonId`. On n'implémente pas le multijoueur au Jalon 1, mais on ne le rend pas impossible.

---

## 6. Génération procédurale et équilibrage

- `generateFace(seed, face, params)` produit une face complète (tuiles, zones, gisements), de façon **déterministe**.
- Kiwisu et Kiwino appliquent des **profils de biais** différents (par exemple Kiwisu plus riche en pulpe et en bosquets, Kiwino plus riche en graines et en jus). Les profils sont définis en données.
- **Outil d'équilibrage** (`tools/balance`), en CLI :
  - génère N faces par type (ex. 200 seeds) ;
  - fait jouer une stratégie bot simple et raisonnable, en headless, grâce à `advance()` ;
  - mesure le temps pour atteindre des jalons (pop 10, tous les bâtiments niv. 3, première recherche…) ;
  - sort un rapport comparatif Kiwisu vs Kiwino et **signale les écarts supérieurs à un seuil configurable** (par défaut ±10 %).
- Au Jalon 1, une version simple de cet outil suffit, mais elle doit fonctionner.

---

## 7. Jalon 1 : le périmètre à livrer maintenant

**Objectif : naviguer en 3D sur ma face de kiwi, et jouer les premières actions de gestion. Le tout sans serveur, beau et fluide sur desktop comme sur mobile.**

### 7.1 Rendu et direction artistique
- [ ] Une face (Kiwisu par défaut, seed aléatoire ou fixée via l'URL `?seed=…&face=kiwino`) rendue en disque de tuiles hex épaisses, selon l'anatomie de la section 2.
- [ ] Chaque type de tuile est lisible au premier coup d'œil : couleur, relief, props (brins de duvet, graines noires brillantes, mares de jus…).
- [ ] Falaises de peau poilue sur le bord.
- [ ] Shader de jus/eau animé avec reflets, et écume là où c'est pertinent.
- [ ] Lumière directionnelle chaude, ombres douces, lumière d'ambiance colorée, post-processing (AO, bloom léger, tilt-shift, tone mapping).
- [ ] Instanciation GPU pour la végétation et les props répétés.
- [ ] Presets de qualité Bas / Moyen / Haut, avec un preset automatique selon l'appareil. Objectif : 60 fps sur un MacBook et jouable (30 fps ou plus) sur un smartphone récent.
- [ ] Assets : **procéduraux d'abord** (géométries générées par le code). Les packs **CC0** (KayKit, Kenney…) sont autorisés si ça améliore nettement le rendu. Vérifie les licences et crédite-les dans le README.

### 7.2 Caméra
- [ ] Vue isométrique/perspective inclinée, avec orbite autour du disque, pan, zoom (bornés) et rotation par paliers.
- [ ] Desktop : molette pour zoomer, clic droit glissé pour orbiter, clic milieu ou Maj + clic droit pour panoramiquer, WASD pour se déplacer, Q/E pour tourner.
- [ ] Mobile : pincer pour zoomer, glisser à un doigt pour panoramiquer, glisser à deux doigts pour tourner.
- [ ] Mouvements amortis et agréables.

### 7.3 Gameplay minimal
- [ ] Départ : un **Nid** sur le cœur, **3 kiwis**, un petit stock de ressources.
- [ ] **4 ressources** : pulpe, fibre, graines, jus. Barre de ressources en haut avec stock / capacité.
- [ ] **5 ou 6 bâtiments**, par exemple :
  - Cueillerie (pulpe, sur la chair) ;
  - Atelier à fibre (sur les bosquets) ;
  - Carrière à graines (sur l'anneau) ;
  - Puits de jus (sur une mare) ;
  - Hutte (logement) ;
  - Entrepôt (capacité).

  Chacun a **3 niveaux**, avec coûts et durées croissants.
- [ ] Sélection d'une tuile par clic ou tap : info-bulle avec le type de tuile, ses rendements et les actions possibles.
- [ ] Construction et amélioration placées dans une **file avec durée**. Un kiwi se rend visuellement sur le chantier, et un échafaudage puis une animation de fin marquent la progression.
- [ ] **Villageois autonomes** : les kiwis affectés se dandinent entre le nid et leur lieu de travail, avec une animation simple (corps qui oscille, pattes, bec).
- [ ] **Éclosion** : bouton « faire éclore un œuf » (coût + cooldown), plafonné par les huttes.
- [ ] **Panneau d'objectifs** (tutoriel) : 5 à 10 objectifs enchaînés pour guider les premières minutes.
- [ ] **Rythme** : les premières actions prennent quelques secondes à une minute, puis les niveaux suivants s'allongent nettement. Les courbes sont définies en données.

### 7.4 Temps et persistance locale
- [ ] Sauvegarde automatique dans `localStorage` (état sérialisé + horodatage).
- [ ] Au rechargement, `advance(state, now)` applique la progression hors ligne. On doit pouvoir fermer l'onglet, revenir 10 minutes plus tard et voir ce qui s'est passé, avec un petit résumé « Pendant votre absence… ».
- [ ] **Panneau debug**, ouvert par une touche : multiplicateur de temps (×1, ×10, ×100), ajout de ressources, régénération avec une nouvelle seed, bascule Kiwisu/Kiwino, compteur de fps.

### 7.5 UI
- [ ] Style parchemin cozy, typo serif lisible, responsive mobile en portrait comme en paysage.
- [ ] Sélecteur FR/EN.
- [ ] Rien de bloquant au tactile : zones de tap d'au moins 44 px.

### 7.6 Qualité
- [ ] Tests Vitest sur `shared` : `advance()` (dont la progression hors ligne), validation des commandes, déterminisme de `generateFace` (même seed = même face).
- [ ] `tools/balance` exécutable via `pnpm balance`, qui produit un rapport lisible.
- [ ] Scripts `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`.
- [ ] `README.md`, `docs/GAME_DESIGN.md` (ce document) et `docs/DECISIONS.md`.

### Hors périmètre du Jalon 1
Backend, comptes, multijoueur, extraterrestres, combats, expéditions, recherche complète, saisons, héros, monétisation.

---

## 8. Jalons suivants (contexte, ne pas implémenter)

- **Jalon 2, backend** : Supabase, comptes avec **jeu immédiat en invité** puis conversion en compte (Google + lien magique). L'état est stocké côté serveur. Les commandes sont validées par le serveur, qui fait autorité et réutilise `shared`. Anti-triche de base.
- **Jalon 3, multijoueur** :
  - univers partagés rejoints par **lien d'invitation** ;
  - plusieurs kiwis par univers, une face par joueur ;
  - visite des faces des autres, chat d'équipe ;
  - expéditions avec temps de trajet, et combats auto-résolus avec intervention possible en direct ;
  - extraterrestres sur les faces libres.
- **Jalon 4, rétention** : saisons et récompenses, arbre de recherche complet, équilibrage à grande échelle avec `tools/balance`, notifications de fin de cooldown (PWA).
- **Plus tard** : héros, créatures-fruits PNJ, cosmétiques.

---

## 9. Ce que j'attends de ta première réponse

1. Tes questions éventuelles sur ce brief.
2. Le plan : arborescence, librairies choisies (avec une phrase de justification chacune), découpage du Jalon 1 en 5 à 8 étapes jouables.
3. Les risques techniques que tu identifies (perf mobile, rendu de l'eau, lisibilité des tuiles…) et comment tu comptes les traiter.

Ensuite, attends mon feu vert avant de coder.
