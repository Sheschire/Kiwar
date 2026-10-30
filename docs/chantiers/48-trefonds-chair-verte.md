# Chantier 48 — Les Tréfonds I : l'entrée de tunnel et la chair verte

> **Fait** (30 octobre 2026). Ce qui a été fait, ce qui reste et les mesures : section « Bilan »
> en fin de fiche ; le savoir-faire est dans le skill `kiwar-depths`.

Acte IV « Au-delà » du [carnet de route](../CARNET_DE_ROUTE.md) (section 9, « Les Tréfonds »).
**Simulation + serveur + client (écran 2D) + bot.** Après le **47**. Il ouvre un domaine : il
crée le skill **`kiwar-depths`**.

**Skills à charger** : `kiwar-design`, `kiwar-sim`, `kiwar-expeditions` (missions,
anti-triche), `kiwar-battle`, `kiwar-rpg` (classe), `kiwar-threats` (remontées).

## Intention du porteur

« Creuser une entrée de tunnel et explorer l'intérieur de notre moitié de kiwi. C'est dangereux
et demande de bonnes stats. On le voit en tournant la caméra : la tranche de la planète montre
les galeries. Une nouvelle classe, Spéléologue (Endurance + Dextérité), survit mieux. »
(carnet, section 9)

La vue en coupe est le [chantier 49](49-la-tranche.md) ; ici, la mécanique et un écran 2D.

## Décisions déjà prises

1. **Les Tréfonds s'ouvrent au Fer, par couches** (porteur, 26 octobre 2026) :
   - la **chair verte** (péricarpe externe) à l'âge du Fer, ici ;
   - les **loges** (péricarpe interne) à l'Industrie ([chantier 50](50-trefonds-loges.md)) ;
   - le **cœur et le pédoncule** à l'Âge des étoiles ([chantier 52](52-trefonds-coeur-pedoncule.md)).
     Ils remplissent la longue attente entre le Fer et l'Industrie (jours 3 à 10) avec des
     décisions neuves.
2. **Un réseau de salles sous brouillard, exploré par des descentes** (porteur) :
   - une descente se prépare comme un débarquement : équipage, rations, posture, seuil de
     retraite, et une prévision honnête par batailles d'essai ;
   - elle se joue avec le moteur du chantier 36, plus des **dangers** du lieu ;
   - une salle prise devient une **galerie**, où l'on poste des mineur·euses.
3. **Remontées annoncées** (porteur) : des créatures des profondeurs peuvent remonter par
   l'entrée de tunnel. Ce sont des vagues annoncées qui sortent par une nouvelle porte. Deux
   parades au moins : fermer ou fortifier l'entrée, ou y poster une garde.
4. **Spéléologue** (défaut de Claude, modifiable) : une **septième classe de maître** au
   palier 3, Endurance + Dextérité. Cette paire est libre parmi les classes de maître
   existantes. Elle arrive au Fer, au camp d'entraînement, avec la famille d'arme masse (le
   pic).
5. **Pertes** (règle du 46, défaut) : sur une salle gagnée, les tombé·es reviennent blessé·es ;
   sur une retraite ou une défaite, iels meurent. Toute descente se prévoit (charte 6).
6. **Juste et exact** : ce que contient une salle non vue est **caché**. Le contenu est tiré
   d'une graine secrète, comme la civilisation, et ne se résout que là où la vérité est tenue :
   le serveur en ligne, le client en solo. Le client n'en reçoit que la vue publique.

## Inspiré du vrai fruit (carnet, section 9)

- La chair verte est traversée par les **faisceaux vasculaires** : des galeries naturelles et des
  rivières de sève qui vont du cœur vers la peau.
- Plus bas, les **raphides** (aiguilles d'oxalate de calcium) et l'**actinidine** (une enzyme qui
  digère les protéines) apparaissent surtout autour des loges, donc au chantier 50. La chair
  verte n'en a que des poches.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Pas de sous-sol** : la face est un disque hexagonal de rayon 12 (`DEFAULT_FACE_PARAMS`,
  `worldgen/generateFace.ts` ~26), lu par `faceMapOf` (`sim/territory.ts` ~78). Les seuls
  « tunnels » existants sont ceux de la reine (`SIEGE.final.tunnels`), sans carte.
- **Missions** : `land | found | guard | final` (`sim/expeditions.ts`, `sim/landing.ts`).
  Elles comprennent les verrous (`landingLock`), la prévision publique (`landingForecast`), la
  résolution où la vérité est tenue (`resolveLanding`), les vues publiques (`state.faceViews`)
  et le bestiaire (`state.bestiary`). C'est le modèle à suivre, sans vaisseau : on part de
  l'entrée de tunnel.
