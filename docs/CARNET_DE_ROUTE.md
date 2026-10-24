# Kiwar — carnet de route (octobre 2026)

> La direction du jeu après les retours de partie d'octobre 2026 : pourquoi on change, ce qu'on
> vise, dans quel ordre. Chaque chantier a son document dans [`chantiers/`](chantiers/README.md) ;
> la charte et la science sont dans le skill `kiwar-design` ; l'état d'avancement est dans
> [`PLAN.md`](PLAN.md). Ce carnet se relit au début d'un acte, pas à chaque session.

## 1. Pourquoi ce carnet

Le porteur a joué et le jeu est **trop passif**. On s'ennuie en attendant les âges, il y a peu de
nouveautés entre deux, et les reconnaissances et les vagues stimulent peu. Rien n'incite à
optimiser ses kiwis ni le placement des bâtiments : « j'ai l'impression de gagner et d'être en
sécurité sans rien faire ». Le code et le bot d'équilibrage le confirment (audit du 23 octobre
2026, chemins sous `packages/shared/src/`).

- **Le mur de l'Éden.** Le Nid 4 exige l'âge de Pierre (`data/buildings.ts:545`). On plafonne
  donc à 18 bâtiments, tous au niveau 3 vers **7,4 h**. La Pierre n'arrive qu'à **36 h** : le
  goulot est la recherche (âge de Pierre 1000 points, ~36 points/h). Restent **~29 h sans
  décision utile**, avec des ressources qui s'entassent.
- **Un seul niveau par âge** après l'Éden (le niveau n exige l'âge n−3) et **aucun nouveau
  bâtiment à la Pierre**.
- **Stocks** : le Nid fait 2500 au niveau 3, un entrepôt 3000 (×1,9 par niveau ensuite). Il n'y a
  ni collecte par le·la joueur·euse, ni objectifs après le tutoriel.
