# Chantier 24 — Caméra libre et planètes dans l'espace

Retours de partie de fin octobre 2026. **Client surtout**. À coordonner avec le **chantier 19**
(colonisation) : sa mise en scène et la « planète sœur » doivent utiliser les positions fixes
de ce chantier. Idéalement, terminé avant la 2e conversation du 19.

## Intention du porteur

- « Retirer **« Face alien — à coloniser »** et **corriger le positionnement de la planète**. »
- « En fait la planète est **un objet de l'univers comme notre planète**, elle n'est **pas
  rattachée à notre caméra**. Dans l'idée, on peut **déplacer notre caméra librement**, sans
  focus central sur la nôtre, pour même aller **voir les planètes des autres**. Cela enlèvera
  tous les soucis de caméra avec la planète alien. »

## Réponse du porteur (fin octobre 2026)

**Orbite autour de sa planète + voyage** : les planètes (la sienne, la jumelle, celles des
allié·es) ont une place fixe dans l'espace. On tourne librement autour de la sienne ; un clic sur
une autre planète y fait voler la caméra, puis on y orbite. Pas de vol libre à six degrés de
liberté.

## État actuel (code)

Chemins sous `apps/client/src/`.

- **Jumelle** (`render/twin.ts` ~184-221) : replacée **à chaque image depuis la caméra**
  (`camera.position + dir × (distance + 34)`), dans une direction fixe (`FRONT_AZIMUTH`) mais à
  la hauteur de la caméra ; cachée sous le zoom 0,6, entière à 1,15 ; échelle 0,68 ; elle
  oscille. Seule la planète d'un·e allié·e visitée est « ancrée » (`anchored`). D'où les
  soucis : elle glisse avec le zoom et l'inclinaison, elle n'a pas de vraie place.
- **Bandeau** : `compass.twin` « Face alien — à coloniser » (`i18n/fr.ts` ~642), au-dessus de
  la jumelle quand k > 0,75.
- **Caméra** (`camera/CameraRig.ts`, camera-controls) : distance 11-75, angle polaire
  0,32-1,12, cadre (`frame()`) en boîte ±étendue autour de l'origine, `maxDistance =
