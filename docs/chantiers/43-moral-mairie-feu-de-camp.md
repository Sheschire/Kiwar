# Chantier 43 — Moral par kiwi, Mairie et feu de camp

Acte III « Le village vivant » du [carnet de route](../CARNET_DE_ROUTE.md) (ex-chantier 27,
élargi au moral). **Simulation + client + bot.** Après le **35** (la Mairie occupe 3 tuiles) et
l'acte II. **Fiche courte** : on la détaille au début de sa session, avec l'acte II joué.

**Skills à charger** : `kiwar-cycles`, `kiwar-rpg`, `kiwar-tasks`, `kiwar-design`.

## Intention du porteur

- « Il y aura un vrai game design à faire sur le moral des kiwis. Ce ne sera plus aussi facile
  qu'avant de le maintenir haut, et il faudra créer les bâtiments nécessaires pour qu'ils soient
  épanouis sur leur planète. Cela aura aussi pour effet d'apporter de la vie et de la bonne
  humeur. »
- « Différents bâtiments de jeu et d'activités pour qu'un kiwi au moral bas remonte un peu sa
  jauge. »
- « Une Mairie avec une action Discours : le maire fait un discours et tous les kiwis viennent y
  assister. Cela pause la productivité, mais augmente le moral pour une durée déterminée. »
- « Un feu de camp avec un panier à nourriture pour un moment convivial au crépuscule, où tout le
  monde se réunirait pour manger avant de dormir. »

## Décisions déjà prises

- **Une jauge de moral par kiwi** (23 octobre 2026), avec la moyenne de la colonie affichée.
- **La Mairie porte le Discours** (fin octobre 2026) : bâtiment unique de 3 tuiles où siège le·la
  maire ; sans Mairie, pas de discours.
- Déblocages proposés : feu de camp et Mairie au Nid 3 (Éden).

## État actuel (code)

Chemins sous `packages/shared/src/`.

- **Moral de colonie** : borné à ±0,20. C'est la somme de : nourri +0,03 / affamé −0,05, confort
  ±0,03, maire +0,01 × Charisme (+0,05 Organisation), discours +0,03 pendant 1 h, deuil −0,06
  pendant 24 h, saison ±0,02 (`data/needs.ts:67-83`, `sim/rest.ts:151-211`). Il est passif et
  facile à tenir.
- **Discours** : une compétence du·de la maire (`sim/commands.ts` ~829, `useSkill`). Il fixe
  `state.speechUntil` pour 1 h (doublé avec Fête), avec récolte ×1,15 (`colonyBonus`,
  `sim/kiwis.ts` ~247).
- **Repos** : présence et lits (`sim/rest.ts:126-136`). Il n'y a ni loisir, ni beauté, ni
  nuisance.

## Proposition (à chiffrer en début de session)

### La jauge par kiwi

- Elle cible un niveau qui vient de ses **besoins** :
  - manger ;
  - dormir (lit proche) ;
  - se divertir (loisirs du 44, feu de camp) ;
  - beauté du lieu (décorations du 44 dans un rayon) ;
  - sécurité (vagues récentes, blessures).
    S'y ajoutent ses **traits**, ses **deuils** (un ami mort) et sa **classe** (le Barde aide).
- La plage est plus large qu'aujourd'hui (par exemple ±35 % sur le travail) ; un moral très bas
  fait perdre du temps de travail, sans jamais tuer.
- **Exact hors ligne** : la jauge suit des paliers et des événements d'`advance`, pas un tic.
  Garder le calcul léger : besoins de colonie communs, plus des écarts propres à chaque kiwi.
- Les kiwis au moral bas vont **d'eux-mêmes** vers un loisir hors de leurs heures de travail
  (soir, nuit tombante) : les tâches du chantier 15 les rendent ensuite à leur poste.
- **Le voisinage compte** : un atelier bruyant près des huttes gêne le sommeil, une décoration
  embellit. Le placement devient un levier de plus.

### La Mairie et le Discours

- C'est un bâtiment unique, sur 3 tuiles, débloqué au Nid 3, aux niveaux 1–12. Le·la maire y
  siège ; sans maire, la Mairie ne fait rien.
- Le Discours se lance depuis la fiche de la Mairie, avec une recharge de 24 h (12 h aux niveaux
  hauts) :
  - **rassemblement** : les kiwis valides marchent jusqu'à la Mairie et la production s'arrête
    (~20 min de jeu, marche comprise) ;
  - **après** : moral +10 % pendant 8 à 12 h selon le niveau, plus le Charisme ; Fête double
    l'effet ;
  - il est interdit pendant une vague.
- Il remplace l'ancien Discours : les sauvegardes qui en ont un en cours le terminent
  normalement.

### Le feu de camp

- C'est un bâtiment sur 1 tuile, hors quota. **Au crépuscule**, les kiwis libres s'y réunissent
  pour manger dans le panier commun : moral +, et un peu moins de nourriture gaspillée. On y voit
  chanter, danser et rire (animations du 34).

## Découpage proposé

1. Jauge par kiwi : besoins, traits, deuils, exactitude hors ligne, migration ; tests.
2. Recherche d'un loisir hors travail et effets de voisinage ; tests.
3. Mairie, Discours et rassemblement ; tests (exactitude, vague).
4. Feu de camp et routine du soir.
5. Client (jauges, fiches, mise en scène, son `speech.crowd`), bot, équilibrage, docs
   (`kiwar-cycles`, `kiwar-rpg`), `DECISIONS.md`, `PLAN.md`.

## Critères d'acceptation

- Tenir le moral haut demande des bâtiments et un bon placement ; un moral bas se voit et se
  soigne.
- Un discours arrête la production ~20 min et donne un bonus visible pendant des heures. Le gain
  net est positif au bon moment, négatif si on le répète trop.
- Les kiwis se réunissent vraiment au feu de camp au crépuscule.
- Hors ligne, le calcul est exact.
