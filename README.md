# Kiwar 🥝

Jeu de gestion **cozy** en 3D isométrique, jouable dans le navigateur (desktop et mobile) : des
oiseaux kiwis développent leur civilisation sur une planète-kiwi coupée en deux (Kiwisu et Kiwino).

- Brief de game design : [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
- Journal des décisions : [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Dernier rapport d'équilibrage : [`docs/BALANCE_REPORT.md`](docs/BALANCE_REPORT.md)
- Plan de route et reprise dans une nouvelle conversation : [`docs/PLAN.md`](docs/PLAN.md)
- Mémoire pour Claude : [`CLAUDE.md`](CLAUDE.md) et les skills de [`.claude/skills/`](.claude/skills)

> **État : Jalon 4** — le territoire compte : gisements qui s'épuisent et repoussent, zones de
> récolte, camps de cueillette sans bâtiment, logistique (distance au dépôt) et chemins à tracer.
> Vision long terme : [`docs/VISION.md`](docs/VISION.md).
>
> **Jalon 3** — expéditions (vaisseau, provisions, combat contre les extraterrestres),
> univers partagés sur invitation et chat d'équipe.
>
> **Jalon 2** — en ligne avec Supabase (invité immédiat, comptes Google / lien magique,
> serveur qui fait autorité), voir [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md). Sans
> configuration, le jeu reste jouable en mode local.
>
> **Jalon 1** (solo, local, sans serveur). Une face procédurale en 3D, une caméra
> desktop/tactile, 7 bâtiments sur 3 niveaux, villageois autonomes, éclosion, objectifs guidés,
> progression hors ligne, FR/EN et PWA.

## Installation

Prérequis : Node ≥ 20 et pnpm (`corepack enable` suffit pour activer pnpm).

```bash
pnpm install
pnpm dev
```

Ouvrez ensuite http://localhost:5173. Le serveur de dev écoute aussi sur le réseau local
(`--host`) : depuis un téléphone sur le même Wi-Fi, ouvrez l'URL « Network » affichée par Vite.

### Paramètres d'URL

| Paramètre                          | Effet                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `?seed=banane`                     | Génère la face à partir de cette graine (demande confirmation si une colonie existe) |
| `?face=kiwino`                     | Choisit la face (`kiwisu` par défaut)                                                |
| `?quality=low\|medium\|high\|auto` | Force un preset graphique                                                            |

## Déploiement (Vercel)

Le fichier `vercel.json` configure tout : importez le dépôt dans Vercel **sans changer le Root
Directory** (racine du dépôt), Vercel lit `vercel.json` (install pnpm, `pnpm build`, sortie
`apps/client/dist`, cache long sur les assets, pas de cache sur le service worker).
Sans variable d'environnement, le jeu tourne en mode local (sauvegarde dans le navigateur).
Pour le mode en ligne, ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` : voir
[`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md).

## Scripts

| Script           | Rôle                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev`       | Serveur de développement Vite (client)                                                            |
| `pnpm build`     | Build de production + service worker PWA (`apps/client/dist`)                                     |
| `pnpm preview`   | Sert le build de production                                                                       |
| `pnpm test`      | Vitest sur tous les workspaces                                                                    |
| `pnpm typecheck` | `tsc --noEmit` sur chaque workspace                                                               |
| `pnpm lint`      | ESLint (zéro warning toléré)                                                                      |
| `pnpm format`    | Prettier                                                                                          |
| `pnpm balance`   | Rapport d'équilibrage Kiwisu vs Kiwino (`--seeds 200 --threshold 10 --hours 72 --out fichier.md`) |

## Commandes de jeu

|                                       | Desktop                                                         | Mobile                                 |
| ------------------------------------- | --------------------------------------------------------------- | -------------------------------------- |
| Sélectionner une tuile ou un bâtiment | Clic gauche                                                     | Toucher                                |
| Déplacer la carte                     | Clic gauche glissé (aussi clic milieu, WASD / flèches)          | Glisser à un doigt                     |
| Tourner autour                        | Clic droit glissé, ou Alt/Option (ou Ctrl) + clic gauche glissé | Glisser à deux doigts (ou les tourner) |
| Zoom                                  | Molette ou pincement du trackpad                                | Pincer                                 |
| Rotation par paliers de 45°           | Q / E                                                           | —                                      |
| Infos d'une ressource                 | Survol de la ressource                                          | Toucher la ressource                   |
| Fermer la sélection                   | Échap                                                           | ✕                                      |
| Panneau debug                         | `` ` `` (ou `²` en AZERTY)                                      | Réglages → Panneau debug               |

Le panneau debug propose le multiplicateur de temps (×1, ×10, ×100), +500 de chaque ressource,
la régénération avec une nouvelle graine, la bascule Kiwisu/Kiwino et un compteur de fps.

## Architecture

```
packages/shared   Règles, données, simulation, génération procédurale — TypeScript pur
                  (aucune dépendance DOM ou Three.js, déterministe)
apps/client       Rendu Three.js + HUD Preact ; lit l'état et envoie des commandes
tools/balance     Simulations headless d'équilibrage (CLI)
supabase/         Migrations SQL (RLS) et fonction serveur `game` (Deno)
docs/             Brief, décisions, rapport d'équilibrage
```

### `packages/shared`

- `data/` : ressources, tuiles, profils de face, bâtiments (coûts, durées, production par niveau),
  éclosion, objectifs. **Changer l'équilibrage revient à changer une donnée.**
- `worldgen/generateFace(seed, face, params)` : disque hexagonal selon l'anatomie d'une tranche
  de kiwi (cœur, rayons, anneau de graines, chair, bosquets de duvet, poches de jus, peau).
- `sim/` : `GameState` (avec `playerId`, `universeId`, `kiwiId`, `face`, `seasonId` prévus pour
  le multijoueur), `advance(state, now)` (pur, piloté par les événements, exact même après des
  jours d'absence) et `applyCommand(state, command, { now, map })` avec validation.
- `save/` : sauvegarde versionnée, validée par zod, avec migrations.
- Déterminisme garanti par l'outillage : ESLint interdit `Math.random`, `Date.now`, le DOM et
  les imports Three/Preact dans `shared`. Le hasard passe par un RNG à graine (sfc32), le temps
  par un paramètre `now`.

### `apps/client`

- `game/GameController` : horloge injectée (multiplicateur debug), boucle `advance`, commandes,
  sauvegarde automatique dans `localStorage`, résumé « Pendant votre absence… ».
- `render/` : terrain instancié (1 draw call), shader de jus, props instanciés, bâtiments
  procéduraux, kiwis instanciés (4 draw calls quel que soit leur nombre), post-processing
  (N8AO, bloom, tilt-shift, tone mapping neutre, vignette), presets Bas / Moyen / Haut avec
  détection automatique et baisse adaptative si le fps chute.
- `camera/CameraRig` : `camera-controls` configuré pour la souris, le clavier et le tactile.
- `ui/` : HUD Preact « parchemin » (barre de ressources, panneau de tuile ou bottom sheet sur
  mobile, file de construction, œuf, objectifs, réglages, debug). Store `zustand` (vanilla)
  partagé avec le renderer.
- `i18n/` : dictionnaires FR/EN typés ; une clé manquante est une erreur de compilation.

Le client ne modifie jamais l'état : il émet des commandes (`build`, `upgrade`, `cancel`,
`assignWorkers`, `hatchEgg`, `claimObjective`…) validées par `shared`.

### Mode en ligne (Jalon 2)

- `shared/server/gameService` : service de jeu qui fait autorité (horloge et hasard côté serveur,
  validation des commandes avec les mêmes règles, limitation de débit, commandes debug réservées
  aux admins, contrôle de cohérence à l'import d'une sauvegarde locale).
- `supabase/functions/game` : fonction Deno qui authentifie le joueur et appelle ce service ;
  `supabase/migrations` : tables `games`, `command_log`, `admins` avec RLS (lecture seule pour
  le joueur).
- Côté client, les commandes sont appliquées immédiatement (optimiste), envoyées dans l'ordre,
  puis l'état local est recalé sur la réponse du serveur. Hors connexion, elles attendent et
  repartent automatiquement.

## Tests

`pnpm test` couvre notamment :

- la grille hexagonale et le RNG ;
- le déterminisme de `generateFace` (même graine = même face) et les quantités minimales de
  chaque ressource sur 60 graines × 2 faces ;
- `advance()` : production, plafonds de stockage, constructions en chaîne hors ligne, éclosion,
  et équivalence entre un grand pas et de nombreux petits pas ;
- la validation de chaque commande et le déterminisme d'un journal de commandes ;
- la sauvegarde (aller-retour, fichiers corrompus, versions futures) ;
- le pathfinding des kiwis, la cohérence FR/EN des traductions et le bot d'équilibrage.

## Performances

- Bas : environ 36 draw calls et 75 k triangles pour une face complète.
- Ombres statiques (recalculées seulement quand un bâtiment change) ; ombres-pastilles sous les kiwis.
- Le build de production pèse environ 290 ko de JS gzippé, en trois chunks (jeu, three, post-processing).

## Crédits

- Police : [Alegreya](https://fonts.google.com/specimen/Alegreya) de Juan Pablo del Peral,
  SIL Open Font License 1.1 (via [Fontsource](https://fontsource.org)).
- Bibliothèques : three.js (MIT), postprocessing (Zlib), n8ao (ISC), camera-controls (MIT),
  Preact (MIT), zustand (MIT), zod (MIT), simplex-noise (MIT), Vite / Vitest (MIT).
- **Aucun asset externe** : modèles 3D, textures, icônes et effets sont générés par le code.
