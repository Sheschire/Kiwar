# Chantier 06 — Menaces : furets et chauves-souris, défenses, cadeaux du ciel

Ce chantier remplace l'ancien « Jalon 5 — menaces ». Les décisions déjà prises restent valables
(voir `VISION.md`, section « Décisions pour le Jalon 5 ») : grosses vagues annoncées 8–12 h à
l'avance, petits incidents sans préavis mais mineurs, puissance ∝ taille de la colonie × temps de
jeu (puis âge, chantier 08), protection des débutants, jamais de colonie rasée mais de gros
dégâts possibles, défenses = tourelles à pépins **et** garnison. Le ciel apporte aussi du bon.

## Intention du porteur (nouveau)

« Furets et chauves-souris ennemis comme extraterrestres : ce sont les prédateurs naturels des
kiwis, cool pour le lore. Avoir des ennemis terrestres et volants est voulu : impossible de tuer
des ennemis volants sans kiwis volants ou mages (les guerriers, armés d'épées, sont forts contre
les furets mais ne touchent pas les chauves-souris). Sauf à un âge avancé, avec des armes à feu. »

Note de lore : en Nouvelle-Zélande, les mustélidés (hermines, furets) sont réellement les grands
prédateurs des kiwis. Les chauves-souris sont une invention de l'univers Kiwar : on peut en faire
des « vampires de jus » attirés par les bassins et les réserves de jus.

## Proposition

### Deux familles d'ennemis

| Famille                         | Mouvement                                                                              | Cible préférée                                   | Touché par                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Furets (meute, terrestres)      | marchent depuis la falaise, suivent le terrain (chemins = autoroutes pour eux aussi !) | stocks de pulpe, kiwis isolés, camps             | guerriers, mages, tourelles, garnison                                              |
| Chauves-souris (nuée, volantes) | survolent tout, de nuit surtout                                                        | réserves de jus, kiwis endormis, bâtiments hauts | mages, éclaireurs volants, tourelles (tirs anti-aériens), armes à feu (âge avancé) |

- Variantes plus tard : furet blindé, chauve-souris géante (boss), reine des furets.
- Les extraterrestres des faces ennemies **sont** ces prédateurs : les expéditions (et le
  chantier 07) les rencontrent sur leur terrain ; les raids viennent des faces qu'on provoque.

### Défenses

- **Tourelles à pépins** : sur les tuiles au bord de la falaise de peau ; tir automatique (aussi
  hors ligne), consomment des pépins par tir ; portée, cadence, anti-sol / anti-air selon le
  modèle. Sans pépins, elles se taisent (tension sur les pépins).
- **Garnison** : des kiwis postés en défense (ne récoltent plus). Leur efficacité dépend de leur
  classe et de leurs stats (chantier 03) : guerriers contre furets, mages/volants contre
  chauves-souris.
- **Prévision partagée UI/simulation** (comme `forecastExpedition`) : « force de défense contre
  la prochaine vague : sol 12 / air 4 — menace annoncée : sol 9, air 7 → défaite probable ».
- Résolution d'une vague en une fois (pas de combat temps réel), mais **mise en scène** à
  l'écran si le joueur est présent (furets qui accourent, tirs, chauves-souris qui piquent).

### Conséquences d'une défaite (jamais de colonie rasée)

- Bâtiments **endommagés** (production ×0,5 tant qu'ils ne sont pas réparés, commande `repair`
  qui coûte des ressources et du temps de bâtisseur).