- **Moteur** : `battle/simulate.ts` (`simulateBattle(setup, seed)`), les ennemis dans
  `data/units.ts` (`ENEMY_KINDS`, `ENEMIES` ~219-243). Un nouveau cadre de bataille se fait sur
  le modèle de `battle/landing.ts`.
- **Classes** : `data/classes.ts` (`CLASS_IDS` ~11, `master(...)`, `CLASS_RULES.statMin`). Les
  classes de maître existantes sont : ingénieur·e, paladin, druide, rôdeur·euse, titan, oracle.
  Une nouvelle classe touche `CLASS_FAMILY` (`data/gear.ts` ~54), `CLASS_WEAPONS`
  (`data/units.ts` ~312), la carte sol/air de `data/threats.ts` ~167, `CLASS_CLIP`
  (`render/kiwis.ts`), `CAPES` (`render/anim/kiwiRig.ts`) et l'i18n.
- **Vagues** : portes et escouades fixées à l'annonce (`waveSetup`, skill `kiwar-battle`).
  L'entrée de tunnel serait une porte de plus.
- **Postes** : les postes de travail hors carte suivent `sim/posts.ts` (cratères, poussière) et
  `sim/tasks.ts` (skill `kiwar-tasks`).
- **Sauvegarde** : `SCHEMA_VERSION` 38 (`sim/state.ts`) ; on passe à v39 au moins si le
  chantier 47 n'a rien ajouté.

## Proposition (point de départ, à chiffrer en session)

- **Technologie « Spéléologie »** (branche exploration, âge du Fer), puis le bâtiment **Entrée
  de tunnel**. Il prend 1 tuile de chair, n'en existe qu'un, et a des niveaux du Fer qui
  augmentent l'équipage d'une descente et la solidité de la porte.
- **`state.depths`** : un graphe de salles généré par la graine de la face.
  - Couche « chair » : ~10 à 14 salles, d'une profondeur de 1 à 3.
  - Types de salle : faisceau (galerie, rivière de sève), poche de sève, nid (créatures),
    éboulis (danger : chute), poche de raphides (danger : coupures).
  - Une **vue publique** (`depthViews`) garde les salles vues, la date de l'aperçu et les bords
    voisins éclairés, comme les balises.
- **Créatures des profondeurs** (une nouvelle famille d'ennemis, nommée en session) : larves
  (sol), mouches des fruits (air), cloportes blindés (brute). Elles s'ajoutent au bestiaire.
- **Descente** (mission `delve`) : on choisit la salle (voisine d'une galerie ou de l'entrée),
  l'équipage (au plus la capacité de l'entrée), les rations et les ordres. La durée est courte
  (1 à 3 h aller). La résolution combine une bataille et des dangers ; chaque danger est un
  tirage visible dans la prévision, atténué par l'Endurance et la Dextérité, et le·la
  Spéléologue le divise.
  - **Victoire** : une galerie, du butin (pulpe, fibre, jus, un peu de fer), l'XP, la vue des
    bords.
  - **Retraite / défaite** : règle du 46.
- **Galerie** : un poste de mineur·euses (tâche `mine`, la Dextérité), qui produit selon le type
  (sève → jus, faisceau → fibre). Ce poste ne gèle pas l'hiver, mais ses kiwis ne sont pas à la
  surface : ni garnison, ni soirée. C'est l'arbitrage productivité contre sécurité et moral.
- **Remontées** : une fois l'entrée ouverte, une vague de créatures peut monter, annoncée 6 h
  avant, plus forte avec le nombre de nids voisins non pris. Elle sort par la porte du tunnel.
  - Parades : **fermer** l'entrée (aucune descente ni mine pendant la fermeture), la
    **fortifier** (comme une balise), ou y **poster une garde**, plus les tourelles voisines.
  - Le pillage commence par les réserves, comme toujours.