- **Danger absent.**
  - 2,5 vagues en 72 h et **0 perte** au bot.
  - La puissance des vagues ignore la richesse et la population, et le préavis est de 8 à 12 h.
  - Les raids sont gagnés à 100 %.
  - Une expédition ne coûte que des rations (180 de jus pour presque toute l'équipe).
- **Moral** : ±20 %, passif, facile à tenir.
- **Conquête abstraite.**
  - Le combat est un seul tirage « force ≥ défense ».
  - Les aliens se résument à un nombre qui grandit avec le temps : ni économie, ni bâtiments, ni
    âge.
  - Le spectacle du siège dure 6,5 s d'effets abstraits.
- **Contenu** : tous les modèles 3D sont du code dans un seul fichier
  (`apps/client/src/render/buildingModels.ts`, 1 524 lignes). Les niveaux 4 à 6 reprennent la
  silhouette du 3, et les chercheur·euses font des allers-retours à vide.

## 2. Ce que disent les études

Le dossier du porteur (préparé avec ChatGPT) a été recoupé avec les sources primaires. Il est
juste à quelques erreurs près, corrigées dans `.claude/skills/kiwar-design/references/science.md`
(pages de Ryan 2006, revue de BANGS, portée de Cutting 2019). Ce qui compte pour Kiwar :

- **Nouveauté et progrès visibles plutôt que réglage fin de la difficulté.** Deux expériences
  préenregistrées (Cutting et al. 2023, n = 311 ; Deterding & Cutting 2023, n = 309) ne trouvent
  aucun effet de l'équilibre difficulté/compétence sur le comportement. Les auteurs désignent la
  nouveauté et le progrès.
- **L'idle fait passer « du jeu à la planification »** : des règles qui laissent partir, d'autres
  qui récompensent le retour (Alharthi et al. 2018, analyse de 66 jeux). Une attente est bonne
  si elle débouche sur une décision.
- **Regarder sa colonie vivre est un plaisir en soi**, celui du jeu délégué (Fizek 2018).
- **Plus le but est proche, plus on accélère** (Kivetz et al. 2006). Une progression déjà
  entamée motive (Nunes & Drèze 2006). Il faut donc des objectifs visibles avec l'étape suivante
  à l'écran.
- **Une perte pèse plus qu'un gain** (Kahneman & Tversky 1979). La mort définitive crée de
  l'investissement et de la tension. Elle frustre, mais elle est au cœur de l'attrait quand on a
  choisi le risque (études sur DayZ : Carter et al. 2013 ; Allison et al. 2015, 1 704 réponses).
- **Les parties difficiles donnent autant envie de continuer, mais frustrent davantage** (Larche
  & Dixon 2020). L'envie de continuer n'est pas le plaisir : on associe la difficulté à de
  l'information et à une porte de sortie.
- **La difficulté ajustée en cachette donne des effets mitigés** (Guo et al. 2024). D'où une
  civilisation alien sur une horloge commune à tout le monde.

Aucune étude ne fixe un « bon » temps d'attente ou un taux de récompense : les chiffres
ci-dessous sont des **hypothèses** à mesurer avec le bot, et à jouer.

## 3. La promesse

**« Une colonie qui a besoin de toi. »** Le look reste cozy ; le jeu est une gestion sous tension
entre **productivité, sécurité et expansion** (`VISION.md`).

- On revient souvent, parce qu'il y a toujours une récolte à rapatrier, un objectif proche, une
  menace annoncée ou un débarquement à préparer.
- On optimise ses kiwis (stats, classes, équipement) et son espace (logistique, défense sur la
  carte, voisinages), parce que les batailles et le moral le récompensent.
- On s'attache à ses kiwis, parce qu'iels vivent sous nos yeux et peuvent mourir pour toujours.

## 4. La courbe de jeu visée

### Par horizon

| Horizon            | Ce que la joueuse ou le joueur fait                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Minute             | toucher un entrepôt plein, poser ou améliorer, choisir une recherche, éclore un œuf            |
| Session (5–20 min) | finir 1 à 3 objectifs de l'âge, préparer la vague annoncée, lancer ou regarder un débarquement |
| Jour               | passer un palier (Nid, niveau), gagner une parcelle, une fête, une comète                      |
| Semaine            | passer un âge, débloquer une classe de maître, l'anneau intérieur                              |
| Mois               | 12 parcelles balisées, la reine, la seconde colonie, puis l'acte IV                            |

### Par âge (joueuse ou joueur attentif ; occasionnel·le ≈ ×1,5)

| Âge       | Arrivée visée | Avant (bot) | L'essentiel de l'âge                                                      |
| --------- | ------------- | ----------- | ------------------------------------------------------------------------- |
| Éden      | 0             | 0           | apprendre, construire vite, premières vagues, premiers objectifs, le soir |
| Pierre    | **~12 h**     | 36 h        | niveaux 4–6, Forge, camp d'entraînement, l'anneau extérieur de la jumelle |
| Fer       | **~3 jours**  | 4,1 j       | niveaux 7–9, fer météorique, Kikiwiwis, l'anneau intérieur, le cabaret    |
| Industrie | **~10 jours** | 7,8 j       | niveaux 10–12, armes à feu, la reine, la seconde colonie                  |

L'Éden se joue **en une soirée** : on gagne le temps au début et on le rend plus tard, comme
dans les idle games. Trois niveaux par âge (Éden 1–3, Pierre 4–6, Fer 7–9, Industrie 10–12), le
Nid suit.

### Hypothèses de mesure (à tester, pas des lois)

- Pendant les 24 premières heures de jeu actif, **pas plus de ~45 min sans action utile**
  possible.
- Une ressource reste **au plafond moins de ~20 %** du temps de jeu actif.
- Au début, les réserves d'entrepôt couvrent **~8 h d'absence**. Au-delà, on stagne, on ne perd
  rien d'autre que ce que les vagues pillent.
- Une colonie qui ne se prépare pas **perd quelque chose** à chaque vague ; une colonie préparée
  perd peu.

## 5. Les décisions du porteur (23 octobre 2026)

| Sujet              | Décision                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Rythme des âges    | Pierre ~12 h, Fer ~3 j, Industrie ~10 j                                                                                          |
| Niveaux            | 3 par âge (1–12), le Nid suit                                                                                                    |
| Réserves           | dans les entrepôts, rapatriées d'un toucher ; elles se remplissent quand le stock est plein (débordement)                        |
| Punition           | pertes réparables : moral, production arrêtée par les réserves pleines, pillage et dégâts ; mort seulement sur une vraie défaite |
| Bataille           | ordres avant le départ, combat calculé par le serveur, joué en direct et cliquable, replay sinon                                 |
| Défaite            | retraite au seuil choisi ; sinon équipage mort pour toujours, vaisseau perdu, butin aux aliens, brouillard                       |
| Civilisation alien | sa propre horloge (dates fixes) ; freinée par nos bûchers, nourrie par nos défaites                                              |
| Parcelle           | une victoire = balise et vue permanente ; plus tard, les aliens peuvent attaquer une balise                                      |
| Moral              | une jauge par kiwi                                                                                                               |
| Rouge-Gorge        | un cabaret façon Moulin-Rouge                                                                                                    |
| Ordre              | Rythme → Guerre des faces → Village vivant → Au-delà                                                                             |

Points de détail choisis par Claude (modifiables) :

- une balise éclaire aussi le bord des parcelles voisines ;
- un ordre « brûler ou piller » au départ ;
- les survivant·es d'une retraite rapportent ce qu'iels ont vu ;
- une panne retarde au lieu d'annuler ;
- les décorations sont hors quota, à coût croissant ;
- la seconde colonie du chantier 19 est conservée.

## 6. Les actes et les chantiers

Une session neuve par chantier, de 4 à 6 commits. « Parallèle » : deux sessions peuvent tourner
en même temps sans toucher les mêmes fichiers. Jamais deux chantiers de simulation en même
temps : chacun régénère le bundle de la fonction serveur et ajoute une version de sauvegarde.

| #   | Chantier                                                                        | Domaine           | Après  | Parallèle     | Skills à charger                       |
| --- | ------------------------------------------------------------------------------- | ----------------- | ------ | ------------- | -------------------------------------- |
|     | **Acte I — Le rythme**                                                          |                   |        |               |                                        |
| 30  | [Paliers, âges et réserves](chantiers/30-paliers-ages-reserves.md)              | sim, client, bot  | —      | 32, 34        | design, sim, ages, balance             |
| 31  | [Objectifs et menaces réveillées](chantiers/31-objectifs-menaces.md)            | sim, client, bot  | 30     | 32, 33, 34    | design, threats, balance               |
| 32  | [Correctifs et ciel](chantiers/32-correctifs-ciel.md)                           | client            | —      | 30, 31        | client, world, sky                     |
| 33  | [Bâtiments par âge et icônes 3D](chantiers/33-batiments-par-age-icones.md)      | client            | 30     | 31, 34        | client, ages                           |
| 34  | [Kiwis et créatures vivants](chantiers/34-kiwis-creatures-vivants.md)           | client            | —      | 30, 31, 33    | client, tasks                          |
|     | **Acte II — La guerre des faces**                                               |                   |        |               |                                        |
| 35  | [Bâtiments sur plusieurs tuiles](chantiers/35-batiments-multi-tuiles.md)        | sim, client, bot  | 30, 33 | —             | sim, titans, client                    |
| 36  | [Moteur de bataille : les vagues en vrai](chantiers/36-moteur-de-bataille.md)   | sim, client, bot  | 34, 35 | —             | design, threats, sim, client           |
| 37  | [Classes, rôles de combat, camp](chantiers/37-classes-roles-camp.md)            | sim, client, bot  | 36     | —             | rpg, battle, design                    |
| 38  | [Forge, équipement, fer météorique](chantiers/38-forge-equipement-fer.md)       | sim, client, bot  | 37     | —             | rpg, battle, threats, ages             |
| 39  | [La civilisation alien](chantiers/39-civilisation-alien.md)                     | sim, serveur, bot | 36     | —             | expeditions, colonies, online, design  |
| 40  | [Le débarquement](chantiers/40-debarquement.md)                                 | sim, serveur, UI  | 39     | —             | expeditions, online, battle, design    |
| 41  | [La bataille en direct sur la jumelle](chantiers/41-bataille-en-direct.md)      | client            | 40     | 43 (prudence) | client, world, battle                  |
| 42  | [La reine des furets](chantiers/42-reine-des-furets.md)                         | sim, client, bot  | 41     | —             | colonies, expeditions, battle, balance |
|     | **Acte III — Le village vivant**                                                |                   |        |               |                                        |
| 43  | [Moral par kiwi, Mairie, feu de camp](chantiers/43-moral-mairie-feu-de-camp.md) | sim, client, bot  | 35     | —             | cycles, rpg, tasks, design             |
| 44  | [Loisirs et décor](chantiers/44-loisirs-decor.md)                               | sim, client       | 43     | —             | cycles, client                         |
| 45  | [Rives fertiles et canaux](chantiers/45-rives-canaux.md)                        | sim, client, bot  | 35     | —             | titans, world                          |
|     | **Acte IV — Au-delà** (section 9, pas encore de chantier)                       |                   |        |               |                                        |

Les skills sont nommés sans le préfixe `kiwar-` ; `battle` (`kiwar-battle`) est créé au chantier 36.

Les anciens chantiers 25 à 29 sont repris :

- 25 → 37 (classes) ;
- 26 → 35 (multi-tuiles) ;
- 27 → 43 (Mairie) ;
- 28 → 38 (fer météorique) ;
- 29 → 45 (canaux).

L'acte I se joue vite (3 sessions de simulation au plus et 3 sessions client, en parallèle).
L'acte II est le gros morceau (8 sessions).

## 7. Table des déblocages par âge

Proposée ici, ajustée par chaque chantier avec le bot. Elle sert à vérifier que **chaque âge
apporte du neuf**.

| Âge       | Bâtiments et systèmes nouveaux                                                                                                                                                                         | Sur la jumelle                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Éden      | producteurs, huttes, entrepôt-réserve (30), Bibliothèque, École, aire d'envol, tourelles ; objectifs (31) ; feu de camp et Mairie au Nid 3 (43) ; premières décorations (44) ; technologie Canaux (45) | anneau extérieur ouvert, très risqué sans préparation (40)                     |
| Pierre    | niveaux 4–6 ; camp d'entraînement, classes avancées et Barde (37) ; Forge, armes de bois et de pierre (38) ; fontaine, statue du maire, jeux (44)                                                      | anneau extérieur à portée (40)                                                 |
| Fer       | niveaux 7–9 ; fer météorique et équipement de fer (38) ; classes de maître (37) ; labo et Kikiwiwis (existants) ; cabaret du Rouge-Gorge, canon à feu d'artifice (44)                                  | anneau intérieur ; la civilisation peut attaquer une balise (42)               |
| Industrie | niveaux 10–12 ; machines, armes à feu (existantes) ; équipement d'acier (38)                                                                                                                           | la reine sort quand les 12 parcelles sont balisées (42) ; seconde colonie (19) |
| Après     | acte IV : Tréfonds, kiwaïs, Verger cosmique                                                                                                                                                            | —                                                                              |

## 8. La guerre des faces en un coup d'œil (actes II, chantiers 36 à 42)

- **Un seul moteur de bataille** (36), déterministe dans `shared`. Il est piloté par des données
  (unités, PV, attaques, portées, cibles sol/air) et par une IA à priorités. Il joue **les
  vagues chez nous** et **les débarquements chez eux**.
  - Il produit un **journal** qui fait foi : le client le rejoue, il ne recalcule jamais.
  - En ligne, le serveur le calcule avec les données cachées (règle anti-triche de
    `kiwar-expeditions`).
- **La civilisation alien** (39) vit sur sa propre horloge.
  - Un état caché est calculé par une fonction pure de la graine secrète, du temps et de nos
    impacts. Elle passe ses âges à des dates fixes, freinée par nos bûchers et nourrie par nos
    défaites.
  - Elle a 12 parcelles (les 6 du bord, faibles ; les 6 du centre, fortes et mieux équipées),
    avec bâtiments et garnisons.
  - Son IA cache ses bâtiments clés dans les parcelles qu'on n'a pas vues.
  - Ses vagues contre nous partent de ses parcelles et suivent sa puissance.
- **Le débarquement** (40), une seule mission qui remplace reconnaissance, raid et siège.
  1. On choisit la parcelle, l'équipage, les rations et les ordres : posture, cibles
     prioritaires, seuil de retraite, brûler ou piller.
  2. Le vaisseau atterrit, le brouillard se lève sur la parcelle et la bataille se joue.
  3. Victoire : les survivant·es plantent une **balise** (vue permanente de la parcelle et du
     bord des voisines), brûlent ou pillent, et rentrent avec le butin et le titre de
     vétéran·e. On garde en mémoire les ennemis vus et une estimation de l'avancée de la
     civilisation.
  4. Retraite : on rentre avec ce qu'on a vu, sans balise.
  5. Défaite : morts pour toujours, vaisseau à reconstruire, gain pour les aliens, brouillard.
- **Le spectacle** (41) : la caméra voyage jusqu'à la jumelle et on voit le village alien
  (généré selon son âge) et les combats.
  - Les kiwis attaquent au bec, à l'épée, à la boule de feu, à la fronde…
  - On touche un ennemi pour voir son niveau, son équipement et ses PV.
  - Absent·e, on regarde le replay.
- **La reine** (42) sort des tréfonds quand les 12 parcelles sont balisées. Bataille finale
  par phases, puis conquête totale et seconde colonie (chantier 19, conservé). Avant cela, au
  Fer, la civilisation peut attaquer une balise : annoncé, défendable.
- **Pourquoi c'est mieux** :
  - une décision tendue remplace deux modes ternes ;
  - la progression se voit sur la carte, du bord vers le centre ;
  - l'horloge alien crée l'urgence sans forcer la connexion ;
  - l'imprudent·e qui vise le centre sans préparation y laisse son équipe.

## 8 bis. Bilan de l'acte II (24 octobre 2026)

L'acte II « La guerre des faces » est terminé : huit chantiers (35 à 42), du 23 au 24 octobre 2026. Mesures : [`BALANCE_REPORT.md`](BALANCE_REPORT.md) (rapport complet de fin d'acte) et
la section du chantier 42 dans `DECISIONS.md` (sonde de conquête sur 21 jours).

