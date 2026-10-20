# Chantier 09 — Gestion des kiwis : affectation, priorités, tableau des postes

> **Terminé (octobre 2026).** Fait : commande `assignKiwi` et « Affecter à… » depuis la fiche
> (rendement et affinité par poste, échange si plein), navigation ◀ ▶ et balayage, liste des
> ouvriers et « Remplacer par… » sur un bâtiment, onglet **Postes** et pastille « N sans
> poste », drapeaux **cadenas** et **bâtisseur·euse prioritaire**, **bascule automatique** quand
> un stock est plein et retour sous 90 %, kiwis libres placés par affinité. Détail dans
> `docs/DECISIONS.md`. Reste : garnison d'urgence et réparations prioritaires, postes
> génériques (chantier 12), le bot n'utilise pas ces outils.

Refonte de l'affectation des kiwis issue des retours de partie d'octobre 2026.

## Intention du porteur

« Il y a un gros travail pour proposer une expérience intuitive et facile à prendre en main pour
gérer ses kiwis et optimiser leurs statistiques. »

- Affecter un kiwi depuis l'écran du village à un métier ou à un bâtiment : on consulte un kiwi,
  on se dit « tiens, il est fort en ça » et on l'affecte facilement à des postes prédéfinis.
- Affecter un kiwi à des tâches générales, par exemple aller construire en priorité avec un kiwi
  donné quand il y a un chantier.
- Voir d'un coup d'œil le nombre de kiwis sans poste, pour savoir si on est sous-optimal, et
  surtout combien de kiwis travaillent sur chaque ressource.
- Naviguer facilement d'un kiwi à l'autre dans l'écran du village.
- Quand le stock d'une ressource est plein, les kiwis doivent se rediriger naturellement vers une
  activité ou un bâtiment qui a des places libres, en privilégiant leur affinité (stats et
  métier).

## État actuel (code)

- **Affectation automatique** : `autoAssign` (`packages/shared/src/sim/advance.ts`) envoie un
  kiwi vers le bâtiment qui a une place libre et le plus faible ratio ouvriers/places. En cas
  d'égalité, il choisit le bâtiment où la `workerPower` du kiwi est la plus haute.
  - Elle tourne à l'éclosion, après une guérison, une formation, un retour d'expédition et la
    fin d'un chantier.
  - Un nouveau producteur attire le meilleur kiwi libre (`bestIdleFor`).
  - La Bibliothèque est manuelle seulement (`isManualWorkplace`).
  - Un kiwi mis au repos par le joueur reste au repos.
- **Affectation manuelle** : seulement la commande `assignWorkers {buildingId, count}`, avec le
  sélecteur −/+ de `TilePanel.tsx`. Ajouter prend le meilleur kiwi libre, retirer enlève le moins
  doué. **On ne peut pas choisir quel kiwi.**
- `workerPower` (`sim/kiwis.ts`) = (1 + 0,03 × (Adresse − 5)) × (1 + 0,03 × rang de maîtrise) ×
  trait/classe, avec un plancher de 0,5.
- **Bâtisseur·euses** : le meilleur kiwi libre, sinon un kiwi emprunté au bâtiment le plus
  pourvu, qui revient ensuite.
- **Stock plein** : les ouvriers restent en poste et ne récoltent que ce que la colonie mange
  (statut `storageFull`). Le stockage est **une seule valeur partagée** par les quatre
  ressources (`selectors.ts`).
- **Interface** : le nombre de kiwis au repos n'apparaît que dans l'infobulle de population
  (`TopBar.tsx`) et dans le panneau d'un bâtiment. Il n'y a **aucune vue « ouvriers par
  ressource »**.

## Réponses du porteur (octobre 2026)

- Stock plein : **bascule automatique** des kiwis d'une ressource pleine vers les places libres
  d'autres métiers, en privilégiant l'affinité (stats, maîtrise, classe). Ils **reviennent**
  quand il y a de nouveau de la place. Un **cadenas** sur la fiche garde un kiwi à son poste.

## Proposition

### Affecter depuis la fiche d'un kiwi

- Bouton « Affecter à… » sur la fiche : une liste de postes groupés par métier (pulpe, fibre,
  pépins, jus, recherche, garnison, construction). Chaque ligne montre le bâtiment, les places
  (`2/3`) et **le rendement de ce kiwi à ce poste** (« ×1,12 », vert s'il est au-dessus de la
  moyenne). Le meilleur poste est mis en avant (« Idéal pour ce kiwi »).
