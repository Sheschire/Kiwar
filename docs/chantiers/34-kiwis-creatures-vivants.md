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
