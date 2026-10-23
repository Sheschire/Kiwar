# Chantier 36 — Moteur de bataille : les vagues jouées pour de vrai

Acte II « La guerre des faces » du [carnet de route](../CARNET_DE_ROUTE.md). **Simulation + client +
bot.** Après le **34** (animations, créatures, effets) et le **35** (empreintes des bâtiments). Un
seul moteur servira aux vagues chez nous (ici) et aux débarquements chez eux (chantier 40).
**Ouvre un nouveau domaine** : créer le skill `kiwar-battle`.

**Skills à charger** : `kiwar-design`, `kiwar-threats`, `kiwar-sim`, `kiwar-client` (+
`kiwar-balance` pour la dernière partie).

## Intention du porteur

- « Visuellement on voit en temps réel les batailles entre les deux camps. Les kiwis normaux
  envoient des coups de bec, les guerriers se battent à l'épée, les mages lancent des boules de
  feu. On peut cliquer sur les ennemis pour voir leurs niveaux, équipements, etc. Il faut une IA
  qui les guide pour savoir quoi prioriser. »
- « L'annonce d'une bataille doit émoustiller le joueur et lui demander au moins de faire
  quelques actions. »
- « Le jeu doit être punitif si on fait les mauvais choix de placement de bâtiment. »

## Décisions déjà prises (23 octobre 2026)

