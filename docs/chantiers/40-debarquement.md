# Chantier 40 — Le débarquement — **fait**

> **Fait le 24 octobre 2026** (cinq commits). Voir « Ce qui a été fait » en fin de document et
> la section du chantier 40 dans `DECISIONS.md`.

Acte II « La guerre des faces » du [carnet de route](../CARNET_DE_ROUTE.md). **Simulation +
serveur + interface.** Après le **39** (civilisation alien). Remplace les reconnaissances, les
raids et le siège par **une seule mission**. Le spectacle 3D complet arrive au **41**. Ici, un
rapport 2D sert de replay en attendant.

**Skills à charger** : `kiwar-civ`, `kiwar-expeditions`, `kiwar-online`, `kiwar-battle`, `kiwar-design` (+
`kiwar-colonies` pour la migration du siège, `kiwar-balance` à la fin).

## Intention du porteur

- « Lorsqu'on envoie une expédition, on peut choisir où tenter de débarquer, comme dans
  l'interface actuelle d'état de reconnaissance de la face en 12 parties. À l'arrivée, on libère
  une partie du brouillard de guerre sur cette section pour révéler une portion de la
  civilisation furet / chauve-souris. »
- « Nos kiwis sortent du vaisseau une fois celui-ci posé et sont pris pour cible par les furets
  et chauves-souris aux alentours. » « On oublie les deux modes reconnaissance et raid. »
- « Si nos kiwis meurent, ils sont perdus à tout jamais, le vaisseau ne peut plus revenir, le
  brouillard revient, on ne peut plus consulter les infos des ennemis, et la civilisation adverse
  gagne des ressources. »
- « Si on gagne, les kiwis encore en vie cachent une balise de vision dans le camp adverse,
  remontent dans le vaisseau et reviennent avec du butin. Au passage, ils brûlent quelques
  bâtiments adverses et réduisent leur développement. On pourra toujours consulter cette
  portion depuis notre planète et voir une fraction de l'évolution de cette civilisation. »
- « On garde en mémoire les niveaux des ennemis révélés, leurs stats, et une estimation de leur
  avancée technologique et de leur puissance. »

## Décisions déjà prises (23 octobre 2026)

1. **Ordres avant le départ, combat en direct** : on règle la posture, les cibles prioritaires et
   un seuil de retraite. Le serveur calcule la bataille à l'atterrissage ; le client la rejoue.
2. **Retraite** : si les pertes dépassent le seuil, les survivant·es remontent et le vaisseau
   rentre, sans balise. **Sinon, tout est perdu** : équipage mort pour toujours, vaisseau
   perdu, butin aux aliens, brouillard qui revient.
3. **Une victoire conquiert la parcelle** : balise, bâtiments brûlés, vue permanente. Les
   attaques de balises viennent plus tard dans la partie (chantier 42).
4. Points de détail choisis par défaut (modifiables) :
   - la balise éclaire aussi **le bord des parcelles voisines** ;
   - l'ordre **brûler ou piller** se règle au départ ;
   - les survivant·es d'une retraite rapportent **ce qu'iels ont vu** (un aperçu daté, sans
     balise) ;
   - une **panne retarde** le voyage au lieu d'annuler la mission.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Missions** : raid, recon, assault, reinforce, final, found, retreat (`MISSION_KINDS`). Pour
  l'équipage, `maxCrew` = cargo / 10, moins un kiwi gardé au Nid (`sim/expeditions.ts:462-477`).
  Le temps de voyage dépend de la cible, de l'aire, des technologies et du carburant (`:160-172`).
  - Les pannes sont tirées au départ : le vaisseau arrive à mi-temps et rentre vide
    (`:510-515, 558-572`).
  - L'issue est un seul tirage (`resolveArrival`, `:548-649`). Les morts partent au mémorial
    (`:807-832`).
  - Le butin est limité par la cale (`:620-637`).
- **Siège** (`sim/siege.ts`, skill `kiwar-colonies`) : reconnaissance profonde, assauts, têtes de
  pont (`outpost`), contre-attaques (`planCounter` / `strikeCounter`, `:451-596`), assaut final
  et `conqueredAt`. Les écrans sont `SiegeModal.tsx`, `SiegeParts.tsx` et `SiegeShow.tsx`.