### Ce qui a été livré

| #   | Chantier                | Ce que le jeu y gagne                                                                                 |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| 35  | Bâtiments multi-tuiles  | entrepôt, aire d'envol, École, Bibliothèque, labo sur 3 tuiles, monument sur 7 ; murs contournés      |
| 36  | Moteur de bataille      | un seul moteur pur et déterministe ; les vagues jouées pour de vrai, rejouées depuis leur journal     |
| 37  | Classes, rôles, camp    | une arme par classe, trois paliers, auras des bardes et paladins, camp d'entraînement                 |
| 38  | Forge et fer météorique | un stock de fer à part, la Forge et ses pièces par famille et palier, l'équipement qui pèse au combat |
| 39  | Civilisation alien      | sa propre horloge (âges aux jours 1, 4, 12), 12 parcelles, une IA qui cache ses bâtiments clés        |
| 40  | Le débarquement         | une seule mission tendue (parcelle, équipage, ordres, prévision honnête), balises, bestiaire          |
| 41  | La bataille en direct   | le débarquement regardé sur la jumelle : village alien, combattants, balise plantée                   |
| 42  | La reine des furets     | attaques de balises (fortifier, garder), la reine et sa bataille finale à phases, la conquête         |

### Ce que ça change au jeu (au regard de la charte)

