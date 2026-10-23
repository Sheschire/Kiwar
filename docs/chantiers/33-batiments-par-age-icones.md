# Chantier 33 — Atelier de contenu : bâtiments par âge et icônes 3D

Acte I « Le rythme » du [carnet de route](../CARNET_DE_ROUTE.md). **Client seul.** Après le **30**
(niveaux 1–12) ; en parallèle possible du 31 et du 34 (fichiers différents).

**Skills à charger** : `kiwar-client`, `kiwar-ages` (habillage par âge).

## Fait (octobre 2026)

- **Familles et kit** : `render/models/` (`kit.ts`, `ageKit.ts`, `housing.ts`, `production.ts`,
  `storage.ts`, `knowledge.ts`, `defense.ts`, `travel.ts`, `monument.ts`) ;
  `buildingModels.ts` garde les entrées publiques, l'habillage, les enseignes et les lumières.
- **Le look suit le niveau du bâtiment** (`lookOf` : âge du niveau, palier 1–3), pas l'âge de
  la colonie (qui ne choisit plus que l'oiseau du vaisseau). Les âges suivants gardent toutes
  les pièces de l'Éden (forme du niveau 3) refaites dans leurs matériaux ; le palier 2 ajoute
  l'annexe de l'âge, le palier 3 son couronnement. Les quatre looks pour le Nid, la pulperie,
  l'atelier à fibre, le puits, la carrière, la hutte, l'entrepôt, la Bibliothèque, l'École et
  l'aire d'envol ; le monument garde un modèle par niveau (= par âge), le labo est habillé en
  Fer.
- **Tourelles redessinées** : une arme par âge, de profil, plus grande (arbalète, baliste,
  canon à graines, canon double ; fronde, fronde à contrepoids, mortier, trois tubes).
- **Vignettes 3D** (`render/thumbnails.ts`, `BuildingThumb`) dans les Plans (cartes et lignes
  de niveaux), la bannière de placement, les options de construction, la fiche et la file ;
  silhouette noire pour ce qui est verrouillé ou caché.
- **Planche** : `?sheet&age=N` montre les trois niveaux de l'âge, `&levels=3,4` un passage,
  `&zoom=`.
- **Mesures** (rendu logiciel, village complet) : Éden inchangé, Industrie +4 % par image,
  +1,5 % d'appels de dessin (détail dans `DECISIONS.md`).

**Reste** (dans `DETTE.md`) : confirmer les images/s sur un vrai GPU ; empreintes 3 et 7
tuiles pour le chantier 35 ; enseignes toujours en SVG.

## Intention du porteur

- « Peu d'amélioration visuelle sur les bâtiments au niveau 4 (par exemple le nid). Visuellement
  on doit voir qu'on a changé d'âge. »
- « Les icônes des bâtiments ne doivent pas être des logos mais les vraies assets des bâtiments,
  en silhouettes noires si non débloqués. »
- « Revoir le design des tourelles. »
- « Il nous manque beaucoup de contenu (textures, bâtiments, animations). » Ce chantier
  construit l'**outil** qui rend chaque nouveau bâtiment peu coûteux (camp d'entraînement, Forge,
  Mairie, cabaret, décorations… des actes II et III).

## Décisions déjà prises

- Trois niveaux par âge (chantier 30) : **le look change à chaque âge, les détails à chaque
  niveau**.
- Tout reste procédural (pas de modèles téléchargés) : style cohérent, poids nul.

## État actuel (chemins sous `apps/client/src/`)

- `render/buildingModels.ts` (1 524 lignes) contient toutes les familles : `buildingModel`,
  `buildingGeometry`, `shipModel`, l'oiseau du vaisseau (`bird`), l'échafaudage et le piquet.
  - Les niveaux 4–6 reprennent le modèle du 3, agrandi et habillé selon l'âge (clous et fanions
    dorés), d'après la dette des chantiers 08, 11 et 17 dans `docs/DETTE.md`.
- `render/buildings.ts`, `render/buildingLife.ts` (parties animées), `render/signs.ts`
  (enseignes), `render/windows.ts`, `render/palette.ts`.
- Les icônes sont des SVG en ligne : `<Icon name={buildingIcon(type)}>` dans
  `ui/components/BuildingTree.tsx:99,113` et `ui/iconSet.tsx:473`.
- Le seul rendu hors écran des modèles est la planche `?sheet`
  (`sheet/buildingSheet.ts`), une bonne base pour les vignettes.

## Proposition

### Le kit

- Découper `buildingModels.ts` en familles dans `render/models/` : production, logement,
  stockage, savoir, défense, voyage, monument.
- Un **kit de pièces** (murs, toits, poteaux, cheminées, fanions, enseignes) et de **matériaux
  par âge** :

  | Âge       | Matériaux                       |
  | --------- | ------------------------------- |
  | Éden      | écorce, liane, feuilles         |
  | Pierre    | pierres sèches, chaume          |
  | Fer       | poutres cerclées de fer, tuiles |
  | Industrie | brique, laiton, verre, tuyaux   |

- Chaque bâtiment devient une **recette (âge, palier 1–3)** :
  - le palier 1 d'un âge donne la silhouette de base de cet âge ;
  - le palier 2 ajoute une annexe ;
  - le palier 3 ajoute un couronnement (toit plus haut, ornement, lumière).
- Prévoir des empreintes de 1, 3 ou 7 tuiles (chantier 35) dans les recettes.
- Le Nid, la pulperie, l'atelier à fibre, le puits, la carrière, la hutte, l'entrepôt (avec ses
  tas de réserve du 30), la Bibliothèque, l'École, l'aire d'envol, le labo et le monument
  reçoivent leurs quatre looks.
- **Tourelles redessinées** : la tourelle à graines et la tourelle du ciel deviennent lisibles
  de loin (silhouette, canon visible), avec un look par âge.
- Rester dans le budget d'images/s : géométries fusionnées par modèle, mêmes matériaux partagés
  (`render/palette.ts`), mesure avec `?debug`.

### Les icônes 3D

- Un **rendu de vignettes** au premier besoin : chaque type et âge est rendu hors écran en
  petite image (64–96 px). Le résultat est mis en cache en mémoire (URL d'objet) et partage le
  contexte WebGL.
- Un bâtiment verrouillé s'affiche en **silhouette noire**. Le SVG actuel sert d'attente pendant
  le rendu, et de secours.
- Ces vignettes sont utilisées dans l'arbre des bâtiments, le menu de construction, la file, les
  fiches et l'écran Plans.

## Découpage proposé

1. Découpage en familles et kit de pièces, sans changement visible (comparaison avec la planche
   `?sheet`).
2. Looks par âge et détails par palier : producteurs, hutte, entrepôt, Nid.
3. Looks par âge des autres bâtiments et refonte des tourelles.
4. Vignettes 3D, silhouettes, intégration dans l'interface.
5. Mesures (images/s, appels de dessin), captures desktop + téléphone (Éden, Pierre, Fer,
   Industrie), docs (`kiwar-client`, `kiwar-ages`), `PLAN.md`.

## Critères d'acceptation

- On reconnaît l'âge d'un bâtiment d'un coup d'œil ; le passage de 3 à 4 se voit nettement.
- Les menus montrent les vrais bâtiments, et une silhouette noire pour ce qui est verrouillé.
- Les tourelles se lisent de loin.
- Images/s au repos et en mouvement inchangées (à 10 % près) ; `?sheet` montre tous les looks.
