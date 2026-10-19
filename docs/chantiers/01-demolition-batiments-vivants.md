# Chantier 01 — Démolition et bâtiments vivants

> **État : terminé** (3 commits sur `main`). Voir « Bilan » en fin de document.

Deux sujets courts et indépendants, pour corriger un manque de gameplay et donner de la vie au
village avant les gros chantiers.

## A. Démolir un bâtiment

### Intention du porteur

« Pouvoir supprimer un bâtiment n'est pas encore possible. On peut se retrouver en game over si
on n'a pas pensé à faire une carrière à graines dès le début (en tout cas je n'ai pas vu comment
détruire sur téléphone). »

### État actuel

- Seuls les **camps** se démontent (`dismantle`). Les autres bâtiments sont définitifs.
- Il n'y a pas d'impasse stricte : un camp sur l'anneau de pépins donne des pépins sans bâtiment,
  et le Nid produit pulpe et fibre. Mais la limite de bâtiments du Nid peut bloquer un joueur qui
  a mal placé ses bâtiments (gisements épuisés, mauvais emplacement).

### Proposition

- Commande `demolish { buildingId }` pour tout bâtiment **sauf le Nid**. Elle remplace et
  généralise `dismantle` (garder `dismantle` comme alias pour les camps, ou migrer).
- Refus si : construction ou amélioration en cours sur ce bâtiment (annuler d'abord), vaisseau
  parti (Aire d'envol), ou la démolition ferait passer le logement sous la population
  (`housingNeeded`, message clair : « Construisez un autre logement d'abord »).
- **Remboursement** : 25 % de tout ce qui a été investi (construction + améliorations), arrondi
  à 5. Pas de remboursement pour les camps (gratuits).
- **Durée** : immédiate (proposition) — ou un petit chantier de démolition qui occupe un
  bâtisseur 10 % du temps de construction (à trancher).
- Effets : ouvriers libérés (réassignés automatiquement), gisements rendus à la terre avec leur
  épuisement (`releasePool`), le stock au-dessus de la nouvelle capacité n'est pas détruit (règle
  existante : la production s'arrête juste).
- UI : bouton « Démolir » discret en bas de la fiche du bâtiment, **confirmation** (modale sur
  desktop, bottom sheet sur téléphone) qui affiche le remboursement et les conséquences
  (ouvriers, stockage, logement). Petite animation de poussière et de débris.
- Ajouter un test « pas d'impasse » : depuis plusieurs états construits au hasard par un bot,
  on peut toujours obtenir des pépins et du jus et reconstruire.

## B. Bâtiments vivants

### Intention du porteur

« Les bâtiments doivent "vivre" : on veut du mouvement, avoir l'impression que la pompe travaille
sur les grains, que la pompe à jus tourne (avec un petit moulin par exemple). »

### Proposition d'animations (par bâtiment)

| Bâtiment          | Animation au travail                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Nid               | œufs qui oscillent doucement, brindilles qui frémissent ; œuf doré qui brille au niveau 3 |
| Pulperie          | pressoir / piston qui pompe sur la pulpe, gouttes vertes                                  |
| Atelier de fibre  | rouet qui tourne, fil qui s'enroule                                                       |
| Carrière à pépins | marteau-pilon / pompe à balancier qui frappe les grains, éclats noirs                     |
| Puits à jus       | petit moulin à vent (ou noria) qui tourne, seau qui monte et descend                      |
| Hutte             | fumée de cheminée, fenêtre éclairée la nuit (chantier 04)                                 |
| Entrepôt          | petite grue qui pivote, caisses qui montent                                               |
| Aire d'envol      | vaisseau qui respire au repos, drapeau au vent                                            |
| Camp              | feu qui crépite, panier qui se remplit                                                    |

- **L'animation dit l'état** : vitesse proportionnelle à l'activité (ouvriers × efficacité) ;
  à l'arrêt si personne ne travaille, si le gisement est épuisé (animation lente + icône) ou si
  le stockage est plein (pause + icône). Le joueur lit son village d'un coup d'œil.
- Petites particules (gouttes, éclats, fumée) en instanced, désactivées en qualité « basse ».

### Impact technique

- `render/buildingModels.ts` fusionne aujourd'hui chaque modèle en une géométrie. Il faut séparer
  **partie statique fusionnée + parties animées** (pivot, axe, type de mouvement) par type et
  niveau. Un bâtiment = un `Group` (≤ ~40 bâtiments : pas besoin d'instancing pour les parties
  animées).
- `render/buildings.ts` : `update(dt)` anime selon l'activité, fournie par `buildingHarvest`
  (shared) dans `sync`.
- Les ombres sont statiques : les parties animées ne projettent pas d'ombre (ou ombre figée).
- Respecter les presets de qualité (pas d'animation secondaire en « basse »).

## Découpage proposé

1. Démolition (shared + UI + tests), commit.
2. Séparation statique / animé des modèles + animations des producteurs, commit.
3. Particules, animations du Nid, de l'entrepôt, de l'aire d'envol, du camp, commit.

## Critères d'acceptation

- On peut démolir sur téléphone en deux gestes, avec confirmation et remboursement affiché.
- Aucun état sans issue (test).
- Chaque producteur a une animation lisible qui s'arrête quand il ne produit pas ; 60 fps
  conservés sur un téléphone moyen (preset medium).

## Questions ouvertes

1. Démolition immédiate, ou petit chantier qui occupe un bâtisseur ?
2. Remboursement de 25 % : trop, pas assez ? Faut-il un « déménagement » (déplacer un bâtiment
   en gardant son niveau, contre un coût) ?
3. Puits à jus : moulin à vent ou roue à eau (noria) ?

## Bilan

Réponses du porteur : démolition **immédiate**, remboursement **25 %**, **pas de déménagement**
pour l'instant, Puits à jus avec un **moulin à vent**.

Fait :

1. **Démolition** — commande `demolish` (alias `dismantle`) pour tout bâtiment sauf le Nid ;
   refus pendant une amélioration, vaisseau parti, ou logement encore nécessaire ; 25 % de la
   construction + améliorations rendus (rien pour les camps) ; ouvriers réassignés, gisements
   rendus avec leur épuisement, surplus de stock conservé. Lien « Démolir… » en bas de la fiche,
   confirmation (bottom sheet sur téléphone) avec remboursement et conséquences ; effondrement
   dans un nuage de poussière et de débris. Test « pas d'impasse » sur 12 colonies aléatoires.
2. **Producteurs vivants** — modèles séparés en partie statique + parties animées ; pressoir
   de la Pulperie, rouet de l'Atelier, marteau-pilon de la Carrière, moulin et seau du Puits.
   Vitesse ∝ ouvriers ; arrêt si personne ou stockage plein (badge pause), très lent si
   gisement épuisé (badge « ! »).
3. **Particules et ambiance** — gouttes de pulpe, éclats de pépins, gouttes de jus, fumée des
   huttes et du camp, étincelles, scintillement de l'œuf doré ; œufs qui oscillent, brindilles,
   grue de l'Entrepôt, vaisseau qui respire, drapeaux au vent, feu de camp. Tout est coupé en
   qualité « basse ».

Reste / idées :

- Déménagement d'un bâtiment (coût, garder le niveau).
- Fenêtre éclairée des huttes la nuit (chantier 04).
- Mesurer les 60 fps sur un vrai téléphone moyen (preset medium) ; si besoin, instancier les
  drapeaux et parties animées.
- Le remboursement prend le prix de la dernière copie du type (approximation sans changement de
  schéma).