- **L'optimisation paie** (charte 5) : stats, classes, équipement, posture et placement des
  tourelles décident de batailles qu'on voit. C'est le plus grand pas de l'acte.
- **Une tension avec information** (charte 6) : chaque bataille a sa prévision par batailles
  d'essai ; on perd par un choix (ordres, équipage, cible), pas par un tirage caché. Le
  journal fait foi partout (serveur, téléphone, bot).
- **Un monde qui a son horloge** (charte 7) : la civilisation passe ses âges à dates fixes,
  nos incendies la freinent, nos défaites la nourrissent, ses vagues et ses attaques de balises
  partent de ses casernes.
- **Des buts lisibles** (charte 8) : la carte des 12 parcelles est le but multi-sessions, la
  reine le but long ; l'écran Conquête les rassemble.
- **Juste et exact** (charte 10) : tout ce qui dépend de la vérité alien ne se résout que là où
  elle est tenue ; les tests le vérifient à chaque chantier.

### Les mesures de fin d'acte

Rapport complet (`pnpm balance --seeds 6 --hours 72 --ages 2 --impact 2 --probe 50`, 81 min)
et sonde de conquête (6 parties × 21 jours) :

| Mesure (joueur·euse attentif·ve)        | Cible               | Fin de l'acte I (31)  | Fin de l'acte II (42)           |
| --------------------------------------- | ------------------- | --------------------- | ------------------------------- |
| Tutoriel                                | 1–1,5 h             | 1,3 h                 | 1,3 h                           |
| Nid 3 / Bibliothèque                    | —                   | 3,7 h / 3,9 h         | 4,5 h / 4,7 h                   |
| Âge de la Pierre                        | ~12 h               | 12,9 h                | 13,6 h (longues : 13,9 h)       |
| Âge du Fer                              | ~3 jours            | 2,8 j                 | 2,8 j                           |
| Âge industriel                          | ~10 jours           | 8,7 j                 | 8,7 j                           |
| Occasionnel·le (Pierre / Fer / Ind.)    | ×1,5 / ×1,5 / ×1,25 | 14,6 h / 3,7 j / 10 j | 18,5 h / 4,0 j / 10,9 j         |
| Kiwisu / Kiwino (économie)              | ±10 %               | 1,4 %                 | ≤ 5,2 % (niveau 10 : 19,7 % ⚠️) |
| Vagues perdues (attentif / occasionnel) | —                   | 8 % / 59 %            | 0 % / 9 %, aucune mort          |
| Temps mort des premières 24 h           | ≤ 45 min            | 70–90 min ⚠️          | 96 min ⚠️                       |
| Première balise / balise du centre      | —                   | —                     | 14–16 h / 35 h–2,9 j            |
| Reine sortie / conquête                 | 2–3 semaines        | —                     | 3/6 (J2,3–J5,4) / 1/6 (J6,8) ⚠️ |
| Kiwis morts au combat en 21 jours       | —                   | —                     | 9 à 99 ⚠️                       |

