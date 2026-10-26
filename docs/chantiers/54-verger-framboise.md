# Chantier 54 — Les trous de ver et le Verger cosmique I : la framboise

Acte IV « Au-delà » du [carnet de route](../CARNET_DE_ROUTE.md) (section 9, « Le Verger
cosmique »). **Simulation + serveur + client + bot.** Après les **52** (la Liane-Mère) et **53**
(le quai des kiwaïs). Il ouvre un domaine : il crée le skill **`kiwar-orchard`**.

**Skills à charger** : `kiwar-design`, `kiwar-expeditions`, `kiwar-battle`, `kiwar-world`,
`kiwar-online`, `kiwar-orbit`.

## Intention du porteur

« Une fois sa moitié colonisée, on explore l'espace vite, avec des vaisseaux avancés, par des
**trous de ver** qui suivent la Liane-Mère. On y trouve d'autres **planètes-fruits** : pomme,
framboise, ananas… Chacune a ses habitant·es, ses ressources et ses règles (la framboise en
grappes de petites sphères, l'ananas en écailles). C'est le grand jeu de l'après-conquête. »
(carnet, section 9)

## Décisions déjà prises

1. **Des destinations et des comptoirs, pas des colonies** (porteur, 26 octobre 2026). On
   atteint chaque planète-fruit par un trou de ver. Elle a ses habitant·es (ami·es, neutres ou
   hostiles), ses règles et ses ressources. On peut y débarquer, y commercer ou y poser un
   **comptoir** (une petite base comme un kiwaï), mais pas une colonie complète.
2. **Trois fruits dans l'acte IV** (défaut de Claude) : la framboise ici, la pomme et l'ananas
   au [chantier 55](55-verger-pomme-ananas.md).
3. Les trous de ver s'ouvrent avec la technologie débloquée par la Liane-Mère (52). Sans
   elle, la recherche reste possible, mais plus longue.
4. Défaut de Claude : **le Verger est le même pour tout un univers**, tiré de la graine de
   l'univers (en solo, la graine de la partie). Les membres d'un univers partagent les mêmes
   fruits et les mêmes habitant·es, ce qui donne une matière commune aux ligues (56). Chaque
   colonie garde sa propre vue et ses propres impacts. Il n'y a pas d'état partagé entre
   joueur·euses, et donc pas d'effet d'un·e joueur·euse sur un·e autre.
5. La règle anti-triche vaut ici aussi : ce qui est caché sur un fruit n'arrive jamais au
   client.
6. Les habitant·es peuvent être **ami·es** : une rencontre ne mène pas toujours à une bataille.

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Cibles** : `state.targets` (la jumelle, les faces des membres, `alienFaceOnKiwi(distance)`).
  Les missions vont vers une cible (`land | found | guard | final`). Les vues publiques sont
  dans `state.faceViews`, le bestiaire dans `state.bestiary`.
- **Voyage** : `ALIEN_TWIN_FACE.travelMs` 90 min ; les autres kiwis `90 + 60 · distance` min ;
  `travelTime` de l'aire d'envol ; `FUEL` (−25 % de durée, +0,15 de fiabilité).
- **Civilisation** : `sim/civ.ts` (une horloge propre, des parcelles, une IA). C'est un modèle
  possible pour les habitant·es hostiles, en plus simple.
- **Espace** : `render/space.ts` (places fixes), `render/allies.ts` (planètes des membres),
  `CameraRig.flyTo`, le niveau de détail de `render/twin.ts`.
- **Univers** : la table `universes.seed` (Supabase), `server/universes.ts`.
- **Kiwaïs** et le site d'un bâtiment sur une petite carte : chantier 53 (skill `kiwar-orbit`).

## Proposition (point de départ)

- **Trous de ver** : une technologie et un bâtiment (la « porte de liane » au quai d'un kiwaï,
  ou à l'aire d'envol). Le voyage dure quelques heures, avec le voilier stellaire et de la
  poussière d'étoile. La carte du Verger est une branche de la Liane-Mère avec ses fruits
  pendus, dessinée dans la vue de l'espace au-delà de l'anneau des membres.
- **La framboise** :
  - **forme** : une grappe de 60 à 90 **drupéoles**, des petites sphères qui sont autant de
    mini-parcelles. On saute de l'une à l'autre (une gravité faible : les voyages entre drupéoles
    sont courts, mais un équipage n'en porte que 2 à la fois) ;
  - **habitant·es** : un peuple de petits coléoptères (inspiré du byturus, le vrai ravageur de
    la framboise), organisé en clans par drupéole, ni ami·es ni ennemi·es d'emblée ;
  - **règle propre** : la **réputation**. Commercer ou aider un clan rend les voisins amicaux ;
    piller les rend hostiles et fait venir les clans d'à côté. Ce choix moral est visible ;
  - **ressource** : le **nectar rouge** (un stock à part, en unités brutes). Il paie les
    comptoirs, un palier de gear et un décor de prestige.
- **Missions** : `visit` (rencontrer, commercer : on échange des ressources contre du nectar à
  un cours public) et `land` (combattre une drupéole hostile, moteur du 36, règle du 46). Le
  **comptoir** se pose sur une drupéole amie ou prise : une petite carte (la mécanique du 53)
  qui produit du nectar et sert de relais.
- **Menace** : des clans hostiles peuvent attaquer un comptoir. C'est annoncé et défendable,
  sur le modèle des attaques de balises (`sim/beacons.ts`).

## Grille de décision (kiwar-design)

- **Boucles** : stratégie (commercer ou combattre), économie (le nectar), expansion (les
  comptoirs).
- **Décisions créées** : quel clan aider, piller ou commercer, où poser un comptoir.
- **Punition** : piller se paie en réputation (annoncé et visible) ; une défaite suit les règles
  du débarquement.
- **Absence** : un comptoir produit ; une attaque est annoncée.
- **Mesure** : le premier trou de ver (cible ~jour 28–30), le nectar, les comptoirs, les
  attaques perdues.

## Découpage proposé

1. **Le Verger** : la génération par la graine de l'univers, la carte publique, la technologie
   et la porte, le voyage ; tests (en solo et en ligne, la même graine donne le même Verger).
2. **La framboise** : les drupéoles, les clans, la réputation, le nectar ; tests.
3. **Missions** : `visit` et le commerce, `land` sur le fruit (le cadre de bataille), le
   comptoir ; résolution là où la vérité est tenue ; tests anti-triche.
4. **Attaques de comptoirs.**
5. **Client** : la carte du Verger dans l'espace, le voyage par trou de ver, la framboise
   (l'écran et la 3D), le commerce, l'i18n ; captures.
6. **Bot, sondes, docs** : création du skill `kiwar-orchard`, `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- Après la Liane-Mère (ou une recherche plus longue), un trou de ver mène au Verger, et la
  framboise se visite, se commerce et se combat.
- Deux membres d'un univers voient le même Verger, mais chacun·e a ses propres impacts.
- Un comptoir se pose, produit, et se défend sur annonce.
- Rien de caché n'arrive au client en ligne.