- **Spéléologue** : la classe de maître Endurance + Dextérité, au camp, au Fer. Compétences
  proposées : « Pas sûr » (dangers ÷ 2 pour soi, −25 % pour l'équipe) et « Lanterne » (une
  descente révèle aussi le contenu d'une salle voisine).
- **Écran Tréfonds (2D)** : le graphe en coupe, les salles vues, les galeries, le planificateur
  de descente et les rapports avec le rejeu 2D (comme le rapport d'une attaque de balise). La
  3D est au 49.

## Grille de décision (kiwar-design)

- **Boucles** : stratégie (descente), économie (galeries), progression (classe) ; horizon session
  et multi-sessions.
- **Robinets et puits** : les galeries produisent des ressources existantes, sans nouveau stock.
  Les descentes coûtent des rations et de l'usure. À surveiller : « au plafond » ne doit pas
  remonter.
- **Décisions créées** : quelle salle, quel équipage, qui descend à la mine plutôt que de garder
  la surface, fermer ou défendre l'entrée.
- **Punition** : les remontées sont annoncées, avec trois parades ; la mort n'arrive que sur une
  vraie défaite.
- **Absence** : 8 h, 24 h, 3 jours. Les mines produisent ; une remontée non défendue pille les
  réserves et blesse.
- **Mesure** : le jour de la première descente (cible ~jour 3–4), les salles prises en 10 jours,
  les remontées perdues (≤ 10 % pour l'occasionnel·le), les morts, l'Industrie (inchangée à
  ±5 %).

## Découpage proposé

1. **Données et état** : la technologie, l'entrée de tunnel, la génération du graphe (graine
   secrète, vue publique), la sauvegarde ; tests de déterminisme.
2. **Descentes** : la mission `delve`, le cadre de bataille et les dangers, la prévision
   publique, la résolution là où la vérité est tenue (serveur, `pnpm build:functions`) ; tests.
3. **Galeries et mines** : le poste `mine` dans `sim/tasks.ts`, un débit exact hors ligne ;
   tests.
4. **Spéléologue** : la classe, les compétences et toutes les tables de classe.
5. **Remontées** : la porte du tunnel dans les vagues, fermer / fortifier / garder ; tests.
6. **Client** : l'entrée de tunnel (modèle par âge), l'écran Tréfonds 2D, le planificateur, les
   rapports, `MobileNav`, l'i18n FR + EN ; captures desktop et téléphone.
7. **Bot, sondes, docs** : le bot descend et défend, une sonde 6 × 10 jours ; création du skill
   `kiwar-depths`, puis `DECISIONS.md` et `PLAN.md`.

## Critères d'acceptation

- Au Fer, on creuse une entrée, on prévoit et on lance une descente ; la salle prise devient une
  galerie où l'on poste des kiwis.
- Le contenu d'une salle non vue n'arrive jamais au client en ligne (test anti-triche).
- Un·e Spéléologue change visiblement la prévision d'une descente dangereuse.
- Une remontée est annoncée et a trois parades ; l'occasionnel·le en perd au plus une sur dix.
- L'Industrie du bot attentif ne bouge pas de plus de 5 % ; l'économie reste dans ±10 % entre
  faces et biomes.

## Bilan (30 octobre 2026)

**Fait** (sept commits, un par partie) :

1. Données et état : `data/depths.ts`, la technologie Spéléologie, l'entrée de tunnel (hors
   quota, trois niveaux du Fer), le réseau public (`depthsMapOf`), le contenu caché
   (`roomTruth`, `depthSeed`), les Grouillants (larve, mouche des fruits, cloporte), la
   sauvegarde v39.
2. Descentes : la mission `delve`, le cadre de bataille et les dangers (chutes, coupures), la
   prévision honnête, la résolution là où la vérité est tenue.
3. Galeries et mines : le poste `mine`, son débit exact hors ligne, l'automatisation.
4. Spéléologue : la septième classe de maître, « Pas sûr » et « Lanterne ».
5. Remontées : leur calendrier, l'annonce qui attend la vérité, la sortie par l'entrée, la
   porte (fermer, fortifier, garder), `comingWave`.
6. Client : l'écran Tréfonds (coupe 2D, salle, planificateur, mines, porte, descentes), les
   rapports avec rejeu, le modèle 3D de l'entrée, les Grouillants dans les batailles, l'i18n.
7. Bot (mécanique `depths`), sondes, réglages, skill `kiwar-depths`.

**Réglages trouvés par les sondes** : le premier jet laissait prendre les 11 salles en deux
jours (salles profondes durcies : puissance 9 / 20 / 36, niveaux 3 / 7 / 11, 1 h / 3 h / 5 h de
descente) ; une galerie rapportait trente fois moins qu'un atelier (le rendement suit
maintenant le producteur de sa ressource) ; la porte fortifiée au prix d'une balise vidait la
fibre de la Bibliothèque 7 (moitié prix, et le bot ne fortifie qu'une cause perdue) ; les
équipages prenaient les chercheur·euses (le bot les laisse) ; l'entrée sort du quota.

**Reste** (pour plus tard) :

- les Grouillants ont leurs propres modèles et la descente en direct : chantier 49 ;
- des objectifs d'âge liés aux Tréfonds (« prendre une salle ») et des sons propres ;
- les Tréfonds de la seconde colonie (noté au 58) ;
- le ressenti des dangers, la difficulté des salles et la fréquence des remontées : à jouer
  avec le porteur.
