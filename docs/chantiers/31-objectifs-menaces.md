# Chantier 31 — Objectifs et menaces réveillées

Acte I « Le rythme » du [carnet de route](../CARNET_DE_ROUTE.md). **Simulation + client + bot.** À
lancer **après le 30** (réserves, paliers).

**Skills à charger** : `kiwar-design`, `kiwar-threats`, `kiwar-balance` (+ `kiwar-client` pour la
partie 2, `kiwar-expeditions` pour la partie 4).

## Intention du porteur

- « La sensation d'avoir toujours des choses à faire et gérer. »
- « Pas assez d'attaques, pas assez de dangers, j'ai l'impression de gagner et d'être en sécurité
  sans rien faire. L'annonce d'une bataille doit émoustiller le joueur et lui demander au moins
  de faire quelques actions. »
- « Le jeu doit être punitif si on fait les mauvais choix ou qu'on ne joue pas assez. Chaque
  punition est rattrapable mais on doit sentir que le village a besoin de nous. »
- « Coût d'une expédition pas assez cher : 180 de jus pour presque toute l'équipe, alors que j'en
  ai 10 000. »

## Décisions déjà prises (23 octobre 2026)

1. **Pertes réparables** : moral, pillage, dégâts, blessures ; un kiwi ne meurt que sur une vraie
   défaite (règle existante : au plus un mort, menace > 2× la défense). Jamais de colonie
   bloquée.
2. Toute menace reste **annoncée** et a **au moins deux réponses** (`VISION.md`).
3. Les réserves d'entrepôt (chantier 30) sont **pillées en premier**.
4. Le combat des vagues reste une formule ici ; le **moteur de bataille** (chantier 36) la
   remplacera, avec les mêmes leviers.
5. Pas de récompense de connexion quotidienne ni de pression de connexion (garde-fous de
   `kiwar-design`).

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Objectifs** : seulement les 10 étapes du tutoriel (`data/objectives.ts:17-60`, récompenses
  15–100, `claimObjective` dans `sim/commands.ts:661-668`) ; panneau `ObjectivesPanel` côté
  client (sa réouverture est corrigée au chantier 32).
- **Vagues** (`data/threats.ts:11-72`, `sim/threats.ts`) : première vague ≥ 24 h de jeu et Nid 2,
  intervalle 20–28 h, préavis 8–12 h (+4 h Guetteur d'étoiles), bouclier 24 h après une défaite
  (`planWave` ~509-531). Puissance = 6 × facteur du Nid × âge × (1 + 0,25 × jours, ≤ 14) × (1 +
  0,08 × victoires de raid) : **sans lien avec la richesse**. Issue (`waveOutcome` ~379-436) :
  pillage 35 % × sévérité au-dessus de la part protégée, 1–4 bâtiments abîmés, blessures, au plus
  un mort. Le bot ne perd rien (`tools/balance/src/bot/defense.ts:57-79`).
- **Expéditions** : coût = rations seulement (`sim/expeditions.ts:213-224`), carburant de
  poussière optionnel (`sim/commands.ts:685-711`).

## Proposition (chiffres à régler avec le bot)

### Le carnet d'objectifs

- Trois horizons toujours visibles (gradient du but, skill `kiwar-design`) :
  - **Prochaine étape** : une suggestion immédiate calculée (le goulot de production, un
    entrepôt plein, une vague à préparer) ;
  - **Objectifs de l'âge** : 6 à 10 par âge, 3 affichés à la fois, avec récompense (ressources,
    poussière, parfois un œuf offert) ; ils apprennent les systèmes de l'âge (poser un
    entrepôt-réserve, monter un producteur au palier 3, repousser une vague sans perte, former
    un mage, gagner un débarquement…) ;
  - **Grand objectif** : le passage à l'âge suivant, avec ses étapes (recherche, monument) et une
    barre de progression.
- Données dans `data/objectives.ts` (prédicats purs sur l'état), réclamation par
  `claimObjective` (existant), le tutoriel devient le premier lot de l'Éden.

### Les vagues réveillées

- **Plus tôt et plus souvent** : première vague après ~6–8 h de jeu (Nid 2), puis toutes les
  12–18 h ; préavis **3–6 h** (+2 h Guetteur d'étoiles) : assez pour agir pendant une session,
  sans rester des heures sous alerte.
- **Puissance indexée sur la richesse** : un terme qui suit la valeur stockée (stock + réserves),
  la somme des niveaux et la population, en plus du Nid et de l'âge ; le terme « jours » est
  adouci (il disparaîtra au chantier 39, remplacé par la puissance de la civilisation alien).
- **Pillage** : les réserves d'abord (non protégées), puis le stock au-dessus de la part protégée
  du Nid.
- **Actions pendant le préavis** (déjà possibles ou neuves) : poster la garnison, remplir les
  tourelles en graines, abriter, réparer, **rapatrier les réserves** (elles deviennent alors du
  stock, en partie protégé), poser ou monter une tourelle.
- Cible : une colonie qui ne fait rien perd quelque chose (ressources, un bâtiment abîmé) ; une
  colonie préparée perd peu ou rien ; aucune vague ne tue sans une vraie défaite.

### Le coût des expéditions (en attendant le chantier 40)

- Un **coût de lancement** par kiwi embarqué (fibre + jus, × génération du vaisseau et âge), en
  plus des rations ; ordre de grandeur : une équipe complète d'une aire 4 coûte quelques milliers
  de ressources, pas 180. Affiché dans le planificateur avant le départ.

## Impact technique

- Simulation (skills `kiwar-threats`, `kiwar-sim`) : `data/objectives.ts` (lots par âge,
  prédicats), sélecteur « prochaine étape », `data/threats.ts` et `sim/threats.ts` (`planWave`,
  puissance, pillage des réserves), `sim/commands.ts` (coût de lancement), tests ; bundle
  serveur. Pas de SQL.
- Client (skill `kiwar-client`) : panneau d'objectifs à trois horizons (compact sur téléphone,
  dans `MobileNav.tsx`), notification discrète d'un objectif fini, alerte de vague qui liste les
  actions possibles (bouton « Rapatrier les réserves »), coût de lancement dans
  `ExpeditionModal.tsx`, i18n FR + EN.
- Bot : réclame les objectifs ; se prépare aux vagues (profil attentif) ou non (profil
  occasionnel) ; mesure des pertes par vague ; nouvelles cibles.

## Découpage proposé

1. Objectifs : données par âge, prédicats, prochaine étape, réclamation ; tests.
2. Client : panneau à trois horizons, notifications, i18n ; captures desktop + téléphone.
3. Vagues : calendrier, préavis, puissance indexée sur la richesse, pillage des réserves ; tests
   (exactitude hors ligne, jamais de mort sans défaite, bouclier).
4. Expéditions : coût de lancement, affichage du planificateur ; tests.
5. Bot, sondes ciblées, docs (`kiwar-design` economy-map, `kiwar-threats`, `kiwar-balance`),
   `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- À tout moment, l'écran montre une prochaine étape, trois objectifs de l'âge et la progression
  vers l'âge suivant.
- La première vague arrive dans la première journée ; son annonce propose des actions claires.
- Bot occasionnel non préparé : pertes > 0 sur la plupart des vagues ; bot attentif préparé :
  pertes faibles ; aucune mort hors vraie défaite.
- Une expédition coûte un prix sensible, visible avant le départ.
- Rapport à ±10 % entre Kiwisu et Kiwino.
