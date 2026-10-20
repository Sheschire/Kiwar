# Chantier 12 — Logistique visible, vagues orientées, nuit plus courte

Retours de partie d'octobre 2026 sur le moteur : comprendre quand une ressource est récoltée,
rendre le placement utile, donner une direction aux attaques.

## Intention du porteur

- « Vraie décision à prendre : la ressource ajoutée quand le kiwi la dépose, et pas par heure ?
  Sinon il y a peu d'intérêt à améliorer les chemins et à optimiser le placement des bâtiments.
  En l'état, ce n'est pas intuitif de se dire "je place ce bâtiment à côté du chemin pour qu'il
  y aille plus vite", et on comprend mal à quel moment la ressource est collectée quand on suit un
  kiwi. »
- Planète alien fixe (chantier 10) : « dans l'idée, l'essentiel des vagues arriverait dans un
  angle entre la planète alien et la nôtre, même si d'autres peuvent passer par les côtés si on
  ne défend pas assez la muraille. »
- Quelle est la portée des tourelles ? Quel est l'intérêt des chemins ?
- La nuit est un peu trop longue.

## État actuel (code)

- **Récolte** : le stock monte au débit horaire entre deux événements (`advance.ts`, `accrue`).
  Le débit d'un producteur = récolte de base × main-d'œuvre × **efficacité logistique** × cycle
  × technologies / places, plafonné par le gisement (`sim/territory.ts`).
  - L'efficacité logistique vaut `(30 + 12) / (30 + 4 × d)`, bornée entre 0,35 et 1,25. `d` est
    la distance de marche (Dijkstra) jusqu'au dépôt le plus proche (Nid ou Entrepôt).
  - Coûts de marche : chemin 0,35, rayon 0,5, chair 1, bosquet 1,5. Les chemins ignorent la
    neige.
  - **Les chemins et le placement comptent donc déjà**, mais rien ne le montre.
- Les kiwis 3D sont **purement décoratifs** (`render/kiwis.ts`) : allers-retours au rythme fixe,
  sans lien avec l'efficacité réelle.
- **Défense** : aucune portée. `defenseOf` (`sim/threats.ts`) additionne toutes les tourelles du
  bon type (sol 4/8/14, munitions en pépins), la garnison et la milice. La mise en scène fait
  partir les furets de remparts au hasard et les chauves-souris d'un angle au hasard
  (`render/predators.ts`).
- **Nuit** : 30 min sur une journée de 2 h (20 min en été), travail à 40 % (`data/cycles.ts`).
- **Bug repéré** : un kiwi sans lit reçoit `distance: 0` (`sim/rest.ts`), donc il compte comme
  « proche de son travail » et améliore le confort au lieu de le baisser.

## Réponses du porteur (octobre 2026)

1. **On garde le débit horaire exact** (pas de dépôts individuels dans la simulation, trop
   coûteux hors ligne) et on rend la **logistique visible**.
2. **Défense par secteurs avec portée** : la muraille est découpée en 3 secteurs (un front face à
   la planète alien, deux flancs). La vague répartit sa force (≈ 60 % front, 20/20 flancs) et
   déborde vers le flanc le plus faible. Chaque tourelle défend son secteur dans sa portée. La
   résolution reste en une fois.
3. **Nuit à 20 min (15 en été)** sur une journée de 2 h.

## Proposition

### Logistique visible

- Les kiwis 3D font leurs allers-retours à un rythme qui **découle du débit réel** : plus la
  distance est grande, plus le trajet est long. Chaque dépôt affiche un petit « +3 » flottant
  (qui correspond au débit moyen).
- Le panneau d'un producteur affiche « Logistique : 92 % (4 pas jusqu'au Nid) ».
- Lors de la pose d'un bâtiment, la tuile survolée affiche l'efficacité prévue. Lors du tracé
  d'un chemin, on voit le gain (« Pulperie 78 % → 104 % »).
- Calque optionnel « logistique » : il colore les producteurs selon leur efficacité.

### Vagues orientées et portée

- **Secteurs** : les tuiles de rempart sont réparties en front / flanc gauche / flanc droit selon
  leur angle par rapport à la direction de la planète alien (fixe, chantier 10). Cette direction
  est dérivée de la graine du monde, donc partagée par la simulation et le client.
- **Répartition** : puissance de la vague × parts (front 0,6, flancs 0,2). L'excédent non arrêté
  d'un secteur déborde à 50 % vers le flanc le moins défendu. Les chauves-souris ignorent
  davantage les secteurs (plus de dispersion).
- **Portée** : chaque tourelle couvre les tuiles de rempart dans un rayon (proposition : 3 / 4 / 5
  tuiles selon le niveau). Une tourelle compte pour chaque secteur qu'elle touche, au prorata.
  La garnison est affectée à un secteur (sinon répartie).
- **Prévision** et écran Défense : la force par secteur (« Front : sol 12 / 9 annoncés ✓,
  Flanc droit : 2 / 3 ✗ »). Les cercles de portée s'affichent quand on sélectionne une tourelle
  ou pendant la pose.
- **Mise en scène** : les furets arrivent par le secteur qui correspond, et l'essentiel depuis
  le front.

### Nuit et repos

- Nuit à 20 min (15 en été), puis revérifier la faim, le repos et la proportion de vagues de nuit
  avec le bot.
- Corriger le bug de confort du kiwi sans lit, et afficher dans l'interface ce que coûte un lit
  manquant (« 2 kiwis sans lit : −X % de présence »).

## Impact technique

- Simulation : `defenseOf` et `waveOutcome` deviennent sectoriels, avec la direction alien
  dérivée de la graine. Migration : les anciennes parties gardent le même résultat avec un seul
  secteur, ou bien on accepte un changement d'équilibrage. Mise à jour de la prévision partagée.
- Les données de nuit changent (`data/cycles.ts`) : vérifier le calendrier des parties en cours
  (passage d'une durée à l'autre sans saut de jour).
- Client : `render/kiwis.ts` (rythme selon l'efficacité), `render/predators.ts`, calques et
  aperçus de pose.
- Équilibrage sur les deux faces (skills `kiwar-balance`, `kiwar-threats`, `kiwar-cycles`).

## Découpage proposé

1. **Nuit raccourcie**, correction du bug de confort, coût d'un lit manquant affiché.
2. **Logistique visible** : rythme des kiwis, « +N », efficacité dans le panneau, à la pose et au
   tracé des chemins.
3. **Secteurs et portée** dans la simulation, avec la prévision.
4. **Écran Défense, cercles de portée et mise en scène orientée.**
5. Équilibrage, docs, skills.

## Critères d'acceptation

- Poser un bâtiment près d'un chemin montre un gain chiffré avant la pose.
- Une tourelle mal placée (loin du front) se voit dans la prévision.
- Résultat exact hors ligne, et Kiwisu et Kiwino à ±10 %.

## Questions ouvertes

1. Parts front/flancs (60/20/20) et portées (3/4/5) : à valider, ou à faire varier selon le
   biome ?
2. Les chauves-souris doivent-elles aussi suivre les secteurs, ou rester « partout » (seule la
   défense aérienne globale compte) ?
3. Les anciennes parties : accepter un changement de défense, ou un secteur unique jusqu'à la
   prochaine vague ?