- **Carte des 12 parcelles** : `IntelMap.tsx` (SVG), le brouillard 3D par parcelle
  (`apps/client/src/render/twin.ts:117-173`, masque `uSeen[12]`). Côté interface :
  `ExpeditionModal.tsx`, `ExpeditionsPanel.tsx`.
- En ligne, le client interroge le serveur toutes les 5 s quand un vaisseau a atterri
  (`apps/client/src/game/GameController.ts:549-558`).

## Proposition

### La mission `land`

- Paramètres : la parcelle (0–11), l'équipage (≤ `maxCrew`), les rations, et les **ordres** :
  - posture prudente ou offensive ;
  - priorités : volants, lanceur·euses de sorts, les plus faibles, les bâtiments ;
  - seuil de retraite (30 à 80 % de pertes) ;
  - but : **brûler** ou **piller**.
- Coût : coût de lancement (31) + rations. Il y a toujours un vaisseau par génération ; si on l'a
  perdu, il faut le **reconstruire** (élément de file à l'aire d'envol, coût et temps par
  génération).
- **Prévision honnête** : la force de l'équipage, comparée à ce qu'on sait de la parcelle (aperçu,
  balise voisine, anneau). Le centre affiche « redoutable » sans chiffre si on n'a rien vu.

### L'atterrissage (serveur)

1. Le brouillard se lève : l'**aperçu** de la parcelle (bâtiments, défenseur·euses avec niveaux et
   équipement, au moment de l'atterrissage) devient public dans `state.twinView[parcelle]`.
2. La bataille se joue avec le moteur du 36 : la carte de la parcelle, ses bâtiments, sa
   garnison, et des renforts des parcelles voisines selon l'IA du 39 (une caserne proche par
   exemple).
3. Le journal est rangé dans le rapport de l'expédition.

### Les issues

- **Victoire** :
  - une balise s'allume (vue permanente de la parcelle, mise à jour avec la civilisation, et du
    bord des voisines) ;
  - brûler : une partie des bâtiments part en fumée, ce qui retarde la civilisation (39), avec un
    petit butin ;
  - piller : un gros butin, et peu d'effet sur la civilisation ;
  - les survivant·es rentrent avec beaucoup d'XP et le titre de **vétéran·e** ;
  - le **bestiaire** retient les ennemis vus : type, niveau, équipement, statistiques.
- **Retraite** : les survivant·es rentrent avec l'aperçu, marqué « vu il y a … », qui vieillit
  comme les anciens rapports. Il n'y a pas de balise.
- **Défaite** :
  - les kiwis débarqués meurent pour toujours (mémorial, deuil) et leur équipement est perdu ;
  - le vaisseau est perdu ;
  - la civilisation gagne les rations, le vaisseau et l'équipement (impact du 39) ;
  - le brouillard revient ;
  - on ne garde que la ligne « équipage perdu » dans l'historique.
- **Pannes** : le voyage prend du retard, le vaisseau arrive abîmé (moins de cale), la mission
  continue.

### Retrait des anciennes missions et migration

- Les missions `recon`, `raid`, `assault`, `reinforce` et la reconnaissance profonde
  disparaissent, ainsi que `retreat` et les fiefs.
- `found` (seconde colonie) reste ; `final` est refait au 42 avec le moteur.
- Migration :
  - une expédition en vol rentre avec son équipage ;
  - une tête de pont devient une **balise** et ses gardien·nes rentrent ;
  - les anciens rapports deviennent des aperçus datés ;
  - une face déjà conquise (`conqueredAt`) reste conquise.

### Interface

- Un **écran de débarquement** remplace la planification d'expédition et l'écran Siège :
  - la carte des 12 parcelles (balises, bords éclairés, aperçus datés, anneaux « bord » et
    « centre ») ;
  - le choix de l'équipage, avec la force et l'équipement ;
  - les ordres, le coût et la prévision.
- Le **rapport** donne l'issue, les pertes, le butin, les ennemis vus et un replay 2D simple (le
  3D au 41). Le bestiaire est consultable.
- On peut toucher une parcelle balisée pour voir ses bâtiments et l'âge estimé de la
  civilisation.

## Impact technique