1. **Ordres avant, combat en direct** : on règle avant la bataille ; la bataille est **calculée
   d'un coup** au moment de l'impact (ou de l'atterrissage), puis **jouée** en temps réel par le
   client, cliquable ; absent·e, on la revoit en replay.
2. Le **journal** de la bataille fait foi : le client ne recalcule jamais (en ligne, le serveur
   calcule avec les données cachées ; en solo, le client calcule comme aujourd'hui).
3. Pertes réparables chez nous (charte de `kiwar-design`) : les kiwis tombés pendant une vague à
   la maison sont **blessé·es** ; une mort seulement sur une vraie défaite (règle actuelle :
   menace > 2× la défense, au plus un mort, plus de 4 kiwis).
4. Impacts mignons (plumes, étoiles), pas de sang.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Vagues** (`sim/threats.ts`, `data/threats.ts`, skill `kiwar-threats`) : la défense est une
  somme (tourelles du secteur attaqué × munitions × palissade, milice 0,15 × force, garnison
  1,5 × force × affinité de classe) et l'issue une formule (`waveOutcome` ~379-436 : pillage,
  1–4 bâtiments abîmés, blessures, au plus un mort). Vagues orientées par secteur (chantier 12),
  garnison automatique 40 min avant (`threats.ts:131`).
- **Force d'un kiwi** : `kiwiStrength` (`sim/kiwis.ts:193`, Force, Endurance, niveau, classe).
- **Expéditions** : un seul tirage (`resolveArrival`, `sim/expeditions.ts:548-649`).
- **Spectacle** : `apps/client/src/render/predators.ts:94-96` fait courir les furets et plonger
  les chauves-souris d'après le rapport, sans vrai combat.

## Proposition

### Le moteur (`packages/shared/src/battle/`)

- **Pur et déterministe** : `simulateBattle(setup, seed) → BattleLog`, pas de 0,5 s, durée bornée
  (~4 min), hasard par graine (comme le reste de `shared`).
- **Carte** : la grille hexagonale de la face (`faceMapOf`), avec les empreintes et l'index
  d'occupation du 35 : les bâtiments bloquent, se ciblent et s'abîment ; 2 à 3 unités au plus
  par tuile ; marche par champ de distance vers la cible.
- **Unités pilotées par des données** (`data/units.ts`) : PV, attaque (dégâts, portée en tuiles,
  recharge, corps à corps / distance / zone, peut toucher les volants), armure, vitesse, taille.
  Pour un kiwi, le profil se calcule depuis ses stats, son niveau, sa classe et (au 38) son
  équipement :
  - Force → coups ; Endurance → PV ; Agilité → vitesse et esquive ;
  - Dextérité → précision à distance ; Esprit → puissance des sorts.
  - Sans classe : **coup de bec** ; guerrier·ère : **épée** ; mage : **boule de feu** (zone,
    touche les volants) ; éclaireur·euse : rapide ; bâtisseur·euse : masse (les autres classes
    au 37).
  - Furets : soldat, éclaireur, brute (et plus tard chaman) ; chauves-souris : plongeuse,
    cracheuse. Tourelles : unités fixes avec munitions (graines).
- **IA par priorités** :
  - assaillants : piller (réserves, puis stock), abîmer, repousser ce qui bloque ;
  - défenseur·euses : intercepter, protéger, et les tireur·euses visent d'abord les volants.
  - Une **posture** par camp : prudente (tenir près des tourelles) ou offensive (charger).
  - Un **seuil de retraite** (servira au débarquement).
- **Journal compact** : unités de départ, puis événements par pas (déplacement, attaque, dégâts,
  chute, retraite, bâtiment abîmé, butin pris), puis bilan.
  - Budget : quelques dizaines de ko pour 60 contre 60.
  - Calcul en quelques dizaines de ms (fonction serveur et téléphone).

### Les vagues à la maison

- `waveOutcome` est remplacé par une bataille sur le **secteur attaqué**. Les unités en jeu :
  - les furets et chauves-souris annoncés ;
  - les tourelles du secteur ;
  - la garnison postée (avec sa posture) ;
  - la milice des kiwis présents dans le secteur, au coup de bec.
    Les kiwis abrités ne sont pas des cibles.
- L'issue vient de ce qui s'est passé : bâtiments atteints et abîmés, butin pris là où les
  ennemis sont arrivés (les réserves d'abord, chantiers 30–31), kiwis tombés blessés. On garde
  les garde-fous de mort et le bouclier.
- **Le placement compte** : un entrepôt près du bord est pillé en premier, des tourelles mal
  placées ne couvrent pas le secteur, un Nid bien entouré tient mieux.
- **Préparer pendant le préavis** :
  - les actions existantes : poster la garnison par secteur, remplir les tourelles, abriter,
    rapatrier les réserves, réparer ;
  - en plus, la **posture** de la garnison.
- Exact hors ligne : la bataille est un événement d'`advance` au moment de l'impact (le moteur
  est pur).

### Le spectacle

- `render/battle/` rejoue le journal avec les animations et les effets du 34 : barres de vie,
  toucher une unité ouvre sa fiche (niveau, PV, classe, équipement), vitesse ×1/×2/×4, passer.
- Présent·e à l'impact : la bataille se joue en direct depuis l'instant T. Si on arrive en
  cours, on la prend en route ou on rembobine. Absent·e : on la revoit en replay depuis le
  rapport (les 5 dernières sont gardées).
- L'interface ne dévoile pas l'issue avant la fin du spectacle quand on le regarde.

## Impact technique

- Simulation :
  - nouveau module `battle/` ;
  - `data/units.ts` ;
  - `sim/threats.ts` : montage de la bataille et application de l'issue ;
  - rapports de vague avec journal (taille bornée) ;
  - tests : déterminisme, budget de temps, garde-fous de mort, même colonie avec une tourelle
    déplacée → issue différente ;
  - `pnpm build:functions`.
  - Pas de SQL (l'état est en JSON ; surveiller la taille de l'état avec les journaux).
- Client : `render/battle/` (unités instanciées, effets), fiche d'unité, carte de vague avec
  posture et actions, replay, i18n FR + EN, sons de combat (skill `kiwar-audio`).
- Bot : poster et choisir la posture ; mesure des pertes par vague ; Kiwisu et Kiwino à ±10 %.

## Découpage proposé

1. Moteur : unités, marche, attaques, IA, journal ; tests de déterminisme et de budget.
2. Vagues par le moteur : montage depuis l'état, issue, garde-fous, rapport ; tests.
3. Spectacle 3D : rejouer, direct, rembobiner, replay, fiches d'unité.
4. Préparation : posture, carte de vague, actions ; captures desktop + téléphone.
5. Bot, sondes ciblées, réglage des profils d'unités.
6. Skill `kiwar-battle` (moteur, données, journal, règles d'or) ; docs `kiwar-threats`,
   `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- Une vague se voit vraiment : furets qui courent, gardes qui frappent, mages qui lancent des
  boules de feu, tourelles qui tirent ; on touche un furet pour voir son niveau.
- Le placement et la préparation changent l'issue (test et sonde du bot).
- Un même `setup` et une même graine donnent le même journal ; le budget de calcul est tenu.
- Aucune mort hors vraie défaite à la maison ; images/s acceptables pendant le spectacle.