- Nouvelle commande `assignKiwi {kiwiId, buildingId | null}` : elle déplace ce kiwi précis. Si
  le poste est plein, on propose d'échanger avec le kiwi le moins doué du bâtiment.
- Sur la fiche d'un bâtiment, une liste de ses ouvriers (portrait, rendement) avec le choix
  « remplacer par… ».

### Priorités générales

- Drapeau **« Bâtisseur·euse prioritaire »** sur un kiwi : quand un chantier démarre, ce kiwi y
  va d'abord (il quitte son poste et y revient ensuite, comme l'emprunt actuel).
- Plus tard, le même principe pour d'autres tâches générales : réparations, garnison d'urgence
  quand une vague arrive.
- **Cadenas** : ce kiwi n'est jamais déplacé automatiquement (ni bascule, ni emprunt).

### Bascule automatique quand le stock est plein

- Quand le stock d'une ressource est plein (événement de `advance`), ses récolteur·euses non
  verrouillé·es partent vers le poste libre où leur affinité est la meilleure. On garde
  1 ouvrier·ère par bâtiment pour couvrir ce que la colonie mange.
- Quand il y a de nouveau de la place (sous 90 % pour éviter les va-et-vient), ils reviennent à
  leur **poste d'origine**, mémorisé.
- Les kiwis libres, eux, sont toujours placés selon l'affinité, pas seulement par le ratio.
- Réserve : le stockage est aujourd'hui une valeur unique partagée. « Plein pour une ressource »
  doit être défini (voir les questions ouvertes).

### Lecture d'un coup d'œil

- Pastille **« N sans poste »** dans la barre du haut, orange si N > 0 et qu'il existe des places
  libres. Un tap l'ouvre sur le tableau des postes.
- **Tableau des postes** (un onglet de l'écran du village) : une ligne par ressource ou métier
  avec les ouvriers/places, le débit horaire et le statut (plein, épuisé, de nuit). Un tap sur une
  ligne affiche ses kiwis. On peut tout affecter depuis ce tableau.
- **Navigation** : flèches ◀ ▶ (et balayage sur téléphone) pour passer d'une fiche à l'autre
  dans l'ordre de la liste filtrée.

## Impact technique

- `Villager` gagne `locked`, `builderPriority` et `homeJob` (le poste d'origine pendant une
  bascule), avec une migration de schéma.
- Nouvelles commandes `assignKiwi`, `setKiwiFlags` (protocole, serveur, test d'exactitude hors
  ligne).
- Remplir ou libérer le stock d'une ressource devient un événement de `advance`, avec un
  hystérésis.
- `autoAssign` passe d'un choix par ratio à un choix par affinité, ce qui demande de revérifier
  l'équilibrage (le bot l'utilise).
- Client : écran du village (onglet Postes, navigation), `TopBar` (pastille), `TilePanel`
  (liste des ouvriers), i18n FR/EN.

## Découpage proposé

1. **Commande `assignKiwi`** et « Affecter à… » depuis la fiche, avec le rendement par poste, plus
   la navigation ◀ ▶ entre les fiches.
2. **Pastille « sans poste » et tableau des postes** par ressource.
3. **Drapeaux** : bâtisseur·euse prioritaire et cadenas.
4. **Bascule automatique** quand le stock est plein, et retour au poste d'origine.
5. **Équilibrage** (bot, affinité), docs, skill `kiwar-rpg` mis à jour.

## Critères d'acceptation

- Depuis la fiche d'un kiwi, l'affecter à n'importe quel poste prend 2 taps.
- Le nombre de kiwis sans poste et la répartition par ressource se lisent sans ouvrir de menu.
- Un stock plein ne laisse jamais des kiwis récolter dans le vide quand des places sont libres
  ailleurs.
- La simulation reste exacte hors ligne (même état en une ou plusieurs avances).

## Questions ouvertes

1. Le stockage est partagé (une seule capacité pour quatre ressources) : passer à un stockage
   **par ressource**, ou considérer qu'une ressource est « pleine » quand le stockage global est
   saturé ? Ça change beaucoup l'équilibrage.
2. La bascule doit-elle ramener les kiwis **automatiquement** à leur poste d'origine, ou laisser
   le joueur décider ?
3. Faut-il ajouter des **postes génériques** sans bâtiment (porteur·euse, entretien des
   chemins) pour occuper les kiwis en trop ?
4. Garder un sélecteur −/+ rapide sur les bâtiments en plus du choix kiwi par kiwi ?