Ce qui tient : l'économie et les âges (biomes et faces dans ±10 %, sauf le premier kiwi de
niveau 10), les vagues (aucune perdue par le bot attentif, aucune mort de prédateur), les
débarquements du bord (86 à 100 % gagnés par un équipage de l'âge). Ce qui ne tient pas : le
rythme de la conquête, l'usure des kiwis, le temps mort du début de la Pierre (déjà signalé à
l'acte I), un écart de face nouveau sur la jumelle (Kiwino allume ses 12 parcelles en moins de
3 jours dans 5 parties sur 18, Kiwisu jamais en 72 h), et « au plafond » 28 à 41 % du temps en
deltas, hauts plateaux et toundra.

### Ce qui n'a pas marché, ou pas encore

- ⚠️ **Le rythme de la conquête** (cible : 2 à 3 semaines). Le bot conquiert trop tôt (J6,8)
  ou jamais : sur 6 parties de 21 jours, la reine sort dans 3, tombe dans 1 ; trois parties
  restent bloquées à 3–11 balises. La cible est une hypothèse : à jouer.
- ⚠️ **L'usure des kiwis** : « tout kiwi tombé meurt » (40) coûte au bot 9 à 99 kiwis en trois
  semaines ; ses équipages restent jeunes (niveaux 5 à 20) et le centre de la jumelle grandit
  plus vite qu'eux. C'est la première chose à jouer avec le porteur (levier proposé : des
  blessés au lieu de morts quand le terrain est tenu).
