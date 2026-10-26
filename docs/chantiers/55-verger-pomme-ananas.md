# Chantier 55 — Le Verger cosmique II : la pomme et l'ananas

Acte IV « Au-delà » du [carnet de route](../CARNET_DE_ROUTE.md) (section 9). **Simulation +
client.** Après le **54** ; il peut tourner **en parallèle du 56** (les ligues : serveur et
client, sans toucher la simulation).

**Skills à charger** : `kiwar-orchard`, `kiwar-battle`, `kiwar-design`, `kiwar-client`.

## Intention du porteur

« Chacune a ses habitant·es, ses ressources et ses règles (la framboise en grappes de petites
sphères, l'ananas en écailles). » (carnet, section 9)

## Décisions déjà prises

- Les décisions du [chantier 54](54-verger-framboise.md) s'appliquent : des destinations et des
  comptoirs, un Verger par univers, l'anti-triche, des habitant·es qui peuvent être ami·es.
- **Chaque fruit a une règle propre** qui change la façon de jouer, pas seulement des chiffres
  (charte 2).

## État actuel (code)

- Le Verger, la framboise, les comptoirs, la réputation et le nectar : chantier 54 (skill
  `kiwar-orchard`).
- Le moteur de bataille (`battle/`), les vagues et les attaques de balises (`sim/beacons.ts`).

## Proposition (point de départ)

- **La pomme** :
  - **forme** : une grosse sphère avec une peau, une chair et un trognon ;
  - **habitant·es** : un peuple de **vers** (inspiré du carpocapse, qui creuse les pommes),
    vivant dans des galeries ;
  - **règle propre** : la **maturation**. La pomme mûrit puis blettit sur un calendrier public
    de plusieurs jours. Mûre, elle est riche et calme ; blette, elle est pauvre et les vers sont
    agressifs. On choisit sa fenêtre ;
  - les descentes dans la pomme réutilisent les Tréfonds (48) ;
  - **ressource** : le **cidre** (fermenté) : un moral de prestige (une soirée de cidre) et un
    carburant de voilier.
- **L'ananas** :
  - **forme** : 100 à 200 **écailles** en spirales (l'ananas est un fruit multiple : chaque
    écaille est un fruitlet). C'est une grille naturellement hexagonale, presque une face
    (`faceMapOf`) ;
  - **habitant·es** : des fourmis tisserandes (qui gardent leurs écailles), une société en
    castes ;
  - **règle propre** : la **bromélaïne**. L'enzyme de l'ananas digère les protéines, comme
    l'actinidine : chaque heure passée sur l'ananas use l'équipage, sauf avec le réactif
    d'actinidine (50) ou un gear adapté. Et la **couronne** au sommet est la parcelle royale ;
  - **ressource** : la **fibre d'or** (les feuilles de la couronne), pour le gear et le
    prestige.
- **Comptoirs** : un par fruit. Des **routes** entre comptoirs (un relais de nectar, de cidre et
  de fibre d'or) donnent un bonus d'ensemble visible. Ce puits revient : l'entretien des
  routes.

## Grille de décision (kiwar-design)

- **Boucles** : stratégie (la fenêtre de la pomme, l'usure de l'ananas), économie (trois
  ressources de prestige).
- **Robinets et puits** : chaque ressource a deux puits, dont un qui revient (soirées,
  carburant, entretien des routes).
- **Décisions créées** : quand partir (la maturation), quel équipement (la bromélaïne), quel
  fruit relier.
- **Mesure** : les comptoirs posés, « au plafond » des ressources du Verger, les pertes.

## Découpage proposé

1. **La pomme** : maturation, vers, descentes ; tests.
2. **L'ananas** : écailles, fourmis, bromélaïne, couronne ; tests.
3. **Comptoirs et routes** ; tests.
4. **Client** : la pomme et l'ananas (3D, écrans), les routes, l'i18n ; captures.
5. **Bot, sondes, docs** : `kiwar-orchard`, `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- La pomme et l'ananas ont chacun une règle qu'on sent en jouant : le moment du départ, l'usure.
- Chaque ressource du Verger a ses puits, et « au plafond » < 20 %.
- Les trois fruits ont un comptoir possible et une route.
