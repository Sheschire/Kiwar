# Chantier 34 — Kiwis et créatures vivants

Acte I « Le rythme » du [carnet de route](../CARNET_DE_ROUTE.md). **Client seul** : en parallèle
possible des chantiers 30, 31 et 33. Prépare les animations et les effets du moteur de bataille
(chantier 36) et de la vie du village (chantiers 43 et 44).

**Skills à charger** : `kiwar-client`, `kiwar-tasks` (qui fait quoi), `kiwar-threats` (furets et
chauves-souris).

## Intention du porteur

« Les kiwis qui font des recherches, par exemple, doivent rester visibles et actifs autour du
centre de recherche, et pareil pour ceux de l'École. C'est important pour l'aspect réaliste du
jeu qu'on les voie vivre et s'animer de façon organique dans l'espace. Actuellement ils ont tous
le comportement d'allers-retours avec le Nid, mais certaines tâches n'ont pas de sens avec ce
comportement. Il faut analyser les tâches qui mobilisent un kiwi sur place et les faire vivre
dans cet espace. »

## Décisions déjà prises

- Regarder la colonie vivre fait partie du plaisir (charte de `kiwar-design`, point 9).
- Les animations restent cosmétiques : la simulation ne connaît pas les positions (règle de
  `kiwar-sim`).
- Impacts « mignons » en combat : plumes et étoiles, pas de sang.

## État actuel (chemins sous `apps/client/src/render/`)

`kiwis.ts` (989 lignes) donne un comportement par métier :

| Métier                                                | Ce qu'on voit aujourd'hui                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `work` (producteurs **et chercheur·euses**), `meteor` | allers-retours : marche jusqu'à la tuile, coups de bec 3,5–7 s, dépôt au plus proche (`nearestDepotOf`) avec « +x » (`kiwis.ts:689-721`). La Bibliothèque n'a pas de tuile de récolte (`packages/shared/src/sim/territory.ts:180-183`) : **les chercheur·euses font la navette les mains vides** |
| `build`, `train` (École), `titan`, `stardust`         | marche une fois, puis « danse du marteau » sur place (`kiwis.ts:671-687, 877-879`)                                                                                                                                                                                                               |
| `guard`                                               | va près d'**une tourelle au hasard** et reste immobile (`kiwis.ts:725-763`)                                                                                                                                                                                                                      |
| `transform`                                           | entre dans le labo et disparaît (`kiwis.ts:658-669`)                                                                                                                                                                                                                                             |
| repos, abri, blessé·e                                 | cachés dans leur lit ou le Nid (`thinkRest`, `kiwis.ts:587-629`)                                                                                                                                                                                                                                 |
| inactif·ve                                            | flâne autour du Nid (`kiwis.ts:738-750`)                                                                                                                                                                                                                                                         |
| `outpost`                                             | **bug** : dessiné·es en train de flâner au Nid alors qu'iels sont sur la jumelle (`kiwis.ts:635-652, 796`)                                                                                                                                                                                       |

Autres repères :

- les furets et les chauves-souris sont des modèles procéduraux simples
  (`predators.ts:57-90`), et le spectacle des vagues (`predators.ts:94-96`) les fait courir et
  plonger ;
- `particles.ts` contient les émetteurs ;
- toute animation importante doit réveiller la boucle (`frameLimiter.ts`, `renderer.wake()`).

## Proposition

### Bibliothèque d'animations

- Un module `render/anim/` : poses procédurales (corps, tête, bec, ailes, pattes, objet tenu),
  extraits mélangeables et accessoires (livre, marteau, épée, bâton de mage, fronde, masse,
  panier).
- Les extraits :

  | Usage   | Extraits                                         |
  | ------- | ------------------------------------------------ |
  | Travail | coup de bec, marteau, lecture, écriture, assis·e |
  | Vie     | joie, danse, applaudir, manger                   |
  | Combat  | épée, sort (lueur), fronde, masse                |
  | États   | blessé·e, chute, se relever                      |

- Le coût reste compatible avec l'instanciation actuelle des kiwis : une mesure avec `?debug`
  et 60 kiwis à l'écran.

### Vivre sur place

Revue de chaque métier, avec le skill `kiwar-tasks` :

- **Bibliothèque** : les chercheur·euses ont des places autour du bâtiment (pupitres, piles de
  livres) : iels lisent, écrivent et vont parfois d'une étagère à l'autre. Pas de navette vers
  le dépôt.
- **École** : les élèves sont en demi-cercle face à un·e maître·sse, avec un accessoire selon la
  classe enseignée.
- **Gardes** : postés dans **leur secteur** (dette du chantier 12), avec une petite ronde entre
  les tourelles de ce secteur.
