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
