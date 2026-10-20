# Chantier 07 — Vaisseau kiwi géant et exploration

## Intention du porteur

« Pour la conquête spatiale, le déplacement est représenté par un vaisseau mécanique en forme de
kiwi géant (l'oiseau) qui bat des ailes. Aux premiers âges, un vaisseau en bois, lent et fragile ;
en avançant dans les âges, on débloque jusqu'à un vaisseau futuriste, un oiseau kiwi hyper
aérodynamique avec des propulseurs. On doit pouvoir tenter d'explorer l'autre face du kiwi même
au premier âge, mais le temps et la réussite en sont moindres. Au début, on cherche surtout à
récupérer des infos sur l'ennemi. »

## Proposition

### Le vaisseau-oiseau

- Remplace le vaisseau actuel (demi-kiwi sur l'aire d'envol) par un **oiseau kiwi mécanique**
  qui bat des ailes : au repos sur l'aire, il respire et lisse ses plumes ; au départ, il
  s'élance, bat des ailes et monte vers la face en lévitation (chantier 05) ; on voit son trajet
  si on dézoome.
- **Générations de vaisseau** (liées aux âges, chantier 08) :

| Âge       | Vaisseau                                    | Vitesse | Soute       | Fiabilité | Particularité               |
| --------- | ------------------------------------------- | ------- | ----------- | --------- | --------------------------- |
| Éden      | Oiseau de bois et de toile, ailes à pédales | ×0,6    | petite      | 70 %      | peut casser (retour à vide) |
| Pierre    | Oiseau de rondins et de cordes              | ×0,8    | moyenne     | 85 %      |                             |
| Fer       | Oiseau de métal riveté, ailes à vapeur      | ×1      | grande      | 95 %      | blindage                    |
| Industrie | Oiseau aérodynamique, propulseurs           | ×1,5    | très grande | 99 %      | arme de bord                |

- Le niveau de l'aire d'envol continue d'améliorer soute et vitesse dans un même âge.

### Missions

- **Reconnaissance** (dès le Nid 1 et le premier âge) : 1–2 kiwis, peu de provisions, pas de
  combat recherché. Rapporte des **informations** : défense estimée, types d'ennemis (furets /
  chauves-souris, chantier 06), carte partielle de la face (lève le brouillard, chantier 05),
  gisements visibles. Risque : être repéré (combat forcé, pertes possibles), vaisseau fragile.
  La qualité de l'info dépend des stats des éclaireurs (agilité, esprit) et du vaisseau.
- **Raid** (existant) : combat et pillage, provisions, soute partagée.
- Plus tard : **colonisation** (combat de boss exigeant de grosses unités, chantier 08 —
  Kikiwiwis), échanges entre faces alliées (caravanes).
- Les infos vieillissent : un rapport « vu il y a 2 jours » est moins fiable.

### Impact technique

- Shared : type de mission dans `launchExpedition`, résultats d'information stockés dans l'état
  (`intel` par cible, date), fiabilité et casse (RNG seedé), profils de vaisseau par âge
  (provisoirement par niveau d'aire tant que les âges n'existent pas).
- Rendu : modèle d'oiseau articulé (ailes animées, pattes repliées), trajectoire entre les deux
  faces, carte de la face adverse révélée par morceaux sous le brouillard.
- UI : choix du type de mission dans le planificateur, rapport de reconnaissance (carte,
  ennemis, estimation de défense), fiche des cibles enrichie.

## Découpage proposé

1. Modèle et animations de l'oiseau mécanique (repos, envol, vol, atterrissage). Commit.
2. Missions de reconnaissance + intel + brouillard levé sur la face adverse. Commit.
3. Fiabilité/casse, générations de vaisseau (préparées pour les âges). Commit.
4. Équilibrage, docs, skill (`kiwar-expeditions`).

## Questions ouvertes

1. L'aire d'envol doit-elle être disponible dès le Nid 1 pour la reconnaissance (aujourd'hui
   Nid 2) ?
2. Que rapporte exactement une reconnaissance réussie : carte complète ou partielle ? nombre
   d'ennemis exact ou fourchette ?
3. Un vaisseau cassé : retour à vide, ou perte du vaisseau (à reconstruire) ?

## Réponses du porteur

1. L'aire d'envol reste au **Nid 2**.
2. Une reconnaissance rapporte une **carte partielle** (secteurs cumulés d'une mission à
   l'autre) et des **fourchettes** (défense, furets, chauves-souris), plus précises avec
   l'Agilité/Esprit des éclaireurs et le vaisseau, plus larges en vieillissant.
3. Un vaisseau cassé **revient à vide** et l'aire d'envol est **à réparer**.
4. Éclaireurs repérés : **escarmouche légère** (au plus une perte, surtout des blessés,
   rapport bâclé). Raid à l'aveugle permis (chances « inconnues »). La garnison **grossit
   lentement** chaque jour. Anti-triche **en ligne** (en solo la vérité reste dans la sauvegarde
   locale, jamais affichée).

## Ce qui a été fait

1. **Vérité cachée** : garnisons extraterrestres tirées d'une graine secrète (serveur), jamais
   renvoyées au client ; le serveur résout les atterrissages ; les joueurs ne lisent plus la
   table `games` (migration). Rapports (`intel`) qui vieillissent ; un raid rapporte la défense
   affrontée.
2. **Reconnaissance** : 1–2 éclaireurs, vaisseau léger, 12 secteurs, fourchettes qui contiennent
   toujours la vérité, repérage et escarmouche ; planificateur (choix de mission, prévision),
   carte SVG de la face cible, rapport, nuages de la face jumelle qui s'ouvrent.
3. **Vaisseaux** : bois 70 %, rondins 85 %, fer 95 % (blindé), propulseurs 99 % (âge
   Industrie) ; casse tirée au décollage, demi-tour à mi-chemin, aire à réparer.
4. **Oiseau mécanique** : modèle par génération, respiration et lissage des ailes sur l'aire,
   décollage, vol vers la face jumelle, atterrissage, fumée en cas de panne.
5. **Équilibrage** : sonde `pnpm balance:expeditions` (voir `docs/DECISIONS.md`), docs et skill
   `kiwar-expeditions`.

## Ce qui reste

- Générations de vaisseau liées aux **âges** (chantier 08) : `shipOf` est le point d'entrée.
- Colonisation (combat de boss, Kikiwiwis), caravanes entre faces alliées.
- Le bot de colonie n'utilise pas les expéditions.
- Les autres kiwis d'un univers ne sont pas dessinés en 3D.