- Simulation et serveur :
  - `sim/expeditions.ts` (mission `land`, issues, impacts), `sim/aliens.ts` (aperçus, balises) ;
  - le retrait de `sim/siege.ts` (sauf `found` et l'utile du 42) ;
  - le bestiaire dans l'état, `publicState` (l'aperçu n'est public qu'après l'atterrissage) ;
  - la migration, les tests (anti-triche, issues, retraite, perte du vaisseau, exactitude
    pendant l'absence), `pnpm build:functions`.
  - Pas de SQL a priori, sinon une nouvelle migration et le SQL à donner au porteur.
- Client : écran de débarquement, rapport et replay 2D, bestiaire, brouillard levé par parcelle
  sur la jumelle 3D (`render/twin.ts`), i18n FR + EN, sons (débarquement, victoire, défaite).
- Bot :
  - il choisit les parcelles en partant du bord, compose des équipages par rôle et règle un seuil
    de retraite ;
  - cibles : une première victoire au bord vers le début de la Pierre ; une première victoire au
    centre vers le Fer ;
  - un débarquement au centre dès l'Éden doit presque toujours échouer.

## Découpage proposé

1. Mission `land`, ordres, coût, vaisseau à reconstruire ; tests.
2. Atterrissage et bataille côté serveur, aperçu public, issues (balise, brûler / piller,
   retraite, défaite), impacts sur la civilisation ; tests anti-triche.
3. Retrait des anciennes missions, migration ; tests de migration.
4. Interface : écran de débarquement, prévision, rapport, replay 2D, bestiaire ; captures desktop
   - téléphone.
5. Bot, sondes (victoires par anneau et par âge, pertes), docs (`kiwar-expeditions`,
   `kiwar-colonies`, `kiwar-battle`), `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- On choisit une parcelle. À l'arrivée, son brouillard se lève et la bataille se joue. La
  victoire laisse une balise qui montre la parcelle pour de bon.
- Une défaite coûte l'équipage, le vaisseau et l'information ; une retraite sauve les
  survivant·es et rapporte un aperçu daté.
- Le centre tue l'imprudent·e, le bord se gagne avec de la préparation (mesure du bot).
- Les anciennes sauvegardes se chargent : têtes de pont → balises, face conquise intacte.
- Aucune donnée de garnison n'arrive au client avant l'atterrissage (test).

## Ce qui a été fait

Questions nouvelles posées au départ :

- **Les kiwis tombés pendant une victoire meurent aussi** (choix du porteur ; pas de blessés).
- **La conquête de la jumelle est fermée jusqu'au 42** (une face déjà conquise le reste,
  `found` marche toujours).

1. Mission `land` (parcelle, ordres, coût, panne qui retarde, vaisseau à reconstruire par une
   réparation de l'aire d'envol) ; moteur de bataille : rôle `assault`, `clearEnds`.
2. Atterrissage où la vérité est tenue, bataille, issues (balise, brûler / piller, retraite et
   aperçu daté, défaite et brouillard), impacts sur la civilisation, bestiaire, vétéran·es,
   prévision par trois batailles d'essai ; sauvegarde v33 ; tests (fuites, serveur, issues).
3. Retrait des anciennes missions ; migration v34 (vols rentrés, têtes de pont → balises,
   rapports → aperçus datés, conquête gardée) ; import sans balises ; objectifs revus.
4. Écran de débarquement (carte des 12 parcelles, fiche de parcelle, ordres, prévision),
   rapport avec replay 2D, bestiaire, brouillard 3D levé par parcelle, sons, FR + EN ; captures
   desktop et téléphone.
5. Bot (bord d'abord, puis le centre une fois son bord éclairé, équipage avec un·e
   anti-volants, plus petit équipage qui gagne les trois essais), sonde de débarquement par âge
   et par anneau, docs et skills.

## Reste

- ⚠️ À tester avec le porteur : le ressenti des ordres (le seuil de retraite surtout), la
  lisibilité de la prévision, la cruauté des morts en victoire, le replay 2D.
- La reconnaissance « sans balise » n'existe plus : seule une retraite rapporte un aperçu. Si
  le jeu manque d'un moyen prudent de voir avant de frapper, une sonde légère (un kiwi, pas de
  combat, aperçu flou) pourrait revenir.
- Les attaques de balises, la reine et la conquête : chantier 42 (le code du siège y sera
  retiré, voir `DETTE.md`). Le spectacle 3D : chantier 41.