frameDistance × 1,9`. La planète du joueur est à l'origine. La visite d'une autre planète
  change les bornes (~149-157), `returnHome` les remet (~184-200).
- **Ciel** (`render/environment.ts`) : sphère de ciel, mer de nuages plane sous le disque,
  trois lunes lointaines, tout centré sur la planète.
- **Visites** : `visiting` coupe les taps (lecture seule) ; planètes alliées visibles et
  visitables (retours de partie à plusieurs).

## Proposition

### Un petit système planétaire

- Une **carte de l'espace** déterministe : la planète du joueur à l'origine, la jumelle à une
  place fixe (par exemple à 140 unités, un peu au-dessus de l'horizon, dans la direction des
  vagues de l'avant), les planètes des allié·es sur un anneau plus loin (ordre stable par
  identifiant). Chaque planète tourne lentement sur elle-même (option) mais **ne suit jamais la
  caméra**.
- Les objets du ciel (lunes, étoiles, nébuleuse) restent à l'infini ; la mer de nuages devient
  propre à chaque planète (ou un fond commun sous le système, à mesurer).
- La jumelle garde son brouillard de guerre ; un **survol** affiche son nom (« Kiwino —
  inexplorée ») et un clic propose « Y aller ». Le bandeau permanent disparaît.

### Caméra

- **Orbite** autour de la planète courante, comme aujourd'hui, avec un dézoom plus grand qui
  laisse voir les autres planètes.
- **Voyage** : clic sur une planète (ou entrée dans un sélecteur « Planètes ») → la caméra vole
  (courbe douce, 1,5 à 2 s), puis orbite autour d'elle avec ses propres bornes. Bouton « Retour
  à ma colonie » toujours visible hors de chez soi.
- **Téléphone** : mêmes gestes ; le voyage se lance d'un tap sur la planète ou depuis le menu
  (chantier 21).
- Plan lointain et brouillard de profondeur ajustés pour voir les planètes sans coût (niveau de
  détail : une planète lointaine = une sphère texturée, la vraie carte seulement à
  l'approche).

### Sans régression

- Les vagues et la boussole gardent leur direction (le « front » reste celui de la jumelle).
- Pas de perte d'images/s : les planètes lointaines coûtent un appel de dessin chacune.

## Impact technique

- Client : `render/twin.ts` (devient une « planète » générique placée dans le monde),
  `GameRenderer.ts`, `camera/CameraRig.ts` (cibles multiples, vol), `render/environment.ts`,
  `ui/components/Compass.tsx`, visites alliées, i18n FR + EN.
- Simulation : rien. Serveur : rien (la liste des planètes alliées existe déjà).
- Chantier 19 : la mise en scène du siège (la jumelle « se rapproche ») et la planète sœur
  colonisée utiliseront ce système.

## Découpage proposé

1. Carte de l'espace et jumelle à place fixe ; bandeau retiré ; survol avec nom.
2. Voyage de caméra vers une planète, orbite locale, retour ; planètes des allié·es sur
   l'anneau.
3. Niveau de détail, ciel, mer de nuages, mesures, captures desktop + téléphone, docs, skills
   `kiwar-client` et `kiwar-world`.

## Critères d'acceptation

- La jumelle ne bouge plus quand on zoome ou tourne : c'est un astre.
- On va voir la planète d'un·e allié·e et on revient en deux taps.
- Plus aucun bandeau « à coloniser » ; on comprend que c'est une autre planète en la survolant.
- Images/s inchangées au zoom par défaut.

## Questions ouvertes

1. La jumelle doit-elle rester **visible au zoom par défaut** (petite, en haut de l'écran),
   ou seulement en dézoomant ?
2. Les planètes tournent-elles sur elles-mêmes (vivant) ou restent-elles fixes (lisible) ?
3. Peut-on aussi voyager vers la face d'un·e **inconnu·e** de l'univers (lecture seule), ou
   seulement les allié·es et sa jumelle ?

Réponses du porteur (conversation du chantier) : la jumelle est cachée au zoom par défaut et
apparaît en dézoomant, la caméra **se redressant vers l'horizon** (vue « espace ») ; les
planètes **tournent lentement** (un tour en 5 min) et celle qu'on visite se fige ; on voyage
vers **sa jumelle et les membres de l'univers** (pas les faces aliens inconnues) ; la jumelle
montre son nom et son exploration au survol, une carte « Y aller » au clic, et sur place
« Préparer une expédition » (et « Siège » quand le chantier 19 l'ouvre).

## Bilan

Fait (détail et mesures dans `DECISIONS.md`) :

1. **Carte de l'espace** (`render/space.ts`) : chez soi à l'origine, la jumelle à 120 vers le
   front, à hauteur 8 ; les membres sur un anneau à 210 (+20 par kiwi d'écart), hors d'un
   secteur de 35° autour du front ; orientation fixe vers chez soi. Plus aucun bandeau « à
   coloniser » ; au survol, « Kiwino — inexplorée » / « explorée à N % ».
2. **Vue espace** : dézoom jusqu'à 3 × le cadrage ; au-delà du cadrage la caméra se relève
   (0,78 → 1,42 rad), la jumelle pointe dès ≈ 1,4× ; en rezoomant on retrouve son inclinaison.
   Ciel et lunes suivent la caméra (à l'infini), mer de nuages élargie.
3. **Voyage** : carte « Y aller » (tap / clic sur une planète), liste **Planètes** (bouton
   rond sur desktop, entrée du menu sur téléphone, écran Univers) ; vol en arc de 1,4 à 2 s,
   orbite autour de la planète avec ses bornes, bandeau de visite et retour au point de vue
   quitté.
4. **Niveau de détail** : de loin, une planète = son dôme + un disque peint (3 appels de
   dessin) ; les bâtiments d'un·e allié·e sont fusionnés en une géométrie.
5. **Crochets du chantier 19** : `renderer.setTwinApproach(t)` (la jumelle se rapproche) et la
   règle de la planète sœur (l'autre moitié du kiwi est toujours à la place de la jumelle),
   décrits dans le skill `kiwar-world`.

Mesures (`?debug`, Chromium sans GPU, 1280×800, Moyenne, face au front) :

| Zoom            | Avant : appels / triangles | Après : appels / triangles | Planètes avant → après |
| --------------- | -------------------------- | -------------------------- | ---------------------- |
| 1 (défaut)      | 86 / 62,5 k                | 79 / 46,8 k                | 7 → 0 (hors champ)     |
| 1,9             | 86 / 62,5 k                | 82 / 48,4 k                | 7 → 3                  |
| max (1,9 → 3)   | 86 / 62,5 k                | 82 / 48,4 k                | 7 → 3                  |
| 1 allié·e, loin | —                          | —                          | 60 → 5                 |

Téléphone 390×844 au zoom par défaut : 82 / 62,9 k → 75 / 46,7 k. Coût JS de la scène
inchangé (< 0,1 ms par image).

Reste : le vol et la vue espace sont à essayer sur un vrai téléphone et sur le MacBook
(images/s réelles en dézoom) ; la jumelle passe d'un coup du disque peint au détail pendant
le vol (≈ 8 rayons) ; la caméra ne suit pas une jumelle qui se rapproche pendant une visite
(jouer la mise en scène depuis chez soi) ; les faces aliens inconnues ne sont pas dessinées.
