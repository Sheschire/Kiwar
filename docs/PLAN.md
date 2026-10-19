# Kiwar — plan de route

> Document de travail pour reprendre le projet dans une nouvelle conversation. À mettre à jour à
> la fin de chaque jalon (état, tâches suivantes). Les décisions détaillées vont dans
> `DECISIONS.md`, les idées long terme dans `VISION.md`.

## Démarrer une nouvelle conversation

Message type à donner à Claude :

> Lis `CLAUDE.md` puis `docs/PLAN.md`, charge les skills utiles et continue le prochain jalon en
> autonomie. Pose-moi des questions interactives si un choix de game design n'est pas couvert.

Une conversation par jalon (ou par partie de jalon) suffit : tout ce qu'il faut savoir est dans
les docs et les skills, pas dans l'historique.

## État

| Jalon | Contenu                                                                       | État       |
| ----- | ----------------------------------------------------------------------------- | ---------- |
| 1     | Solo local : face procédurale 3D, 7 bâtiments × 3 niveaux, kiwis, œufs, tuto  | ✅         |
| 2     | En ligne Supabase : invité, comptes, serveur qui fait autorité                | ✅ (1)     |
| 3     | Expéditions (vaisseau, provisions), univers partagés, chat d'équipe           | ✅ (1)     |
| 4     | Territoire : gisements finis et renouvelables, camps, logistique, chemins     | ✅         |
| 5     | Menaces et cadeaux du ciel, tourelles à pépins, garnison, dégâts, réparations | ⏭ prochain |
| 6     | Unités et rôles (écoles, guerrier/mage/maire, volants, étages)                | à faire    |
| 7     | Âges (Éden → Pierre → …), foreuses, terraformation sur tuiles éligibles       | à faire    |
| 8     | Saisons, classement, JcJ optionnel, héros, colonisation (boss)                | à faire    |

(1) Le porteur doit encore configurer Supabase (`docs/SUPABASE_SETUP.md`) : les deux migrations,
la fonction `game`, les variables d'environnement Vercel. Le mode en ligne a été testé avec le
mock (`pnpm mock:supabase`), pas encore avec un vrai projet.

## Jalon 5 — menaces et cadeaux du ciel (prochain)

Décisions du porteur (voir `VISION.md`) : gains et menaces ∝ âge × temps de jeu (avant les âges :
niveau du Nid × temps), jamais de colonie rasée mais de gros dégâts possibles, petits incidents
fréquents + grandes vagues **annoncées 8–12 h à l'avance**, protection des débutants, défenses =
**tourelles à pépins** (tuiles au bord de la falaise de peau, munitions consommées) **et
garnison** (kiwis postés, ne récoltent plus). Le ciel apporte aussi du bon (ressources,
technologies plus tard).

Proposition de découpage (à affiner, chaque partie = un commit jouable) :

1. **Moteur (shared)** — `data/threats.ts` (types d'événements, échelle, préavis, protection
   débutant), état `threats` (prochain événement planifié, historique court), planification
   déterministe via le RNG du state, résolution dans `advance` comme un événement de plus
   (exacte hors ligne). Dégâts : bâtiments endommagés (production ×0,5 tant que non réparés,
   commande `repair`), pillage plafonné du stock non protégé, jamais de destruction.
2. **Défenses (shared)** — bâtiment `turret` (tuiles adjacentes à la peau, consomme des pépins
   par vague), job `guard` (garnison, commande `setGarrison`), force défensive = tourelles
   approvisionnées + garnison ; prévisualisation partagée UI/sim (comme `forecastExpedition`).
3. **Cadeaux du ciel** — météorites de ressources (tuile d'impact, ressource à ramasser avec un
   camp ou un bâtiment), annoncées par une étoile filante.
4. **Client** — compte à rebours visible (HUD), zone d'impact sur la carte, modèle de tourelle,
   bâtiments abîmés (fumée), rapport d'attaque, toasts « pendant votre absence ».
5. **Équilibrage + docs** — le bot doit défendre (sinon pertes) ; vérifier qu'un joueur passif
   ne perd jamais tout ; DECISIONS, README, skills.

Questions encore ouvertes à poser au porteur le moment venu : fréquence exacte des petits
incidents, les tourelles tirent-elles automatiquement hors ligne (proposé : oui), peut-on
esquiver (évacuer) une vague.

## Dette et idées en attente

- Le bot d'équilibrage n'utilise ni camps, ni chemins, ni expéditions.
- Réglages graphiques : les camps posés sur le jus flottent un peu.
- Pas de modération automatique du chat (signalements seulement).
