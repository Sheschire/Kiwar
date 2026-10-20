# Chantier 15 — Colonie autonome : constructions, recherche, météorites, automatismes

Retours de partie de fin octobre 2026, après les chantiers 09 à 14.

## Intention du porteur

« Le système doit être intelligent et automatisé pour que le joueur n'ait pas absolument tout à
gérer, mais qu'il puisse le faire s'il veut automatiser et optimiser ses unités et sa
productivité. »

- Une **construction en attente** doit être prioritaire et toujours lancée par un kiwi, choisi
  automatiquement parmi ceux qui ont le plus de Force.
- Pareil pour la **recherche** : un kiwi devrait se détacher pour aller faire la recherche.
  « C'est le genre d'action qu'on déclenche et qu'on veut voir se lancer avec le kiwi le mieux
  taillé pour la tâche. »
- **Météorites** : la récolte d'un cratère est comprise dans le poste pulpe, c'est déroutant. Il
  faut un poste dédié, parce qu'on ne comprend pas comment y envoyer des kiwis.

## État actuel (code)

- **Constructions** : une file **en série** (seul le premier élément avance, longueur
  `queueSize` du Nid). `pickBuilder` (`packages/shared/src/sim/advance.ts`) prend dans l'ordre :
  le kiwi « bâtisseur·euse prioritaire » le plus rapide, puis le kiwi libre le plus rapide, puis un
  kiwi emprunté au poste le plus pourvu. Les kiwis sous cadenas sont exclus.
  - S'il n'y a personne, le chantier démarre quand même avec `builderId: null`, à la vitesse de
    base.
  - La vitesse dépend de la Force, de la maîtrise et de la classe (`builderSpeed`, `sim/kiwis.ts`).
  - « En attente » (`QueuePanel.tsx`) veut seulement dire « derrière le premier de la file ».
- **Recherche** : la Bibliothèque est un poste **manuel** (`isManualWorkplace`). Le « + » de sa
  fiche prend les kiwis libres **dans l'ordre de la liste**, pas selon l'Esprit. Sans
  chercheur·euse, aucun point n'est produit, même si une technologie est choisie
  (`setResearch`, `sim/research.ts`).
- **Météorites** : `meteorRate` (`sim/sky.ts`) ne récolte un cratère que de deux façons : un camp
  posé dessus, ou un producteur de la même ressource qui l'atteint (à 50 %). Il n'y a pas de poste
  dédié. Le tableau des postes (`sim/posts.ts`) classe les postes selon la tuile, donc un camp sur
  un cratère de pépins tombé sur de la chair apparaît en « pulpe ». Le débit des météorites
  n'apparaît nulle part.
- Dette du chantier 09 : pas de réparateur·ice ni de garnison d'urgence automatiques.

## Réponses du porteur (fin octobre 2026)

1. Construction : **toujours un kiwi**, celui qui a le plus de Force (emprunté à son poste si
   besoin), avec **plusieurs chantiers en parallèle** selon le niveau du Nid. La construction
   passe avant la récolte, et le kiwi retourne à son poste ensuite.
2. **Chercheur·euses automatiques** : choisir une recherche envoie les kiwis qui ont le plus
   d'Esprit à la Bibliothèque. Ils reviennent à leur poste quand il n'y a plus rien à chercher.
3. **Poste Météorite dédié** : le cratère devient un poste temporaire avec des places, sans camp,
   rempli par les kiwis qui ont le plus d'Adresse.
4. **Réparation et garnison automatiques** sur le même principe.
5. Un **panneau Automatisation** pour couper l'automatisme de chaque tâche.

## Proposition

### Principe commun : les tâches

- Une **tâche** = un besoin ponctuel avec un nombre de places et une stat clé : construction
  (Force), recherche (Esprit), cratère (Adresse), réparation (Force), garnison (classe ou Force).
- L'automate remplit chaque tâche avec les meilleurs kiwis pour cette stat. Il prend d'abord les
  kiwis sans poste, puis il **emprunte** à la récolte, en commençant par les postes les plus
  pourvus. Le cadenas et le drapeau « prioritaire » du chantier 09 sont respectés.
