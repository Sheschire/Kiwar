# Chantier 30 — Paliers, âges et réserves

Acte I « Le rythme » du [carnet de route](../CARNET_DE_ROUTE.md). **Simulation + client + bot.**
Premier chantier à lancer ; le 32 et le 34 peuvent tourner en parallèle (client seul).

**Skills à charger** : `kiwar-design`, `kiwar-sim`, `kiwar-ages`, `kiwar-balance` (+ `kiwar-client`
pour la partie 4).

## Intention du porteur

- « On s'ennuie vite en attendant les passages des âges. » « Trop de ressources inutiles
  accumulées pendant la recherche de l'âge de pierre, tous les bâtiments au max et pas possible
  d'en créer de nouveaux car niveau du nid trop faible. »
- « Plus de tiers d'amélioration dans l'âge de pierre. Actuellement un seul niveau. »
- « Les entrepôts sont trop puissants : on en fait quelques-uns, on a une énorme limite, on se
  connecte, on dépense tout et on part. » Ils doivent « beaucoup moins élargir la limite de
  stock » et permettre de « venir récupérer, par le joueur, les stocks entreposés en cliquant
  dessus ». « Se rapprocher d'un style idle : des réserves visibles que seul le joueur peut
  récupérer. »
- « Au début on veut que ce soit addictif ; les très longues attentes plus tard. On veut que le
  joueur revienne souvent dépenser ses ressources, se sente limité et réfléchisse à optimiser sa
  production. »

## Décisions déjà prises (23 octobre 2026)

1. **Rythme** (joueur·euse attentif·ve) : Pierre **~12 h**, Fer **~3 jours**, Industrie **~10
   jours** ; occasionnel·le (visite toutes les 8 h) ≈ ×1,5.
2. **Trois niveaux par âge** : Éden 1–3, Pierre 4–6, Fer 7–9, Industrie 10–12. Le Nid suit (1–12)
   et ouvre de la place à chaque niveau.
3. **Réserves dans les entrepôts, en débordement** : quand le stock d'une ressource est plein,
   la production continue dans les réserves des entrepôts au lieu de s'arrêter ; seul·e le·la
   joueur·euse les rapatrie d'un toucher. Réserve plafonnée (~8 h de production au début) ;
   pleine, la production s'arrête (stagnation, rien n'est perdu).
4. L'entrepôt agrandit **peu** le stock utilisable.
5. Les réserves non rapatriées sont **pillables en premier** (règles de pillage au chantier 31).

## État actuel (code)

Chemins sous `packages/shared/src/`. Détail des chiffres : skill `kiwar-design`,
`references/economy-map.md`.

- **Niveaux** (`data/buildings.ts`) : tables explicites L1–L3 ; L4–L6 = niveau précédent ×2,4
  coût, ×1,6 temps, ×1,5 production (`:503-571`) ; « le niveau n exige l'âge n−3 et le Nid ≥ n »,
  **le Nid 4 exige la Pierre** (`:545`). Copies : coût × croissance^copies
  (`sim/selectors.ts:259-266`).
- **Plafonds par niveau du Nid** : bâtiments 6/11/18/22/26/30 (`sim/selectors.ts:228-235`), file
  2/3/4/5/5/6 (`sim/commands.ts:381`), chantiers en parallèle 1/1/2/2/3/3 (`data/jobs.ts:32`),
  tourelles 2/4/6/7/8/9 (`data/threats.ts:104`).
- **Stock** : somme Nid + entrepôts, même plafond pour les quatre ressources, ×1,2 avec la
  maçonnerie (`sim/selectors.ts:90-97`) ; Nid 400/1000/2500/…, entrepôt 500/1200/3000/… ; au
  plafond, la récolte s'arrête (`sim/territory.ts:554-556`) ; un stock au-dessus du plafond
  (récompenses) n'est jamais détruit (`sim/advance.ts:518`). Part protégée du pillage : 30 % du
  Nid, 60 % des entrepôts (`sim/threats.ts:60`).
- **Recherche et âges** (`data/research.ts`, `sim/research.ts:129-153`) : stoneAge 1000 pts,
  ironAge 2900, industryAge 5800 (relevés au chantier 18, `docs/DECISIONS.md:1110-1173`), puis le
  niveau du monument (3000/3000/600/900 en 3 h pour la Pierre ; + 15 et 25 poussières pour Fer et
  Industrie). Goulot de l'Éden : les points (~36 pts/h avec une Bibliothèque 3).
- **Bot** (`tools/balance/src/bot*.ts`, skill `kiwar-balance`) : cibles 36 h / 96 h / 192 h,
  profils attentif et occasionnel, une seule Bibliothèque.

## Proposition (chiffres à régler avec le bot)

### Paliers

- Niveau n exige **l'âge ⌊(n−1)/3⌋** (0 Éden … 3 Industrie) et **le Nid ≥ n** ; le Nid lui-même
  suit la même règle d'âge.
- Courbes 4–12 par formule (au lieu de ×2,4) : coût ×~1,7, temps ×~1,35, production ×~1,25 par
  niveau ; le premier niveau d'un âge coûte un saut un peu plus marqué (×~2) pour que l'âge se
  sente. Lits, recherche, cargo, places d'École suivent la même idée (+1 travailleur·euse au
  premier niveau de chaque âge).
- Plafond de bâtiments du Nid : 6/11/18 puis +3 par niveau (21 … 45) ; file et parallèles
  prolongés. Tourelles prolongées.