- Pillage plafonné du stock non protégé (l'entrepôt protège une part).
- Kiwis blessés (indisponibles un temps) ; morts possibles seulement sur les grosses vagues, en
  nombre limité.
- Bouclier après une attaque subie (pas d'acharnement).

### Petits incidents et cadeaux du ciel

- Incidents : un furet solitaire qui vole de la pulpe, une chauve-souris qui boit dans un bassin,
  une tempête qui casse un chemin — mineurs, sans préavis, fréquents (quelques par jour).
- Cadeaux : **pluie de météorites de ressources** (annoncée par une étoile filante ; tuile
  d'impact à récolter avec un camp ou un bâtiment), plus tard des **technologies** tombées du
  ciel (chantier 08). Ampleur ∝ âge × temps de jeu, comme les menaces.

## Impact technique

- `data/threats.ts`, état `threats` (prochaine vague planifiée via le RNG du state, historique),
  résolution comme événement de `advance` (exact hors ligne), dégâts dans l'état des bâtiments.
- Nouveau bâtiment `turret` (tuiles adjacentes à la peau), job `guard` / commande `setGarrison`,
  commande `repair`.
- Biomes (chantier 05) : fréquence des furets / chauves-souris.
- Saisons (chantier 04) : chauves-souris surtout la nuit et en été ? furets affamés en hiver ?
- Client : compte à rebours dans le HUD, prévision de défense, modèles (furet, chauve-souris,
  tourelle), mise en scène, bâtiments abîmés (fumée), rapport d'attaque, sons (chantier 02).
- Bot d'équilibrage : doit défendre ; vérifier qu'un joueur passif ne perd jamais tout.

## Découpage proposé

1. Moteur des vagues et incidents (planification, préavis, résolution, dégâts, réparations). Commit.
2. Défenses : tourelles, garnison, prévision. Commit.
3. Cadeaux du ciel (météorites de ressources). Commit.
4. Client : HUD, modèles, mise en scène, rapports. Commit.
5. Équilibrage, docs, skill `kiwar-threats`.

## Questions ouvertes

1. Les tourelles tirent-elles automatiquement hors ligne (proposé : oui) ?
2. Peut-on **esquiver** une vague (évacuer les kiwis dans le Nid, cacher les stocks) ?
3. Fréquence exacte des petits incidents ?
4. Chauves-souris surtout la nuit (lien avec le chantier 04) ?
5. Faut-il des dégâts sur les chemins et les gisements (furets qui saccagent) ?

## Réponses du porteur

1. Tourelles automatiques hors ligne : oui.
2. Esquive : oui, « Tous au Nid » pendant la fenêtre de la vague (personne n'est blessé, la
   récolte s'arrête ; bâtiments et stocks ne sont pas épargnés). Absorber = entrepôts.
3. Environ 3 petits incidents par jour, très mineurs.
4. Chauves-souris surtout la nuit et en été, furets affamés en hiver.
5. Les furets peuvent piétiner des chemins, jamais les gisements.
6. Une grosse vague par jour réel, protection 24 h + Nid 2, au plus 1 mort par vague (menace >
   2× la défense, jamais sous 4 kiwis), météorites = gisements temporaires (~1 par jour).

## Réalisé (chantier terminé)

1. **Moteur des vagues** (`data/threats.ts`, `sim/threats.ts`) : planification, annonce,
   résolution dans `advance` (exact hors ligne, flux RNG à part), dégâts, pillage plafonné,
   blessés, mort rare, bouclier, abri, réparations, incidents.
2. **Défenses** : Arbalète à pépins et Fronde céleste sur le rempart de peau (munitions en
   pépins), garnison (job `guard`, affinités de classe), prévision partagée `forecastWave`.
3. **Cadeaux du ciel** (`sim/sky.ts`) : étoile filante, cratère-gisement de 48 h récolté par un
   camp ou un producteur à portée.
4. **Client** : badge de menace, écran Défense, garnison dans la fiche du kiwi, réparation,
   fumée, mise en scène des vagues, rapports, résumé hors ligne, sons.
5. **Équilibrage** : le bot défend (tourelles, garnison avant l'impact, abri, réparations) ;
   rapport par biome des vagues perdues. Skill `kiwar-threats`.

Reste pour plus tard : variantes (furet blindé, chauve-souris géante, reine des furets) ; armes
à feu aux âges avancés (chantier 08) ; technologies tombées du ciel (chantier 08) ; raids venus
des faces provoquées dans les univers partagés (aujourd'hui la provocation augmente seulement la
puissance) ; vrais modèles 3D décimés (glTF ~1–2k triangles) à la place des modèles procéduraux.