- Le kiwi emprunté garde son **poste d'origine** (`homeJob`, déjà utilisé par la bascule du
  chantier 09) et y retourne quand la tâche se termine.
- Ordre de priorité proposé : garnison (vague imminente) > réparation > construction > recherche
  > cratère > récolte.

### Constructions en parallèle

- Le nombre de chantiers simultanés dépend du niveau du Nid (proposition : 1 / 1 / 2 / 2 / 3 / 3).
  La file garde son ordre, et les premiers éléments démarrent dès qu'il y a des places.
- Un chantier **ne démarre jamais sans kiwi**. S'il n'y en a aucun (tous en expédition ou sous
  cadenas), il attend avec le statut « en attente d'un·e bâtisseur·euse » et une explication.

### Recherche

- Choisir une technologie remplit les places de la Bibliothèque avec les meilleurs kiwis en
  Esprit (affinité de `researchPower`). Quand il n'y a plus de recherche en cours, ils
  reviennent à leur poste.
- La réserve de points (sans technologie choisie) reste possible en affectation manuelle.
- Le « + » de la fiche trie enfin selon l'Esprit.

### Poste Météorite

- Un cratère actif devient un **poste temporaire** avec des places (proposition : 3), sans camp.
  Débit = le taux de base de la ressource du cratère × la puissance des kiwis × la logistique,
  plafonné par le gisement.
- Une ligne **« Météorite »** dans le tableau des postes, avec son débit et le temps restant.
- Le camp sur un cratère reste possible (bonus), mais il n'est plus nécessaire.

### Panneau Automatisation

- Dans l'écran du village, un interrupteur auto/manuel par tâche (constructions, recherche,
  météorites, réparations, garnison, bascule quand le stock est plein). Tout est en auto par
  défaut.
- En manuel, la tâche attend une affectation du joueur ; une pastille signale qu'elle n'a pas de
  kiwi.

## Impact technique

- Simulation : `pickBuilder` et `startNextConstruction` gèrent plusieurs chantiers ; tâches
  temporaires pour la recherche, les cratères et les réparations ; nouveaux réglages
  d'automatisation dans l'état (migration de schéma) ; événements de `advance` au début et à la
  fin de chaque tâche (exact hors ligne).
- `meteorRate` passe par le poste dédié ; `jobBoard` gagne la ligne « Météorite » et le débit
  des météorites.
- Client : file de construction (plusieurs barres), Bibliothèque, tuile du cratère, panneau
  Automatisation, i18n FR/EN.
- Équilibrage : les constructions en parallèle accélèrent le début de partie, donc revérifier le
  rythme des âges (`pnpm balance`, `pnpm balance:ages`). Le bot doit utiliser les automatismes.

## Découpage proposé

1. **Tâches et emprunt** : socle commun, constructions toujours avec un kiwi, chantiers en
   parallèle.
2. **Recherche automatique** (Esprit), tri du « + ».
3. **Poste Météorite** et sa ligne dans le tableau des postes.
4. **Réparation et garnison automatiques.**
5. **Panneau Automatisation.**
6. Équilibrage, docs, skills (`kiwar-rpg`, `kiwar-threats`, `kiwar-ages`).

## Critères d'acceptation

- Un·e joueur·euse qui ne touche à aucune affectation voit ses constructions, sa recherche et ses
  cratères avancer avec les bons kiwis.
- Un·e joueur·euse qui veut tout gérer peut couper chaque automatisme.
- Exact hors ligne, Kiwisu et Kiwino à ±10 %, rythme des âges conservé à ±15 %.

## Questions ouvertes

1. Chantiers simultanés par niveau du Nid (1/1/2/2/3/3) : à valider.
2. Pour un gros chantier, un seul kiwi, ou plusieurs (plus rapide) ?
3. Ordre de priorité des tâches proposé ci-dessus : d'accord ?
4. Faut-il garder le camp sur cratère, ou le retirer puisque le poste dédié le remplace ?