- Les monuments et le labo gardent leurs 3 niveaux (un par passage).

### Âges

- Points des passages et coûts des monuments recalés sur 12 h / 3 j / 10 j (ordre de grandeur :
  stoneAge ~250 pts au lieu de 1000) ; coûts toujours **≤ stock utilisable** atteignable au Nid
  requis (jamais bloqué).
- Les technologies de chaque âge ne bougent pas (contenu neuf : chantiers 37, 38, 44, 45).

### Stock et réserves

- **Stock utilisable** : Nid seul pour l'essentiel (par exemple 600/1200/2000 à l'Éden, puis
  ×~1,5 par niveau) ; chaque entrepôt n'ajoute qu'un petit bonus (+10 % du Nid environ).
- **Réserve** par entrepôt et par ressource (par exemple 1500/3500/7000 à L1–L3, ~8 h de
  production d'une colonie de ce niveau) : quand le stock d'une ressource est plein, ce que la
  colonie aurait récolté va dans la **réserve commune** des entrepôts (somme de leurs plafonds) ;
  chaque entrepôt affiche sa part (proportionnelle à son plafond). Pleine, la récolte de cette
  ressource s'arrête comme aujourd'hui.
- Commande **`collect { buildingId }`** : transfère la part de cet entrepôt dans le stock, dans
  la limite de la place libre (le reste reste en réserve). Une commande « Tout rapatrier »
  (`collectAll`) dans la fiche du Nid pour les téléphones. Jamais automatisée (ni chantier 15, ni
  bot hors de ses visites).
- Exact hors ligne : la réserve se remplit au débit de récolte tant que le stock est plein ;
  « réserve pleine » est un événement d'`advance`.
- Pillage (règles au 31) : réserves non protégées.

### Migration des sauvegardes

- Ancien niveau 4 → 4, 5 → 7, 6 → 10 (chaque niveau garde son âge) ; Nid idem.
- Stock au-dessus du nouveau plafond : gardé (règle existante), il se dépense normalement.
- Réserves : vides à la migration.

## Impact technique

- Simulation (skills `kiwar-sim`, `kiwar-ages`) : `data/buildings.ts` (niveaux 1–12, formules,
  plafonds), `sim/selectors.ts` (stock, plafond de bâtiments, réserve), `sim/territory.ts`
  (débordement vers la réserve), `sim/advance.ts` (événement réserve pleine), `sim/commands.ts`
  (`collect`, `collectAll`), `data/research.ts` (passages), migration de schéma, protocole du
  serveur (`server/gameService.ts`), `pnpm build:functions`. Pas de SQL (l'état est en JSON).
- Client (skill `kiwar-client`) : badges de niveau jusqu'à 12, fiches (« exige l'âge du Fer »),
  tas visibles sur les entrepôts (3 tailles), toucher = rapatrier avec étiquettes « +1 250 »
  (`render/dropLabels.ts`) et un son `warehouse.collect` (skill `kiwar-audio`), alerte discrète
  « Réserves pleines : la récolte s'arrête », i18n FR + EN.
- Les modèles des niveaux 7–12 réutilisent ceux de leur âge jusqu'au chantier 33.
- Bot (skill `kiwar-balance`) : il rapatrie à chaque visite ; nouvelles mesures **temps mort**
  (plus longue période, pendant qu'il joue, sans action utile possible), **temps au plafond**,
  **production perdue** (réserves pleines) ; nouvelles cibles d'âges ; essayer deux
  Bibliothèques.

## Découpage proposé

1. Paliers : niveaux 1–12, règle d'âge, Nid 1–12 et ses plafonds, formules, migration ; tests
   (portes d'âge, migration 5 → 7, plafond de bâtiments).
2. Âges : passages et monuments recalés ; tests (aucun coût au-dessus du stock possible).
3. Réserves : stock du Nid, petit bonus d'entrepôt, réserve en débordement, `collect` /
   `collectAll`, événement réserve pleine, protocole, bundle ; tests (exactitude sur 3 jours
   d'absence, rapatriement partiel, réserve pleine).
4. Client : tas et toucher, fiches, badges, alerte, son, i18n ; captures desktop + téléphone.
5. Bot : visites qui rapatrient, nouvelles mesures, nouvelles cibles, réglage ; sondes ciblées
   (`pnpm balance:ages`, 10 graines par biome).
6. Docs et skills : `economy-map.md` de `kiwar-design`, `kiwar-ages`, `kiwar-balance`, `kiwar-sim`
   (nouvelle commande), `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- Bot attentif : Pierre ~12 h, Fer ~3 j, Industrie ~10 j (±15 %) ; occasionnel·le ≈ ×1,5 ;
  Kiwisu et Kiwino à ±10 %.
- La Pierre offre trois niveaux à monter ; on ne reste plus des heures sans rien à construire
  (temps mort mesuré et rapporté, cible de travail ≤ ~45 min pendant les 24 premières heures).
- Un entrepôt plein se voit et se vide d'un toucher ; hors ligne, la réserve couvre ~8 h au
  début puis la récolte s'arrête.
- Une vieille sauvegarde se charge sans rien perdre (niveaux convertis).
- Jamais de partie bloquée (coûts ≤ stock possible, `collect` toujours permis).

## Points neufs possibles (à demander seulement s'ils se posent)

- Si le recalage des âges vide l'Éden de sens (trop court pour apprendre), proposer au porteur
  une Pierre à ~16 h plutôt que de raboter le tutoriel.
