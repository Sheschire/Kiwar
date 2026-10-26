# Chantier 56 — Les ligues

Acte IV « Au-delà » du [carnet de route](../CARNET_DE_ROUTE.md) (section 9, « Toujours en
idée »). **Serveur (SQL, fonction `game`) + client.** Après le **51**. Il peut tourner **en
parallèle du 55**, car il ne touche pas la simulation, sauf pour lire des faits publics. Il crée
le skill **`kiwar-leagues`**.

**Skills à charger** : `kiwar-online`, `kiwar-design`, `kiwar-client`.

## Intention du porteur

Les anciennes « saisons » compétitives sont devenues des **ligues** (`VISION.md`, nouvelles
orientations), et le porteur les veut dans l'acte IV (26 octobre 2026). `VISION.md` laissait
ouvertes deux questions : ce qui est remis à zéro, et ce qui fait gagner.

## Décisions déjà prises

1. **Des saisons sans remise à zéro** (porteur, 26 octobre 2026) :
   - un classement **par univers**, sur des **hauts faits publics et datés** : âge atteint,
     conquête, profondeur des Tréfonds, fruits du Verger, kiwis légendaires…
   - des saisons d'environ **4 semaines**, qui ne remettent à zéro que le classement ;
   - un **titre et un cosmétique** sont gardés (une bannière sur le Nid, une cape) ;
   - **aucune colonie n'est effacée**.
2. **En ligne seulement** : un univers partagé. En solo, il n'y a pas de classement, mais on peut
   afficher ses hauts faits.
3. **Garde-fous** (`kiwar-design`) :
   - un haut fait récompense une étape franchie, jamais le temps passé connecté : pas de série
     quotidienne, rien ne se perd à cause d'une absence ;
   - pas de récompense qui change la force (cosmétique seulement) ;
   - tout est calculé par le serveur à partir de l'état tenu, sans ajustement caché (charte
     10).

## État actuel (code)

- **Tables** : `games` (`user_id`, `universe_id`, `face`, `state`, `version`, `colony`),
  `command_log`, `universes` (`seed`, `max_players`, `pvp`, `allow_imports`),
  `universe_members` (`kiwi_index`, `face`, `display_name`, `planet_seed`), `chat_messages`
  (`supabase/migrations/`, la dernière étant `20261027000000_linked_colonies.sql`).
- **Aucun classement aujourd'hui.** Ce qui s'en approche le plus : les résumés `colonyPower`
  (`packages/shared/src/server/gameService.ts` ~214).
- **Protocole** : `server/protocol.ts` (~211 : `listUniverses`, `createUniverse`,
  `joinUniverse`, `universeSettings`…), `server/universes.ts`.
- **Événements** : les faits datés existent déjà dans les événements de `advance` (passage
  d'âge, `queenEmerged`, conquête, etc.).

## Proposition (point de départ)

- **Table `league_feats`** (`universe_id`, `user_id`, `colony`, `feat`, `at`, `points`), écrite
  **seulement par la fonction `game`** quand une commande ou un `load` produit l'événement
  correspondant. RLS : lecture par les membres de l'univers.
- **Table `league_seasons`** (`universe_id`, `n`, `starts_at`, `ends_at`) et une vue
  `league_ranking` (somme des points de la saison).
- **Hauts faits** (une table de données partagée `data/feats.ts`) : chaque âge, la première
  balise, la balise du centre, la reine, la conquête, la seconde colonie, chaque couche des
  Tréfonds, le Charançon, le premier kiwaï, chaque fruit visité, un comptoir, un kiwi de
  niveau 30… Les points sont plus forts quand le fait est rare. Un fait ne compte **qu'une fois
  par joueur·euse et par saison** pour le classement, mais il reste dans le palmarès.
- **Fin de saison** : le podium reçoit un titre daté (« Champion·ne de la saison 3 ») et un
  cosmétique choisi dans une petite liste. Le classement repart à zéro.
- **Client** : un écran « Ligue » (le classement de la saison, ses hauts faits, le palmarès, le
  temps restant), une ligne dans le chat quand un fait tombe, et les cosmétiques dessinés.
- **SQL** : une nouvelle migration, `pnpm build:sql`, `pnpm test:db` (RLS), et le SQL complet
  donné au porteur.

## Grille de décision (kiwar-design)

- **Boucles** : progression (les étapes) et retour (comparer avec les autres).
- **Horizon** : long terme (la saison) ; le prochain fait est visible.
- **Garde-fous** : l'envie de revenir n'est pas le plaisir. Rien ne pousse à se connecter (pas de
  série ni de bonus de présence) ; un fait ne se perd jamais.
- **Personnes** : l'effet relève du ressenti (la compétition saine ou la pression). Le porteur
  doit le jouer, et on le note « à tester ».

## Découpage proposé

1. **Données** : `data/feats.ts` et les faits détectés depuis les événements ; tests (purs).
2. **SQL et serveur** : les tables, la RLS, l'écriture par la fonction `game`, les saisons ;
   `pnpm test:db`, `pnpm build:functions`.
3. **Client** : l'écran Ligue, le palmarès, les lignes de chat, les cosmétiques, `MobileNav`,
   l'i18n ; captures.
4. **Mock et docs** : le mock Supabase, `docs/SUPABASE_SETUP.md`, création du skill
   `kiwar-leagues`, `DECISIONS.md`, `PLAN.md`, et le SQL donné au porteur.

## Critères d'acceptation

- Dans un univers, chaque membre voit le classement de la saison et le palmarès de chacun·e.
- Un fait ne s'écrit que par le serveur, depuis un événement réel (test RLS : un client ne peut
  pas écrire).
- Une fin de saison remet le classement à zéro sans toucher aucune partie.
- Aucune récompense ne change la force d'une colonie.
