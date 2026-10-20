# Chantier 17 — Identité visuelle : bâtiments distincts, planète alien, ciel vivant

Retours de partie de fin octobre 2026. À lancer **après l'audit d'optimisation**, pour ne pas
défaire ses gains.

## Intention du porteur

- « Les bâtiments se ressemblent trop (par exemple l'entrepôt, l'école et l'atelier à fibre sont
  tous rouges, on comprend mal). »
- « Plus de planète alien visible ?? Que s'est-il passé ? »
- « Une **mer de nuages animée** derrière, si ce n'est pas trop gourmand en ressources, pour un
  effet plus organique, plus vivant. »

## État actuel (code)

- **Bâtiments** : tout est procédural (`apps/client/src/render/buildingModels.ts`), avec une
  **palette partagée** `C`. L'entrepôt (murs), l'école (toit) et l'atelier à fibre (toit)
  utilisent tous `C.roof` (#b5523f). Les âges changent les couleurs par `dress()` /
  `AGE_COLORS`, et les niveaux 4 à 6 agrandissent le niveau 3 (`grow()`). Aucun modèle glTF.
- **Planète alien** (`render/twin.ts`) : elle n'apparaît qu'en dézoomant (poids `k = 0` au zoom
  1,0 : `ZOOM_IN 1.0`, `ZOOM_OUT 1.55`). Or la caméra se cadre exactement au zoom 1,0, donc **elle
  est invisible au zoom par défaut**, et ce n'est pas nouveau. Depuis le chantier 10, elle est
  aussi fixée vers le **front** (azimut π), c'est-à-dire **derrière** la vue par défaut : il faut
  dézoomer **et** tourner la caméra pour la voir.
- **Ciel** (`render/environment.ts`) : une sphère en dégradé avec étoiles et nébuleuse, une
  **mer de nuages plane** (shader de bruit, 600×600, sous le disque, couleurs du cycle jour/nuit)
  et trois lunes lointaines.

## Réponse du porteur (fin octobre 2026)

Bâtiments : **refonte procédurale** (pas de fichiers 3D externes) avec une couleur et une
silhouette signature par famille, plus une enseigne-icône.

## Proposition

### Bâtiments reconnaissables

- **Une couleur par famille**, reprise par l'icône de l'interface (chantier 11) :
  - production : la couleur de la ressource (pulpe crème et vert, fibre vert sauge, pépins brun
    doré, jus vert vif) ;
  - stockage : bois sombre et toit ardoise ;
  - savoir (École, Bibliothèque) : pierre et bleu ;
  - défense : pierre grise et fer ;
  - logement : fourrure et paille ;
  - vaisseau : bois clair et cuivre.
- **Une silhouette signature**, lisible de loin :
  - Entrepôt : bâtiment large et bas, porte à double battant, piles de caisses.
  - École : clocher bleu, cour avec mannequin.
  - Atelier à fibre : grande bobine qui tourne sur le toit.
  - Pulperie : presse en forme de kiwi.
  - Les autres sur le même principe.
- **Enseigne-icône** : un petit panneau ou fanion avec l'icône du bâtiment (celle de l'interface),
  dans une seule texture atlas partagée.
- Vérifier la **lisibilité au zoom par défaut** par une planche de captures (tous les bâtiments
  côte à côte, niveaux 1 à 3, chaque âge).

### Planète alien visible

- Demande du porteur : « qu'on la distingue en ne dézoomant qu'**un peu** ; là, il faut vraiment
  dézoomer très loin pour comprendre qu'il y a une planète à coloniser ».
- Visible **dès le zoom par défaut** (petite, haute dans le ciel du côté du front) et **bien
  lisible dès un léger dézoom** : proposition, apparition complète vers le zoom 1,15 au lieu de
  1,55, avec une taille apparente plus grande. On la reconnaît comme une planète (la moitié de
  kiwi tranchée, avec sa pulpe et son brouillard), pas comme une lune décorative.
- C'est la cible de la colonisation (chantier 19) : un léger halo ou un repère au survol
  (« Face alien — à coloniser ») aide à le comprendre.
- Repère d'orientation : la boussole (chantier 10) indique le front. Option : un premier
  cadrage de la caméra légèrement tourné pour que le front et la planète soient dans le champ.
- Pas de surcoût : elle est déjà rendue au dézoom.

### Mer de nuages vivante

- Animer la mer existante (déplacement lent du bruit, houle, trouées qui laissent voir les
  étoiles), plus éventuellement une seconde couche plus haute et transparente qui passe derrière
  la planète.
- **Budget** : le même plan, un seul shader, sans nouvelle passe de rendu. Désactivée ou figée en
  qualité basse ; à mesurer avec `?debug` (aucune perte d'images/s en préréglage moyen).

## Impact technique

- Client seulement : `buildingModels.ts` (palette par famille, silhouettes), atlas des
  enseignes, `twin.ts` (seuils de zoom), `CameraRig.ts` (cadrage), `environment.ts` (shader des
  nuages), `quality.ts`.
- Coordination avec l'audit d'optimisation : garder la fusion des géométries et les caches,
  sans nouveau matériau par bâtiment (couleurs par sommet).

## Découpage proposé

1. **Planète alien visible** au zoom par défaut, et cadrage.
2. **Palette par famille** et enseignes-icônes.
3. **Silhouettes signature** (stockage, savoir et production d'abord), avec la planche de
   captures.
4. **Mer de nuages animée**, réglée selon la qualité, avec une mesure.
5. Captures desktop et téléphone, docs, skill `kiwar-client`.

## Critères d'acceptation

- Sur une capture au zoom par défaut, chaque bâtiment est identifiable sans le sélectionner.
- La planète alien est visible au lancement d'une partie.
- Images/s inchangées à ±5 % en préréglage moyen.

## Questions ouvertes

1. Les couleurs par famille proposées : d'accord, ou une autre logique (par ressource
   seulement) ?
2. Au zoom par défaut, la planète alien doit-elle rester visible dans un coin du ciel même quand
   la caméra regarde à l'opposé du front (au prix d'une position moins « fixe ») ?
3. Seconde couche de nuages au-dessus : oui si le coût est nul, ou seulement la mer du dessous ?