- **Réparations** : au pied du bâtiment abîmé, au marteau.
- **Inactif·ves** : de petites activités variées (picorer, s'étirer, discuter à deux) plutôt que
  de flâner.
- Le bug `outpost` est corrigé : ces kiwis ne sont pas dessiné·es chez nous.

### Créatures

- Les furets et les chauves-souris sont redessinés, plus expressifs, avec un look par âge alien
  à préparer (armes et armures au 38). Les animations à prévoir :
  - furets : courir, mordre, frapper, blessé, tomber ;
  - chauves-souris : battre des ailes, plonger, cracher, blessée, tomber.
- C'est prêt pour le moteur de bataille (36).

### Effets de base

- Feu, fumée, étincelles, impacts en plumes et étoiles : des émetteurs groupés dans
  `particles.ts`, réutilisés plus tard par les incendies et les sorts.

## Découpage proposé

1. Bibliothèque d'animations et accessoires, avec une planche de revue (`?kiwis`, comme
   `?sheet`).
2. Vivre sur place : Bibliothèque, École, gardes par secteur, réparations, inactif·ves ;
   correction du bug `outpost`.
3. Furets et chauves-souris redessinés et animés.
4. Effets de base (feu, fumée, étincelles, impacts).
5. Mesures, captures desktop + téléphone, docs (`kiwar-client`), `PLAN.md`, `DETTE.md`.

## Critères d'acceptation

- Autour d'une Bibliothèque qui travaille, on voit les chercheur·euses lire, sans navette à vide.
  Même chose pour les élèves de l'École.
- Les gardes restent dans leur secteur.
- Aucun kiwi en poste sur la jumelle n'est dessiné chez nous.
- La planche `?kiwis` montre tous les extraits et les créatures.
- Images/s inchangées à 10 % près.

## Fait (octobre 2026)

1. **Bibliothèque d'animations** (`apps/client/src/render/anim/`) : `pose.ts` (corps, tête,
   ailes, pattes, accessoire, lueur ; `blendPoses`), `clips.ts` (24 extraits : `idle`, `walk`,
   `sleep` ; `peck`, `hammer`, `read`, `write`, `sit`, `listen`, `teach` ; `joy`, `dance`,
   `clap`, `eat`, `stretch`, `chat`, `look` ; `sword`, `spell`, `sling`, `mace` ; `hurt`,
   `fall`, `getUp` ; `ClipPlayer` avec fondu de 0,22 s), `props.ts` (livre, plume et
   registre, marteau, épée, bâton, fronde, masse, panier), `kiwiRig.ts` (`KiwiRig` : une
   pièce instanciée par sorte, tenues de classe coupées tête/corps, pièces inutilisées
   cachées), `part.ts`. Planche `?kiwis` (`sheet/kiwiSheet.ts`, `&t=` fige le temps,
   `&clips=` filtre, `&zoom=`).
2. **Vivre sur place** (`render/kiwis.ts`) : Bibliothèque (six places autour du bâtiment,
   lecture et écriture, changement d'étagère, plus de navette) ; École (l'élève le·la plus
   avancé·e mène la leçon du côté libre de l'École, les autres en demi-cercle écoutent et
   essaient le geste de leur classe) ; gardes en ronde entre les postes de **leur secteur**
   (`defenseOf`), au pied intérieur des tourelles ou sur le rempart du secteur ; chantiers et
   réparations au marteau au pied du bâtiment ; inactif·ves qui picorent, s'étirent,
   s'assoient, dansent ou vont discuter à deux ; kiwis `outpost` plus dessiné·es chez nous ;
   blessé·es sans lit en extrait `hurt`.
3. **Furets et chauves-souris** (`render/anim/creatures.ts`, `CreatureRig`) : furet (corps,
   tête, mâchoire, queue, quatre pattes), chauve-souris (corps, tête, ailes membranes) ;
   extraits `run`, `bite`, `hit`, `hurt`, `fall` et `flap`, `dive`, `spit`, `hurt`, `fall` ;
   éclair blanc quand ils sont touchés ; un look par âge (écharpe, casque, lunettes et
   épaulière) prêt pour le chantier 38. Le spectacle des vagues s'en sert.
4. **Effets de base** (`render/particles.ts`) : formes boule, plume, étoile ; rendus éclairé,
   doux (translucide) et lumineux ; nouvelles sortes `flame`, `ember`, `soot`, `feather`,
   `star`, `dust` ; effets groupés `EFFECTS` (`hit`, `feathers`, `sparks`, `puff`, `fire`,
   `soot`) par `particles.effect(id, at)`. Étoiles sur un prédateur touché, plumes où il mord,
   étincelles où la graine tombe.
5. **Mesures** (Chromium logiciel, même page, 60 kiwis, avant/après) : mise à jour des kiwis
   0,044 → 0,060 ms par image, temps de rendu identique au bruit près, appels de dessin des
   kiwis 4 → 5 (+1 par accessoire réellement tenu), triangles des kiwis +29 % (≈ 670 par kiwi).

## Reste

Voir `docs/DETTE.md` (chantier 34) : vrai GPU et vrai téléphone, Kikiwiwis sur leur propre
modèle, extraits de combat en attente du moteur de bataille, feu et suie en attente des
incendies.
