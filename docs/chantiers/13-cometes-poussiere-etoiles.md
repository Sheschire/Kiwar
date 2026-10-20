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

## Questions ouvertes (réponses d'octobre 2026)

1. Fréquence et plafond : **3 à 5 jours, plafond 50**.
2. Univers partagé : **une comète par face** (calendrier propre à chaque colonie).
3. Poussière pour les âges : **seulement le Fer et l'Industrie** (la Pierre reste libre).
4. Shiny étoilés : **une nouvelle couleur dorée**, seulement par l'œuf étoilé.
5. Ramassage : **poste temporaire** (3 places par tuile), envoi à la main avec un bouton
   « Envoyer les plus adroit·es » ; pas d'automatisme (le chantier 15 pourra le faire).
6. Joueur·euse qui passe une fois par jour : la fenêtre (annonce 6–12 h + 24 h au sol) suffit.

## Réalisé (octobre 2026)

1. **Comète et ramassage** : première comète à 36 h (annoncée 9 h avant), puis tous les 3 à 5
   jours, annoncée 6 à 12 h avant ; elle traverse le haut du ciel (plus brillante la nuit) et
   laisse 20 × facteur d'âge (20, 26, 34, 44) poussières sur 1 à 3 tuiles libres pendant 24 h.
   Jusqu'à 3 kiwis par tuile (≈ 2 poussières/h chacun, +5 % par point d'Adresse au-dessus de 5) ; stock à part plafonné à 50. Puce dans la barre du haut, badge, fiche de tuile, toasts,
   résumé hors ligne, sons.
2. **Bénédictions** (fiche du kiwi) : guérison immédiate (3), redistribution des stats (6),
   +1 pour toujours (10, trois fois par kiwi) ; **œuf étoilé** (+15) avec 1 chance sur 8 d'un
   shiny **doré** à paillettes.
3. **Branche « Étoiles »** : Nuits claires (Pierre, travail de nuit +15 %, 8), Guet des étoiles
   (Pierre, vagues annoncées 4 h plus tôt, 8), Appel des comètes (Fer, comètes 20 % plus tôt,
   15), Fer d'étoile (Fer, météorites +30 %, 12). Poussière payée au choix, rendue si on
   abandonne.
4. **Carburant** (5 : trajet −25 %, fiabilité +15 pts), **monument** du Fer (15) et de
   l'Industrie (25), **Kikiwiwi** (10). Le bot ramasse, garde sa réserve et soigne avec le
   surplus.

## Reste à faire / idées

- Pas d'automatisme de ramassage (chantier 15 : postes temporaires automatiques).
- La comète n'est pas montrée sur les planètes alliées ; pas de comète commune à l'univers.
- Pas de son dédié aux bénédictions ni à l'éclosion d'un œuf étoilé (son de shiny habituel).