- **Le ressenti** n'est validé par personne : horloge alien, prix des pièces, rangs de classe,
  durée et lisibilité des batailles, scène de la reine, images/s sur un vrai téléphone (les
  vérifications visuelles se sont faites en Chromium sans GPU).
- **Dette** listée dans `DETTE.md` : pas de spectacle 3D des attaques de balises, garde non
  dessinée, réparation automatique qui trahit l'issue d'une vague regardée, blindage du
  vaisseau sans usage.

### Leçons pour l'acte III

- **Mesurer tôt sur la durée** : les effets d'un chantier de l'acte II n'apparaissent qu'au
  bout de deux à trois semaines de jeu (l'usure du 40 a bloqué la conquête du 42). Une sonde
  longue (`pnpm --filter @kiwar/balance conquest`) dès qu'un chantier touche aux pertes.
- **Calibrer une bataille sur des armées réelles** : sauvegarder l'état du bot à quelques
  jours et rejouer des variantes en secondes plutôt que des parties de 20 minutes.
- **Un seul moteur** a payé : vagues, débarquements, balises et reine partagent le même
  journal, la même prévision et le même spectacle.
- **L'acte III (le village vivant)** gagne à adoucir l'usure par le moral et les soins
  (Mairie, feu de camp) : les kiwis qui reviennent blessés d'une bataille sont un sujet tout
  trouvé pour le chantier 43.

### Décisions à prendre avec le porteur avant d'aller plus loin

1. Morts ou blessés quand le terrain est tenu (débarquement gagné, balise tenue) ?
2. Le rythme de la conquête : accélérer les joueurs·euses prudent·es (centre moins fort à
   l'Industrie) ou freiner les rapides (reine plus solide) ?
3. Le prix de la fortification (la moitié de deux tourelles du premier niveau de l'âge).
4. L'écart Kiwisu / Kiwino sur la jumelle (à diagnostiquer d'abord : bot ou civilisation).

## 9. Acte IV — Au-delà (intentions, pas encore de chantier)

### Les Tréfonds

Creuser une entrée de tunnel et explorer l'intérieur de notre moitié de kiwi. C'est dangereux et
demande de bonnes stats. On le voit en tournant la caméra : la tranche de la planète montre les
galeries. Une nouvelle classe, **Spéléologue** (Endurance + Dextérité), survit mieux.

Inspiré du vrai fruit (sources vérifiées) :

- **Trois tissus** à traverser : péricarpe externe (chair verte), péricarpe interne (les loges
  et les graines), cœur. Le cœur est fait de très grandes cellules à paroi fine : des cavernes
  blanches.
- **30 à 42 loges** rayonnent autour du cœur : des salles en étoile, chacune avec ses graines
  géantes (ressource rare).
- **Les faisceaux vasculaires** courent du cœur vers la chair : des galeries naturelles, des
  rivières de sève souterraines.
- **Les raphides**, aiguilles de cristal d'oxalate de calcium concentrées près des loges, qui
  blessent vraiment les insectes. Ce sont des forêts de cristaux : une ressource (verre, outils,
  munitions) et un danger (blessures).
- **L'actinidine**, enzyme du kiwi qui digère les protéines. Elle forme des lacs acides
  dangereux pour des oiseaux faits de protéines, et c'est un réactif pour le laboratoire.
- **Au fond, le pédoncule**, l'attache du fruit. Les kiwis poussent sur des **lianes**. Le
  pédoncule mène à la **Liane-Mère**, d'où pendent tous les fruits-planètes : c'est le lien vers
  le Verger cosmique. Dans les tréfonds de la jumelle se terre la reine.

### Les kiwaïs

Le kiwaï (_Actinidia arguta_) est un mini-kiwi lisse qu'on mange entier : le modèle idéal des
**petites planètes artificielles** qu'on lance en orbite aux derniers âges. Chacune est une base
spatiale avec un peu de place, une ressource propre et un risque (pannes, comètes).

### Le Verger cosmique

Une fois sa moitié colonisée, on explore l'espace vite, avec des vaisseaux avancés, par des
**trous de ver** qui suivent la Liane-Mère. On y trouve d'autres **planètes-fruits** : pomme,
framboise, ananas… Chacune a ses habitant·es, ses ressources et ses règles (la framboise en
grappes de petites sphères, l'ananas en écailles). C'est le grand jeu de l'après-conquête.

### Toujours en idée

Ligues (classement), JcJ optionnel dans les univers qui l'autorisent, échanges entre faces
alliées (`VISION.md`).

## 10. Contenu à produire

C'est le vrai coût des actes II et III. Les chantiers 33 et 34 construisent les outils (kit par
âge, animations, effets) pour que chaque nouveau contenu coûte peu.

- **Bâtiments.**
  - Un kit de pièces et de matériaux par âge : écorce et liane à l'Éden, pierre, fer, briques et
    laiton à l'Industrie. Douze niveaux lisibles.
  - Nouveaux bâtiments :
    - camp d'entraînement, Forge, Mairie, feu de camp ;
    - cabaret du Rouge-Gorge ;
    - jeux (quilles de pépins, balançoire en liane, mare aux ricochets : à choisir au 44) ;
    - décorations (fontaine à jus, lampadaires, lampions, statue du maire, massifs, arches de
      liane) ;
    - canon à feu d'artifice ;
    - balise ;
    - plus tard l'entrée de tunnel.
- **Village alien.** Terriers de furets, perchoirs de chauves-souris, ateliers, casernes, totems,
  terrier royal, par âge alien.
- **Créatures.**
  - Des furets par rôle : soldat, éclaireur, brute, chaman.
  - Des chauves-souris par rôle : plongeuse, cracheuse.
  - La reine furet.
  - Armes et armures visibles par âge.
- **Animations des kiwis.**
  - Travail : bec, marteau, lecture, assis·e.
  - Vie : joie, danse, applaudir, manger au feu.
  - Combat : épée, sort, fronde, coup de masse.
  - États : blessé·e, chute.
- **Effets.** Feu, fumée, étincelles, boules de feu, éclairs, impacts (plumes et étoiles, pas de
  sang), incendies, lueur de balise, feux d'artifice à motifs (kiwi-fruit, kiwi-oiseau,
  bouquets), confettis.
- **Sons** (skill `kiwar-audio`, remplaçables depuis `/admin`). Coups et sorts, foule et
  discours, cabaret, feux d'artifice, collecte d'un entrepôt, alarme de vague, débarquement.
- **Icônes.** Rendues depuis les vrais modèles 3D, en silhouette noire tant que c'est verrouillé.

## 11. Tri des retours du porteur

| Retour                                              | Chantier              |
| --------------------------------------------------- | --------------------- |
| Exploration et conquête de la jumelle               | 36, 39, 40, 41, 42    |
| Tunnels et tréfonds                                 | acte IV               |
| Planètes artificielles en orbite                    | acte IV (kiwaïs)      |
| Exploration spatiale, trous de ver, planètes-fruits | acte IV               |
| Design tourelles / chauves-souris                   | 33 / 34               |
| Chargement long au rafraîchissement                 | 32                    |
| Pause après la découpe de l'intro                   | 32                    |
| Esthétique des chemins, champs de graines           | 32                    |
| Caméra bloquée en inclinaison                       | 32                    |
| Ciel en cosmos étoilé, comètes en vrais objets 3D   | 32                    |
| Carte d'expédition par-dessus la file               | 32                    |
| Pop-up des objectifs qui se rouvre                  | 32                    |
| Recherches des âges futurs en « ??? »               | 32                    |
| Peu de changement visuel au niveau 4                | 33                    |
| Icônes = vrais modèles, silhouettes si verrouillé   | 33                    |
| Kiwis qui vivent sur place (recherche, École…)      | 34 (puis 43)          |
| Végétation luxuriante au bord du jus                | 45                    |
| Décorations et animations hors quota                | 43 (feu de camp), 44  |
| Canon à feu d'artifice                              | 44                    |
| Quartier Rouge-Gorge                                | 44 (cabaret)          |
| Camp d'entraînement, changement de classe           | 37                    |
| Forge, armes et armures                             | 38                    |
| Bâtiments de jeux pour le moral                     | 44                    |
| Moral exigeant                                      | 43                    |
| Style idle, réserves à toucher                      | 30                    |
| Pas de nouveaux bâtiments à la Pierre               | 37, 38, 44 (table §7) |
| Pas assez d'attaques et de dangers                  | 31, 36                |
| Jeu punitif (placement, gestion, absence)           | 30, 31, 36, 43        |
| Plus de paliers à la Pierre                         | 30                    |
| Coût d'expédition trop faible                       | 31, puis 40           |
| Entrepôts trop puissants                            | 30                    |
| Ressources inutiles, tempo du début                 | 30, 31                |

## 12. Travailler sans gaspiller de tokens

Chaque session neuve relit `CLAUDE.md`, `PLAN.md`, son chantier et ses skills. Pour qu'une
session fasse le plus possible :

1. **`PLAN.md` reste court** (état, prochain chantier). La dette est dans `DETTE.md`, à lire
   seulement si le chantier y renvoie.
2. **Chaque chantier liste ses décisions déjà prises, les fichiers et symboles à toucher et les
   skills à charger** (2 à 4). La session n'interroge le porteur que sur un point neuf, et ne
   ré-explore pas tout le dépôt : un agent d'exploration au plus.
3. **Équilibrage** : des sondes ciblées pendant le chantier (10 à 30 graines, quelques heures de
   jeu). Le rapport complet (`pnpm balance`, ~2 h) seulement à la fin d'un acte.
4. **Captures** desktop + téléphone seulement pour les parties visibles.
5. **Fin de chantier courte** : mettre à jour le document du chantier, `PLAN.md`, la section de
   `DECISIONS.md` et le skill du domaine, sans tout réécrire.
6. Les chantiers client seuls (32, 33, 34, puis 41) peuvent tourner en parallèle d'un chantier de
   simulation.

Message type pour une session neuve :

> Lis `CLAUDE.md`, `docs/PLAN.md` et `docs/chantiers/NN-….md`, charge les skills qu'il cite et
> réalise le chantier partie par partie. Les décisions sont déjà prises : ne me pose des
> questions que sur un point nouveau.

## 13. Mesurer et tester

- **Bot** (chantier 30, skill `kiwar-balance`) :
  - nouvelles mesures « temps mort » (la plus longue période sans action utile possible
    pendant qu'on joue), « temps au plafond » (part du temps où une ressource est pleine) et
    « production perdue » (réserves pleines) ;
  - pertes par vague et par débarquement ;
  - par profil : attentif·ve, occasionnel·le (une visite toutes les 8 h).
- **Jeu réel** : ce qui touche aux émotions (tension, frustration, plaisir) ne se valide pas par
  simulation.
  - Le porteur et ses ami·es jouent les 12 premières heures après l'acte I, puis un débarquement
    après le 41.
  - On note ce qui ennuie, ce qui frustre, ce qui donne envie de revenir. On distingue « j'ai
    envie de continuer » de « j'ai aimé ».
  - Le questionnaire BANGS est possible (compétence, autonomie, frustration).
- Chaque réglage passe la **grille de décision** du skill `kiwar-design` et se note dans
  `DECISIONS.md`.
