# Chantier 13 — Comètes et poussière d'étoiles

## Intention du porteur

« Comètes : une ressource unique, la poussière d'étoiles. Propose des idées pour l'utilisation de
cette ressource. »

## État actuel

- Ni comète ni poussière d'étoiles dans le code.
- Le plus proche : les **météorites** (`METEORS`, `data/threats.ts`). Une étoile filante 1 h
  avant, un cratère pendant 48 h, une ressource classique (pépins, jus ou fibre) récoltée par un
  camp ou un producteur.

## Réponses du porteur (octobre 2026)

Usages retenus : **bénédictions de kiwis**, **technologies stellaires**, **carburant du vaisseau
et coût des âges et des Kikiwiwis**. Les constructions astrales (observatoire, tourelle à
poussière, phare) ne sont pas retenues.

## Proposition

### La comète

- Rare (proposition : une tous les 3 à 5 jours de jeu) et **annoncée** 6 à 12 h à l'avance par
  une traînée qui traverse le ciel la nuit.
- Elle passe au-dessus de la planète pendant quelques heures et laisse tomber de la **poussière
  d'étoiles** sur 1 à 3 tuiles (paillettes dorées). Des kiwis affecté·es la ramassent avant la
  dispersion (≈ 24 h). C'est un petit pic de décision : déplacer des kiwis, ou laisser filer.
- La nouvelle ressource `stardust` a un **petit stock séparé** (non compté dans le stockage
  partagé) et un plafond modeste (proposition : 50), pour éviter l'accumulation.
- La quantité augmente avec l'âge, comme les météorites.

### Usages

- **Bénédictions de kiwis** (écran du village) :
  - Redistribuer les stats d'un kiwi.
  - +1 permanent dans une stat (au plus 3 par kiwi).
  - Guérison instantanée d'une blessure.
  - Un « œuf étoilé » avec une chance de shiny multipliée.
- **Technologies stellaires** : une petite branche « Étoiles » de l'arbre de recherche (coût en
  points et en poussière). Exemples : nuit plus claire (travail de nuit +10 %), prévision des
  vagues plus précoce, comètes plus fréquentes, météorites plus riches.
- **Vaisseau** : de la poussière en carburant pour un voyage plus rapide et moins de pannes
  (option du planificateur d'expédition).
- **Âges et Kikiwiwis** : une petite quantité obligatoire de poussière pour le monument
  (Fer, Industrie) et pour la transformation en Kikiwiwi. Ça en fait un objectif à long terme.

## Impact technique

- Données et événement de comète dans `advance` (calendrier seedé, comme les météorites,
  prévisible et identique hors ligne).
- Ressource `stardust` (état, migration, interface des ressources, i18n, son de la comète).
- Commandes de bénédiction, branche « Étoiles », option de carburant, coûts des âges et des
  Kikiwiwis (à coordonner avec le chantier 08 s'il est encore ouvert).
- En ligne : la poussière est une ressource du serveur comme les autres (pas de triche côté
  client). Éventuellement une comète **partagée** par tout un univers.

## Découpage proposé

1. **Comète et ramassage** : calendrier, traînée dans le ciel, tuiles de poussière, stock
   séparé.
2. **Bénédictions** dans l'écran du village.
3. **Branche « Étoiles »** de la recherche.
4. **Carburant du vaisseau**, coût des âges et des Kikiwiwis.
5. Équilibrage (rareté, plafond), docs, skill (`kiwar-threats` ou un nouveau `kiwar-sky`).

## Critères d'acceptation

- Une comète est un petit événement attendu : annoncée, belle, avec un choix à faire.
- La poussière reste rare : jamais plus de quelques bénédictions par jour.
- Aucune partie ne peut être bloquée faute de poussière : un âge reste atteignable en
  quelques comètes.

## Questions ouvertes

1. Fréquence (3 à 5 jours ?) et plafond du stock (50 ?).
2. En univers partagé : une comète commune à tout l'univers (course à la poussière entre alliés,
   ou partage) ou une comète propre à chaque face ?
3. Exiger de la poussière pour passer un âge rallonge le rythme du chantier 08 (Pierre ≈ 1,5
   jour) : seulement à partir du Fer ?
4. Les shiny « étoilés » : une couleur de plus (dorée), ou seulement plus de chances sur les
   couleurs existantes ?
