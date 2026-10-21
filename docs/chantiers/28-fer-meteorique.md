# Chantier 28 — Fer météorique

Retours de partie de fin octobre 2026. **Simulation + client**. À lancer **après le chantier 25**
(la classe Cueilleur·euse mine les cratères).

## Intention du porteur

- « Que récolte-t-on avec la **météorite** ? J'ai l'impression que ce sont des graines. Il faut
  **en miner de la météorite** (ressource proche de la poussière d'étoile). »

## Réponse du porteur (fin octobre 2026)

Le minerai (**fer météorique**) sert à : **niveaux 4 à 6 et monuments des âges**, **vaisseau et
tourelles**, et **certaines technologies** du Fer et de l'Industrie.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- Quatre ressources seulement : pulpe, fibre, graines, jus (`data/resources.ts`).
- Une météorite tombe (`data/threats.ts` ~175-196) et laisse un **cratère** : poste temporaire
  de 3 places, rempli par les kiwis les plus adroits (chantier 15), 48 h, 3 au plus. Il donne
  **graines ×2, jus ×1 ou fibre ×1** selon un tirage pondéré : d'où l'impression de récolter
  des graines. La technologie **Foreuse** (`meteorDrill`, âge de Pierre) multiplie la récolte
  par 1 / 1,5 / 2 / 2,5 selon l'âge.
- Modèle à suivre : la **poussière d'étoile** (chantier 13, skill `kiwar-sky`) : stock à part
  en unités entières, plafond 50, coûts des âges et du Kikiwiwi.
- Épaves de météorite : obstacles à fracasser (chantier 08, skill `kiwar-titans`).

## Proposition

### La ressource

- **Fer météorique** : stock à part (comme la poussière), unités entières, plafond selon
  l'entrepôt (par exemple 40 / 80 / 160…) ; icône et compteur dans la barre dès le premier
  cratère.
- Chaque cratère donne **du fer météorique** (environ 10 à 20 unités par cratère sur ses 48 h
  avec trois kiwis), plus une petite part de la ressource actuelle (pour ne pas casser
  l'économie du début) : à fixer avec le bot.
- La Foreuse garde son rôle (×1,5 à ×2,5) ; les cueilleur·euses (chantier 25) minent plus
  vite.
- Fracasser une **épave** de météorite rapporte aussi un peu de fer.

### Les dépenses

- **Niveaux 4 à 6** des bâtiments : un coût en fer (petit au 4, plus gros au 6).
- **Monuments** du Fer et de l'Industrie.
- **Vaisseau** : chaque génération en demande ; **tourelles** de niveau 3+.
- **Technologies** : quelques-unes du Fer et de l'Industrie (fonte, armure, machines, armes à
  feu).
- La fréquence des météorites devient un enjeu : une technologie « Guetteur de météores » (âge
  de Pierre) annonce les chutes plus tôt ; les cratères attirent les prédateurs (à décider).

## Impact technique

- Simulation (skills `kiwar-threats`, `kiwar-tasks`, `kiwar-ages`, `kiwar-sky` pour le
  modèle) : `state.meteorIron`, plafond, récolte des cratères (exactitude hors ligne : débit
  entier, événements d'`advance`), coûts dans `data/buildings.ts`, `data/research.ts`, vaisseau,
  tourelles ; migration de sauvegarde.
- Serveur : simulation embarquée (`pnpm build:functions`). Classement/univers : rien.
- Client : compteur, icône, coûts dans les fiches et l'écran Plans, cratère qui montre le
  minerai (éclats métalliques), i18n FR + EN.
- **Bot et équilibrage** : le passage des âges ne doit pas attendre une météorite de trop
  (sonde `pnpm balance:ages`) ; jamais de partie bloquée (une source de secours si aucune
  météorite ne tombe : épaves, ou un minimum garanti par semaine).

## Découpage proposé

1. Ressource, stock, récolte des cratères et des épaves ; tests.
2. Coûts : niveaux 4-6, monuments, vaisseau, tourelles, technologies.
3. Client : compteur, fiches, cratère.
4. Bot, sonde des âges, équilibrage, docs, skills.

## Critères d'acceptation

- Un cratère donne visiblement du fer météorique, pas des graines.
- Le fer a des débouchés à chaque âge à partir du Fer.
- La sonde des âges ne bloque jamais faute de météorites.

## Questions ouvertes

1. Nom : « fer météorique » (proposé), « minerai d'étoile », « météorite » ?
2. Les cratères donnent-ils encore un peu de leur ressource actuelle, ou seulement du fer ?
3. Les cratères attirent-ils les prédateurs (risque contre gain) ?
4. Garantie anti-blocage : un minimum de chutes par semaine, ou une autre source (épaves,
   expéditions) ?
