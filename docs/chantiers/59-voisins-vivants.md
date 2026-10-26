# Chantier 59 — Les voisins vivants

Demande du porteur pendant les essais du multijoueur (26 octobre 2026), hors carnet de route.
**Fait** le jour même, en deux parties. **Skills** : `kiwar-world`, `kiwar-online`,
`kiwar-client`.

## Intention du porteur

- « On ne voit pas les planètes adverses de nos compagnons, on ne voit que leur planète. »
- « Quand on visite leur planète, on voudrait voir leur village en vie : constructions,
  animations, kiwis qui se déplacent. Aujourd'hui on ne voit que des bâtiments inertes. »

## Décisions du porteur

- La jumelle extraterrestre d'un·e allié·e se montre **telle qu'iel la voit** : nuages ouverts
  sur ses parcelles, maisons extraterrestres vues, ses balises, la reine une fois sortie (et sa
  colonie sœur une fois fondée).
- Le village visité est **vivant et cohérent** : ses kiwis à leurs vrais postes, les bâtiments
  animés selon leur activité réelle, les chantiers en cours, le jour et la nuit. **Ses stocks
  restent cachés.**

## Ce qui est fait

- **Partie 1** — `AllySnapshot.twin` (`allyTwinOf`, `server/universes.ts`) : vues publiques
  seulement (`faceViews`), jamais la vérité. Place dans l'espace : `allyTwinPlace` (même azimut
  que la planète de l'allié·e, 75 plus loin, 14 plus haut ; `render/space.ts`). Dessin :
  `AlliesView` crée une seconde `TwinView` par allié·e (`allyTwinView`), aucune quand un·e
  joueur·se habite cette face (anciens univers à deux par kiwi).
- **Partie 2** — requête `allyVillage { universe, kiwiIndex, face }` : la colonie de l'allié·e
  avancée jusqu'à maintenant **en mémoire** (jamais sauvée ; pas au-delà de 12 h de retard,
  `VILLAGE_ADVANCE_MAX_MS`), passée par `villageView` (stocks à zéro, `intel` et `faceViews`
  vides, sans `aliens`). Client : `controller.allyVillage`, `startGame` la demande à chaque
  visite et toutes les minutes sur place ; `renderer.setAllyVillage` pose une `VillageLife`
  (`render/village.ts` : `BuildingsView`, `KiwisView`, `PathsView` de la maison) dans le repère
  de la planète (`TwinView.setLife`, qui cache les modèles fusionnés) ; le temps de leur partie
  court depuis l'instantané entre deux rafraîchissements.

## Reste à faire (idées)

- La colonie sœur d'un·e allié·e vivante elle aussi (aujourd'hui : modèles immobiles).
- Les cultures (`CropsView`) et les lumières de nuit des fenêtres sur la planète visitée.
- Toucher un bâtiment de l'allié·e pour une petite fiche (option écartée pour l'instant).
