# Chantier 27 — Mairie et Discours

Retours de partie de fin octobre 2026. **Simulation + client**. À lancer **après le chantier 26**
(la Mairie occupe trois tuiles).

## Intention du porteur

- « Bâtiment **Mairie** à créer avec une action **Discours** déclenchante : le maire fait un
  discours et **tous les kiwis viennent y assister**, ce qui **pause la productivité** mais
  **augmente le moral** des troupes pour une **durée déterminée**. »

## Réponse du porteur (fin octobre 2026)

**La Mairie porte le Discours** : nouveau bâtiment (3 tuiles, unique) où le·la maire siège. Le
Discours devient une action de la Mairie ; sans Mairie, pas de discours.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Pas de Mairie.** Le·la maire est une classe unique (`data/classes.ts` ~113-126) avec
  Organisation, Discours (actif, recharge 12 h) et Fête.
- **Discours** (`sim/commands.ts` ~829-831, `useSkill`) : fixe `state.speechUntil` pour 1 h
  (doublé avec Fête) ; pendant ce temps récolte ×1,15 (`colonyBonus`, `sim/kiwis.ts` ~247) et
  moral +0,03. Fin = événement d'`advance`.
- **Moral** (`data/needs.ts` ~67-83, `sim/rest.ts` ~152-158) : ±20 % sur tout le travail ;
  somme de nourri, lits, maire (0,01 × Charisme + 0,05 Organisation), discours, deuil, saison.
- Le client a déjà une petite mise en scène du discours du·de la maire (bulle).

## Proposition

### La Mairie

- Bâtiment unique, 3 tuiles, débloqué au Nid niveau 2 (à confirmer), niveaux 1 à 3 (puis 4-6
  avec les âges). Le·la maire y « travaille » ; sans maire, la Mairie ne fait rien.
- Effet permanent : l'Organisation du·de la maire passe par la Mairie (bonus de moral selon le
  niveau).

### Le Discours

- Action de la Mairie (bouton dans sa fiche), recharge 24 h de jeu (12 h au niveau 3).
- **Rassemblement** : tous les kiwis valides (hors garnison en vague, blessé·es, expédition,
  formation) quittent leur poste et marchent jusqu'à la Mairie ; **la production s'arrête**
  pendant le discours (~20 min de jeu, marche comprise).
- **Après** : moral **+10 %** pendant **8 h** (niveau 1), 10 h (niveau 2), 12 h (niveau 3) ;
  le Charisme du·de la maire ajoute jusqu'à +5 %. Fête : effet doublé.
- Interdit pendant une vague (ou bien : les gardes restent à leur poste, à décider).
- Remplace l'ancien Discours (compétence) : les sauvegardes qui ont `speechUntil` en cours le
  terminent normalement.

### Mise en scène

- Les kiwis convergent vers la Mairie, se rassemblent en arc de cercle, le·la maire sur une
  estrade avec une bulle, applaudissements et confettis à la fin ; son dédié (`speech.crowd`,
  remplaçable depuis `/admin`).

## Impact technique

- Simulation (skills `kiwar-rpg`, `kiwar-cycles`, `kiwar-tasks`) : bâtiment `townHall`,
  commande `giveSpeech`, `state.speech = {start, gatherUntil, moraleUntil}`, deux événements
  d'`advance` (fin du rassemblement, fin du bonus), `workforce` à 0 pendant le rassemblement,
  moral, migration. Exactitude hors ligne : la pause et le bonus doivent être exacts sur une
  longue absence.
- Serveur : simulation embarquée (`pnpm build:functions`), protocole de la commande.
- Client : modèle de la Mairie (famille « savoir » ou nouvelle famille « civique »), estrade,
  rassemblement des kiwis (`render/kiwis.ts`), bouton et compte à rebours, i18n FR + EN, son.
- Bot : quand faire un discours (avant une longue période de travail).

## Découpage proposé

1. Simulation : Mairie, commande, rassemblement (production 0), bonus de moral, migration du
   Discours ; tests (exactitude hors ligne, vague pendant le discours).
2. Client : bâtiment, fiche, bouton, compte à rebours.
3. Mise en scène du rassemblement et son.
4. Bot, équilibrage, docs, skills.

## Critères d'acceptation

- Un discours arrête la production ~20 min et donne un bonus de moral visible pendant des
  heures ; le gain net est positif si on le lance au bon moment, négatif si on le spamme.
- Les kiwis se rassemblent vraiment devant la Mairie.
- Hors ligne, le calcul est exact.

## Questions ouvertes

1. Chiffres : 20 min de pause pour +10 % de moral pendant 8 h (proposé) ?
2. Pendant une vague : discours interdit, ou garnison exemptée ?
3. La Mairie doit-elle aussi faire autre chose (par exemple un tableau des postes, des
   décrets) ?
4. Débloquée à quel niveau du Nid ?
