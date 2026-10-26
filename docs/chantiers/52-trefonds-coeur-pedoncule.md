# Chantier 52 — Les Tréfonds III : le cœur, le pédoncule et la Liane-Mère

Acte IV « Au-delà » du [carnet de route](../CARNET_DE_ROUTE.md) (section 9). **Simulation +
serveur + client.** Après le **51** (la couche s'ouvre à l'Âge des étoiles).

**Skills à charger** : `kiwar-depths`, `kiwar-battle`, `kiwar-design`, `kiwar-client`.

## Intention du porteur

Le carnet (section 9) pose cette couche :

- « Le cœur est fait de très grandes cellules à paroi fine : des **cavernes blanches**. »
- « **Au fond, le pédoncule**, l'attache du fruit. Les kiwis poussent sur des **lianes**. Le
  pédoncule mène à la **Liane-Mère**, d'où pendent tous les fruits-planètes : c'est le lien
  vers le Verger cosmique. »

C'est le but long de l'acte IV sous nos pieds, et le lien vers l'espace.

## Décisions déjà prises

1. **Le cœur et le pédoncule s'ouvrent à l'Âge des étoiles** (porteur, 26 octobre 2026).
2. Même forme que les 48 et 50 : des salles, des descentes, des galeries, le contenu caché et les
   remontées annoncées.
3. **La découverte de la Liane-Mère** débloque la recherche des trous de ver (54). Elle ne doit
   pas être le seul chemin : si le pédoncule résiste, la recherche reste possible, mais plus
   longue (pas d'impasse, charte 4).
4. Défaut de Claude : la reine « se terre dans les Tréfonds de la jumelle » reste un récit
   (chantier 47). Les Tréfonds de la jumelle conquise s'ouvrent à la seconde colonie avec les
   règles du 48, ce qui est hors de ce chantier et noté au 58.

## État actuel (code)

- **Tréfonds, couches 1 et 2** : chantiers 48 et 50 (skill `kiwar-depths`).
- **Gros adversaire à phases** : la reine (`battle/queen.ts`, et `wake`, `rage`, `leader` dans
  le moteur). Une unité géante se fait avec les mêmes outils.
- **Spectacle** : la tranche (49), `ShowSource` `delve`.
- **Recherche** : `data/research.ts` (une technologie peut exiger un fait de jeu, comme un
  objectif : à vérifier en session).

## Proposition (point de départ)

- **Le cœur** : 6 à 10 cavernes blanches, immenses et fragiles. Les « parois fines » en font un
  danger propre : un **éboulement** si l'équipage est trop lourd (un plafond de poids par salle,
  affiché). Elles sont riches en sève pure : une galerie du cœur double le débit d'une mine.
- **Le pédoncule** : une seule salle, la plus profonde, gardée par le **Grand Charançon**, un
  ravageur du fruit et une unité géante à phases (carapace au sol, puis envol, puis une nuée de
  larves). C'est une bataille finale de nos Tréfonds : longue, lisible, préparée.
- **Victoire** : la **Liane-Mère** apparaît (sur la tranche, une liane lumineuse qui file hors
  de la planète). Elle débloque la technologie « Trous de ver », donne un trésor (graines
  géantes, cristal) et fait taire les remontées du cœur.
- **Retraite / défaite** : règle du 46 ; le Charançon garde ses blessures un temps, comme la
  reine.
- **Galerie du pédoncule** : un lieu de pèlerinage, avec un souvenir de moral pour toute la
  colonie (`addMemory`).

## Grille de décision (kiwar-design)

- **Boucles** : stratégie (la bataille finale des Tréfonds), progression (le lien vers le
  Verger).
- **Horizon** : long terme, avec une étape visible (les salles du cœur, puis le Charançon).
- **Punition** : annoncée, préparée, avec une retraite possible ; pas d'impasse (une recherche
  plus longue sans la Liane-Mère).
- **Mesure** : le jour du Charançon tombé (cible ~jour 25–28, attentif), les morts, les
  tentatives.

## Découpage proposé

1. **La couche du cœur** : génération, cavernes, éboulements ; tests.
2. **Le pédoncule et le Grand Charançon** : l'unité à phases, la mission, la prévision ; tests.
3. **La Liane-Mère** : la découverte, la technologie, le trésor, le souvenir ; tests.
4. **Client** : le cœur dans la tranche, le Charançon et sa bataille, la liane qui sort de la
   planète dans la vue de l'espace ; i18n ; captures.
5. **Bot, sonde 6 × 28 jours, docs** : `kiwar-depths`, `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- À l'Âge des étoiles, le cœur s'ouvre ; le pédoncule se prévoit, se tente et se reprend.
- La chute du Charançon révèle la Liane-Mère et ouvre les trous de ver ; sans elle, la
  recherche reste possible.
- La bataille du Charançon est lisible sur téléphone (8 min au plus, comme la reine).
