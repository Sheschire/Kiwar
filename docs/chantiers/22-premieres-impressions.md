# Chantier 22 — Premières impressions : chargement et intro

> **Fait** (octobre 2026). Réponses du porteur : dessin plat ; tap ou glisser déclenchent la
> coupe mais la lame suit toujours la couture ; une phrase d'ambiance ; un voile de chair qui
> fond. Voir « Bilan » en fin de document et `DECISIONS.md`.

Retours de partie de fin octobre 2026. **Client seulement** : peut tourner en parallèle des
chantiers 19, 20 et 23.

## Intention du porteur

- « Texte **« On épluche le kiwi »** au chargement de la page, c'est nul. Prépare une
  **animation kiwi oiseau qui court sur un kiwi fruit**. »
- Intro : « **Clic sur le kiwi** pour lancer l'animation de slash. En attendant, le kiwi est en
  **surveillance, en rotation**, avec un **bouton pour appeler à cliquer**. »
- « Le slash doit avoir **la même orientation que la coupe** du kiwi. »
- « Ambiance plus **organique** si possible au moment de la découpe, plus **réaliste**. »

## État actuel (code)

Chemins sous `apps/client/src/`.

- **Chargement** : le texte `app.loading` (`i18n/fr.ts` ligne 7) s'affiche dans `BootScreen`
  (`ui/components/Guard.tsx` ~23-51) tant que `s.game === null`. Avant lui, un `#loader` HTML
  (`index.html` ~52 : icône et « Kiwar ») s'efface deux images après le premier rendu
  (`startGame.tsx` ~377-384).
- **Intro** : `render/intro.ts` (scène), `render/introFx.ts` (kiwi poilu, trait de lame, jus),
  `ui/intro.ts` (son `intro.slice`), `ui/components/IntroOverlay.tsx` (bouton Passer, puis choix
  de la face).
  - Tout est minuté, sans action du joueur : `T_SLICE 1,6 s`, `T_PART 1,9 s`, `T_CHOICE 3,3 s`.
    Un tap ou « réduire les animations » saute directement au choix.
  - La coupe est le plan x = 0. Le fruit roule autour de X, donc la couture reste **vue par la
    tranche** depuis la caméra (sur +Z). La lame est un quad vertical face caméra, penché de
    0,12 rad : à l'écran, un trait vertical le long de la couture. L'orientation correspond donc
    déjà, mais **on ne voit pas la coupe** : elle est de profil.
  - Jus : `JuiceBurst`, 150 gouttes vertes + 22 pépins en `InstancedMesh`, gravité, 1,5 s.

## Proposition

### Écran de chargement

- Une petite scène en **SVG + CSS** (aucun Three.js : elle doit s'afficher avant que le jeu
  charge) : un kiwi fruit qui tourne lentement sous un kiwi oiseau qui court dessus, comme sur
  un tapis roulant (pattes en deux images, petit rebond, plumes qui bougent).
- Remplace le texte et unifie le `#loader` d'`index.html` et le `BootScreen` (même animation,
  pas de saut entre les deux).
- Sous l'animation, une barre ou des points discrets si le chargement dure, et le message
  d'erreur actuel en cas d'échec.
- `prefers-reduced-motion` : image fixe.

### Intro interactive

- **Attente** : le kiwi fruit entier tourne lentement dans l'espace, vu de **trois quarts**
  (on voit la ligne où il sera coupé : une couture claire, à peine marquée). Une lueur pulse
  doucement ; un bouton « **Trancher le kiwi** » (et « Touche le kiwi » sur téléphone) appelle
  à l'action. Le tap sur le kiwi ou sur le bouton lance la coupe. Le bouton Passer reste.
- **Orientation** : la rotation d'attente s'arrête en douceur avec la couture alignée sur une
  diagonale de l'écran ; la lame suit **exactement** cette diagonale. Le trait de lame est
  dessiné dans le plan de coupe (pas un quad face caméra).
- **Découpe organique** :
  - ralenti de 0,3 s à l'impact, son plus mat (chair qui cède, puis éclaboussure) ;
  - la chair se révèle humide (reflets spéculaires, texture des fibres rayonnantes et du cœur
    blanc, pépins noirs en anneau) ;
  - le jus coule en filets qui s'étirent entre les deux moitiés avant de casser, puis gouttes
    plus fines ;
  - les poils de la peau frémissent au choc ;
  - flash remplacé par une lueur chaude et brève sur la tranche.
- Ensuite, comme aujourd'hui : les moitiés s'écartent et se tournent vers la caméra, choix de
  la face.

## Impact technique

- Client seulement : `index.html`, `Guard.tsx`, `startGame.tsx`, un `LoadingKiwi` (SVG + CSS),
  `render/intro.ts`, `render/introFx.ts`, `IntroOverlay.tsx`, `ui/intro.ts`, i18n FR + EN, son
  `intro.slice` (et éventuellement `intro.juice`, remplaçable depuis `/admin`, skill
  `kiwar-audio`).
- Budget : l'intro tourne sur téléphone bas de gamme ; textures procédurales (canvas) plutôt
  que fichiers, nombre d'instances raisonnable.

## Découpage proposé

1. Écran de chargement animé (SVG/CSS), unifié avec `#loader`.
2. Intro : attente, rotation, appel à l'action, tap pour trancher, lame dans le plan de coupe.
3. Découpe organique : chair humide, filets de jus, ralenti, son ; captures et vidéo, docs,
   skill `kiwar-world`.

## Critères d'acceptation

- Plus de texte « On épluche le kiwi » ; l'animation tourne sans à-coups dès l'ouverture.
- L'intro attend le joueur ; la lame suit la ligne de coupe visible.
- La découpe paraît juteuse et naturelle sur desktop et téléphone, à 60 images/s sur un
  téléphone moyen.

## Questions ouvertes

1. Écran de chargement : le kiwi oiseau en dessin plat (style des icônes du jeu, proposé) ou en
   rendu plus détaillé ?
2. Intro : un seul tap tranche, ou un **geste de glisser** du doigt qui trace la coupe (plus
   amusant, mais l'orientation suit alors le geste) ?
3. Faut-il une phrase d'ambiance pendant l'attente (« Une planète kiwi dérive dans
   l'espace… ») ?

## Bilan

Fait :

1. **Écran de chargement** (`index.html`) : kiwi oiseau en aplats qui court sur une tranche de
   kiwi qui tourne, en SVG + CSS, points après 2,5 s, image fixe en mouvement réduit. Le même
   `#loader` reste jusqu'à la colonie, l'intro ou l'erreur (plus de saut vers `BootScreen`,
   qui ne montre plus que l'erreur).
2. **Intro interactive** : phase `waiting`, kiwi de trois quarts qui dérive et tourne, couture
   claire sans poils, lueur qui pulse, « Trancher le kiwi » / « Touche le kiwi », phrase
   d'ambiance, tap ou glisser sur le fruit. La rotation se pose avec la couture en diagonale
   et la lame court **sur l'arc visible de la couture**, dans le plan de coupe.
3. **Découpe organique** : ralenti, voile de chair humide (cœur, fibres, pépins, reflets) avec
   une lueur chaude brève puis qui fond vers les tuiles, filets de jus qui s'étirent et
   cassent, gerbe plus fine, poils qui frémissent, son plus mat et nouveau son `intro.juice`.

Reste : mesure sur un vrai téléphone (le rendu headless est logiciel) ; écoute des sons
synthétisés ; filets de jus en cylindres simples.
