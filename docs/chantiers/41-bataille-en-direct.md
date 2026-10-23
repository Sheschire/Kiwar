# Chantier 41 — La bataille en direct sur la jumelle

Acte II « La guerre des faces » du [carnet de route](../CARNET_DE_ROUTE.md). **Client seul.** Après
le **40** (mission, journal, aperçus). Il peut tourner en parallèle du 43, avec prudence (le 43
touche aussi `render/kiwis.ts`).

**Skills à charger** : `kiwar-client`, `kiwar-world` (espace, voyage de caméra, jumelle),
`kiwar-battle`.

## Intention du porteur

« Visuellement on voit en temps réel le débarquement et les batailles entre les deux camps. Les
kiwis normaux envoient des coups de bec, les guerriers se battent à l'épée, les mages lancent des
boules de feu. On peut cliquer sur les ennemis pour voir leurs niveaux, équipements, etc. en
temps réel si on est devant l'écran à ce moment. » « On doit générer les visuels de leur
civilisation au moment de la découverte. »

## Décisions déjà prises

- Le client **rejoue** le journal calculé par le serveur ; il ne recalcule jamais.
- Présent·e à l'atterrissage, on voit la bataille en direct ; sinon on la revoit en replay depuis
  le rapport.
- Impacts mignons (plumes, étoiles), pas de sang.

## État actuel (chemins sous `apps/client/src/render/`)

- La jumelle a une place fixe dans l'espace (`space.ts`). `renderer.setTwinApproach(t)` la
  rapproche pendant les assauts (chantier 24, skill `kiwar-world`).
- Son brouillard est un shader sur trois couches de nuages, masqué par parcelle (`twin.ts:117-173`).
- Seules les tanières et perchoirs repérés sont dessinés, figés (`twin.ts:331-345`), avec les
  fanions des têtes de pont (`twin.ts:280-327`).
- Le spectacle du siège est fait d'effets abstraits (`siegeFx.ts`, 6,5 s), rejoués seulement si
  l'événement a moins de 20 s (`apps/client/src/game/events.ts:36-54`).
- Les éléments réutilisables :
  - le moteur d'affichage des batailles du 36 (`render/battle/`) ;
  - les animations, les créatures et les effets du 34 ;
  - le kit de modèles du 33.
- Dette du chantier 24 (`docs/DETTE.md`) : la caméra ne suit pas une jumelle qui se rapproche ;
  la jumelle passe d'un coup du disque peint au détail.

## Proposition

- **Le voyage** : à l'atterrissage, une invitation « Regarder le débarquement ». La caméra
  voyage jusqu'à la jumelle, qui se rapproche ; la caméra la suit et cadre la parcelle.
- **Le brouillard se lève** sur la parcelle, en fondu, au moment où le vaisseau se pose.
- **Le village alien** se génère depuis l'aperçu, selon l'âge de la civilisation. Un nouveau
  `render/alienVillage.ts` et le kit du 33 donnent :
  - terriers de furets, perchoirs de chauves-souris ;
  - ateliers, casernes, totems, réserves ;
  - le terrier royal, s'il est là.
    Il garde le même look aux visites suivantes et se met à jour dans les parcelles balisées.
- **La bataille** reprend `render/battle/` du 36, sur la jumelle :
  - le vaisseau-oiseau se pose et les kiwis en sortent ;
  - les coups suivent la classe (bec, épée, boule de feu, fronde, masse) ;
  - les chauves-souris plongent et les incendies naissent quand on brûle ;
  - à la fin, la **balise** est plantée (un kiwi lumineux) et le vaisseau repart.
- **Toucher une unité** ouvre sa fiche : niveau, PV, classe ou rôle, équipement. C'est aussi ce
  qui remplit le bestiaire.
- **Le replay** : vitesse ×1/×2/×4, rembobiner, passer. On le lance depuis le rapport.
- **Lisible sur téléphone** : cadrages préréglés, grandes zones à toucher, barres de vie lisibles.
- **Les performances** : niveaux de détail, unités instanciées, réveil du limiteur d'images
  pendant le spectacle et repos après.

## Découpage proposé

1. Voyage et cadrage (la caméra suit la jumelle qui approche), lever du brouillard par parcelle.
2. Village alien généré depuis l'aperçu, par âge de la civilisation ; balises.
3. Bataille sur la jumelle : vaisseau, sortie, coups par classe, incendies, balise.
4. Fiches d'unités, replay, téléphone.
5. Mesures, captures desktop + téléphone, docs (`kiwar-client`, `kiwar-world`, `kiwar-battle`),
   `DETTE.md`, `PLAN.md`.

## Critères d'acceptation

- Devant l'écran à l'atterrissage, on voit le débarquement en direct et on peut toucher un furet
  pour voir son niveau et son équipement.
- Une parcelle balisée montre son village alien, qui change avec l'âge de la civilisation.
- Le replay rejoue exactement le journal.
- Images/s acceptables sur téléphone pendant la bataille.
