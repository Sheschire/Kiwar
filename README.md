# Kiwar 🥝

Jeu de gestion **cozy** en 3D isométrique, jouable dans le navigateur (desktop et mobile) : des
oiseaux kiwis développent leur civilisation sur une planète-kiwi coupée en deux (Kiwisu et Kiwino).

- Brief de game design : [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
- Journal des décisions : [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Dernier rapport d'équilibrage : [`docs/BALANCE_REPORT.md`](docs/BALANCE_REPORT.md)
- Plan de route et reprise dans une nouvelle conversation : [`docs/PLAN.md`](docs/PLAN.md)
- Carnet de route (direction du jeu, actes et chantiers à venir) : [`docs/CARNET_DE_ROUTE.md`](docs/CARNET_DE_ROUTE.md)
- Mémoire pour Claude : [`CLAUDE.md`](CLAUDE.md) et les skills de [`.claude/skills/`](.claude/skills)

> **Chantier 48** — **les Tréfonds, première couche : la chair verte**. Dès l'âge du Fer, la
> technologie **Spéléologie** ouvre l'**entrée de tunnel**. Sous la colonie, un réseau de
> salles dans le noir : on y **descend** avec un équipage choisi, des rations et des ordres,
> après une prévision honnête (batailles d'essai, chutes et coupures kiwi par kiwi). Une salle
> gagnée devient une **galerie** où des mineur·euses travaillent jour et nuit, en toute saison
> — mais en bas, iels ne défendent pas la colonie. Par l'entrée remontent parfois les
> **Grouillants** (larves, mouches des fruits, cloportes) : la remontée est annoncée, et l'on
> peut **fermer la porte**, la **fortifier** ou y **poster une garde**. Une septième classe de
> maître, le·la **Spéléologue**, craint deux fois moins les dangers et éclaire la salle
> suivante de sa lanterne. Écran **Tréfonds** (coupe 2D, porte, mines, descentes, rapports).

> **Chantier 47** — **le rythme de la conquête**. La reine des furets ne sort plus avant le
> **jour 13** (une date publique, affichée sur l'écran Conquête avec un compte à rebours), et il
> lui faut les 12 balises à cette date. La prévision d'un débarquement compte désormais **au
> pire** les renforts qu'une caserne cachée pourrait envoyer depuis les parcelles voisines :
> « probable » veut dire gagné même s'ils viennent. Plus de partie bloquée : la conquête vient
> entre les jours 13 et 17 pour un·e joueur·euse attentif·ve.

> **Chantier 46** — **réglages d'après l'acte III**. Un kiwi qui tombe sur un terrain que
> l'on tient (débarquement ou bataille finale gagnés, balise qui tient bon) **revient
> blessé·e** au lieu de mourir ; seules une retraite, une défaite ou une balise perdue tuent
> encore. Le **moral est plus exigeant** : un village bâti place ses kiwis vers 60–75 à la
> Pierre et au Fer, et seuls les discours, les soupers, le cabaret et les feux d'artifice le
> font passer au-dessus de 85. La **reine des furets est plus solide** et le centre de la
> jumelle grandit moins vite à l'âge industriel : la conquête vient vers la troisième semaine.

> **Chantier 45** — **rives fertiles et canaux de jus**, fin de l'acte III. La chair et les
> bosquets au bord du jus **repoussent 30 % plus vite** et s'habillent d'herbes hautes, de
> fleurs et de papillons. Dès l'Éden, la technologie **Canaux** (après Cueillette) ouvre le
> mode **Creuser** : les bâtisseur·euses creusent, tuile par tuile, un canal depuis une
> rivière (80 pulpe + 40 fibre, 1 h) ; il coule depuis sa source, porte un petit gisement de
> jus où poser un puits près du Nid, et fait de nouvelles rives fertiles. Jamais un canal ne
> coupe la terre ni ne noie un bâtiment à la crue ; on peut le combler. 3 / 6 / 10 / 15 tuiles
> selon l'âge.

> **Chantier 44** — **loisirs et décor**. Des **décorations** hors quota (lampions devenus
> lampadaires puis réverbères, massifs de fleurs, arches de liane, fontaine à jus, statue du
> maire) donnent de la **beauté** à tout le village (jusqu'à +8 de moral). Des **jeux**
> (balançoire en liane, quilles de pépins, mare aux ricochets, toboggan d'écorce) sont des
> loisirs qui s'additionnent par type près des huttes, et les kiwis au repos y jouent. Au Fer,
> le **Cabaret du Rouge-Gorge**, façon Moulin-Rouge, ouvre à la tombée de la nuit pour 60 de
> jus : ses lumières rouges brillent, les rouges-gorges dansent le cancan et ses invités
> gardent +12 jusqu'au lendemain soir. Le **canon à feu d'artifice** se tire la nuit, une fois
> par nuit : bouquets, kiwi-fruit ou kiwi-oiseau dessinés dans le ciel, qui remontent le moral
> de tout le village pendant des heures.

> **Chantier 43** — le **moral par kiwi**, début de l'acte III. Chaque kiwi a sa jauge
> (0–100) : repas, lit proche du travail, loisir près de sa hutte, caractère, deuils (plus
> lourds pour ses colocataires et son équipage) ; elle règle son travail (de −30 % à +15 %) et
> l'âge la rend plus exigeante. La **Mairie** (Nid 3) accueille le·la maire et son
> **Discours** : toute la colonie s'y rassemble 20 minutes, puis garde le moral pendant des
> heures (mieux vaut parler le soir). Les **feux de camp** réunissent au crépuscule les kiwis
> qui dorment tout près : ils soupent ensemble, chantent et dansent, et mangent un peu moins
> la nuit.

> **Chantier 42** — **la reine des furets**, fin de l'acte II. À partir de son âge du Fer, la
> civilisation **attaque nos balises**, annoncé 6 h à l'avance : on peut **fortifier** la balise
> depuis chez soi (deux tourelles de notre âge et une tour solide, payées en ressources et en
> fer) ou y **poster une garde** par vaisseau (ses ordres, son seuil de retraite) ; une balise
> nue tombe sans combat et le brouillard revient. Quand les **12 parcelles** sont balisées, la
> **reine sort des tréfonds** au centre de la jumelle (une courte scène, couronnée au-dessus de
> son terrier). La **bataille finale** se joue par phases : sa charge, ses nuées de
> chauves-souris, ses furets d'élite sortis des tunnels, son dernier carré. Vaincue, la jumelle
> est conquise et la **seconde colonie** peut être fondée ; victorieuse, elle garde ses blessures
> trois jours. L'écran **Conquête de la jumelle** rassemble balises, attaques, reine et rapports.

> **Chantier 41** — la **bataille en direct** : quand notre vaisseau se pose sur la jumelle,
> une invitation propose de **regarder le débarquement**. La caméra vole jusqu'à la jumelle,
> qui se rapproche ; le brouillard se lève sur la parcelle quand l'oiseau mécanique touche le
> sol, l'équipage en sort et se bat (bec, épée, boules de feu, fronde…), les chauves-souris
> plongent, la parcelle **brûle** après une victoire incendiaire et la **balise** (un kiwi
> lumineux) est plantée avant que le vaisseau reparte. On **touche un furet** pour voir son
> niveau, ses PV et son équipement ; trois cadrages (parcelle, mêlée, vaisseau), ×1/×2/×4,
> rembobiner, passer. Le **village alien** se dessine sur les parcelles vues, selon leur âge.
> Le rapport propose « Revoir la bataille ».

> **Chantier 40** — le **débarquement** remplace les reconnaissances, les raids et le siège :
> on choisit une des **12 parcelles** de la face adverse, l'équipage et ses **ordres** (prudent
> ou offensif, qui viser d'abord, seuil de retraite, brûler ou piller), avec une **prévision
> honnête** (trois batailles d'essai d'après ce qu'on sait ; le centre jamais vu est
> « redoutable »). À l'atterrissage, la **bataille** se joue vraiment. **Victoire** : une
> **balise** montre la parcelle pour de bon (et le bord des voisines), la parcelle brûle ou se
> fait piller, les survivant·es deviennent vétéranes et vétérans. **Retraite** : un aperçu daté.
> **Défaite** : l'équipage, son équipement et le vaisseau sont perdus, le brouillard revient.
> Tout kiwi tombé meurt pour toujours. Un **bestiaire**
> retient les ennemis rencontrés.

> **Chantier 39** — la **civilisation alien** de la face jumelle vit à **son propre rythme** :
> elle passe ses âges à dates fixes depuis le début de la colonie (la Pierre au jour 1, le Fer
> au jour 4, l'Industrie au jour 12), la même règle pour tout le monde. Ses **12 parcelles**
> ont des bâtiments et une garnison équipée : faibles au bord, deux à trois fois plus fortes au
> centre. Elle **cache** son terrier royal, ses casernes et ses réserves dans les parcelles
> qu'on n'a pas vues, et les déplace quand une tête de pont s'approche. Chaque **raid gagné
> brûle** une parcelle et la retarde ; chaque **équipage perdu la nourrit**. Ses **vagues**
> suivent sa puissance et partent d'une parcelle à casernes, annoncée. L'encart « La
> civilisation adverse » donne son âge estimé et la parcelle de la prochaine vague.

> **Chantier 38** — les météorites apportent surtout du **fer météorique**, un stock à part dont
> le plafond suit le Nid (les épaves fracassées en donnent aussi, et il en tombe au moins une
> tous les 3 jours). À l'âge de pierre, la technologie « Forge » ouvre la **Forge** : on y
> commande des **armes** (lames, masses, frondes et arcs, bâtons et instruments, chacune pour sa
> lignée de classes) et des **armures** légères ou lourdes, de bois et de pierre, puis de fer et
> d'acier. Les forgeron·nes (Force et Dextérité) viennent d'eux-mêmes, et l'armurerie équipe
> d'abord les gardes ; on voit l'équipement sur les kiwis et il compte en bataille. Le fer paie
> aussi les niveaux 7 et plus, les monuments du Fer et de l'Industrie, les tourelles de
> niveau 3 et plus (et la coque des vaisseaux de fer) et quelques technologies.

> **Chantier 37** — **chaque stat a sa classe** : bâtisseur·euse (Force), éclaireur·euse
> (Agilité, dague), guerrier·ère (Endurance, répare 50 % plus vite), mage (Esprit, recherche
> 50 % plus vite), **cueilleur·euse** (Dextérité, récolte 30 % de plus) et **barde** (Charisme,
> moral et chant qui renforce ses voisin·es en bataille) ; leur bonus grandit avec leur stat.
> Dès l'âge de pierre, le **camp d'entraînement** fait monter les **rangs de classe**, ouvre les
> **classes avancées** (Architecte, Navigateur·rice, Champion·ne, Archimage, Herboriste,
> Ménestrel) puis, au Fer, les **classes de maître à deux stats** (Ingénieur·e, Paladin·e,
> Druide, Rôdeur·euse, Titan·e, Oracle), chacune avec son arme. L'**arbre des classes** de la
> fiche montre en vert et en rouge ce qui manque à un kiwi. Le Kikiwiwi perd sa classe.

> **Chantier 36** — les **vagues se jouent pour de vrai** : à l'annonce, chaque meute (furets
> soldats, éclaireurs, brutes ; chauves-souris plongeuses et cracheuses) reçoit sa **brèche** sur
> le rempart, qui pulse sur la carte. Elle s'y rassemble puis charge : les tourelles à portée
> tirent leurs graines, les gardes frappent à l'épée, les mages lancent des **boules de feu**, les
> kiwis au travail donnent des coups de bec. On regarde la bataille **en direct** (ou en replay
> depuis le rapport), ×1/×2/×4, et on touche un combattant pour voir sa fiche. Avant l'impact :
> la **posture** de la garnison (prudente ou offensive), le **secteur** de chaque garde, et la
> liste des brèches qu'aucune tourelle n'atteint. Les kiwis tombés sont blessés ; une mort
> seulement sur une vraie défaite.

> **Chantier 35** — les **grands bâtiments prennent de la place** : l'aire d'envol, la
> Bibliothèque, l'École, le labo et l'entrepôt couvrent **trois tuiles** (touche **R** ou
> « Tourner » pour les orienter), le **monument sept**. Ils se voient de loin (ailes, piste
> éclairée, cuves, place aux obélisques), les kiwis **les contournent** et un gisement couvert
> ne se récolte plus : le fantôme prévient avant. Une pose qui couperait le village en deux est
> refusée. Une vieille partie garde tous ses bâtiments : chacun s'étend où il peut, sinon il
> reste « à l'étroit » jusqu'à sa prochaine amélioration.

> **Chantier 31** — le village **a besoin de vous** : le carnet d'**objectifs** montre toujours
> une **prochaine étape** (une vague à préparer, un bâtiment à réparer, des réserves à rapatrier,
> une recherche à choisir…), **trois objectifs de l'âge** à réclamer (ressources, poussière
> d'étoile, parfois un **œuf offert**) et la **progression vers l'âge suivant**. Les **vagues**
> arrivent dès le **premier jour** (vers 7 h de jeu), puis toutes les 12 à 18 h, annoncées 3 à
> 6 h avant ; elles grossissent avec la **richesse** de la colonie et **pillent d'abord les
> réserves** des entrepôts : la fenêtre de défense liste les parades (« Rapatrier », graines des
> tourelles, gardes, une tourelle de plus, réparations). Une **expédition coûte** désormais
> fibre et jus par kiwi embarqué, affichés avant le départ.

> **Chantier 30** — le **rythme** change : la Pierre arrive vers **12 h** de jeu attentif, le
> Fer vers **3 jours**, l'Industrie vers **10 jours**. Chaque âge ouvre **trois niveaux** de
> bâtiments (Éden 1–3, Pierre 4–6, Fer 7–9, Industrie 10–12) et le Nid suit. Le stock tient
> surtout au **Nid** ; les **entrepôts** ajoutent peu de place mais gardent une **réserve** :
> quand le stock est plein, la récolte continue dedans. Un **toucher sur l'entrepôt** la
> rapatrie (« +1 250 », un petit carillon), le Nid et le menu proposent « Tout rapatrier ». Des
> **tas** montrent les réserves à côté des entrepôts ; réserves pleines, la récolte s'arrête
> (rien n'est perdu). Les anciennes parties gardent leurs niveaux (4/5/6 deviennent 4/7/10).

> **Chantier 33** — on **reconnaît l'âge d'un bâtiment d'un coup d'œil** : au niveau 4, la
> hutte devient une case de pierres sèches sous le chaume, au 7 une maison à colombages sous
> les tuiles, au 10 une maison de brique au toit de tôle avec sa cheminée. Chaque bâtiment a
> ses quatre looks (le Nid sur son socle avec ses arches, la pulperie et sa cuve de cuivre,
> l'atelier et sa machine à vapeur…) ; dans chaque âge, le 2e niveau ajoute une annexe et le
> 3e un couronnement (totem, girouette, mât à éclairs). Les **tourelles** sont redessinées :
> arbalète, baliste, canon à graines puis canon double ; fronde, mortier puis trois tubes. Les
> menus montrent les **vrais bâtiments** en petites images, et une **silhouette noire** pour
> ce qui n'est pas encore débloqué.

> **Chantier 32** — la caméra **s'incline librement à tout zoom** ; après un rafraîchissement
> en ligne, la colonie **s'affiche tout de suite** depuis le cache (lecture seule le temps de
> la synchronisation) et le chargement se mesure avec `?debug`. La carte d'expédition ne
> passe plus sous la file, le panneau d'objectifs garde son état et les âges futurs gardent
> leurs technologies en « ??? ». L'intro laisse **contempler la chair coupée** avant la
> révélation ; le ciel devient un **cosmos étoilé** avec des nébuleuses, plus dense la nuit ;
> les **comètes** volent dans l'espace (une flèche au bord de l'écran les montre, un toucher
> y tourne la caméra). Les **chemins** sont posés dans le sol selon l'âge et les **champs de
> graines** poussent en rangs de tiges et de cosses.

> **Chantier 34** — les kiwis **vivent sur place** : à la Bibliothèque, les chercheur·euses
> lisent et écrivent autour du bâtiment au lieu de faire la navette les mains vides ; à
> l'École, la classe s'assoit en demi-cercle face à l'élève le·la plus avancé·e et essaie le
> geste de sa classe (épée, sort, fronde, marteau) ; les gardes font leur ronde dans **leur
> secteur** ; les bâtisseur·euses martèlent au pied du chantier ; les kiwis sans poste
> picorent, s'étirent, dansent ou discutent à deux. Les **furets et chauves-souris** sont
> redessinés et animés (course, morsure, coup de patte, piqué, crachat, chute) avec un look
> par âge, et les vagues font voler **étoiles et plumes**. Tout se revoit sur la planche
> `?kiwis`.

> **Chantier 19 (2e moitié)** — la face conquise devient votre **seconde colonie** : « Fonder la
> colonie » envoie un **vaisseau de colons** (au moins 5 kiwis, Kikiwiwi permis, et la
> cargaison choisie) ; à l'atterrissage naît une colonie avec un Nid 1 et des abris. Elle
> partage le **calendrier** et la **recherche** (sa Bibliothèque envoie ses points à la
> recherche commune), mais garde **son âge et son monument**. On **bascule** d'une face à
> l'autre (bouton planète, menu du téléphone, « Jouer cette colonie » en visite) ; l'autre
> moitié du kiwi brille dans le ciel, **éclairée et bâtie**. Le vaisseau relie les deux faces
> (**ressources et kiwis**, sans risque). Les **derniers aliens** y lancent des vagues plus
> faibles au début, renforcées par les **nids de furets** encore debout (raid des gardes ou
> Kikiwiwi) ; des **ruines** se fouillent pour du butin. En univers, les allié·es voient votre
> colonie sœur et peuvent lui livrer. Les combats du siège se jouent **en 3D** depuis chez
> soi : la jumelle s'approche, éclairs, couronne de la reine qui tombe, nuages qui se
> dissipent. Le bot mène tout le siège (conquête vers 9–10 jours de jeu).
>
> **Chantier 19 (1re moitié)** — la **face jumelle se conquiert** : dès l'**âge du Fer** et un
> **Kikiwiwi**, l'écran **Siège** (bouton cible, menu du téléphone, aire d'envol) guide en
> quatre étapes. Une **reconnaissance approfondie** estime la force des aliens de chaque
> secteur et cherche l'**antre de la reine des furets** ; un **assaut** prend un secteur
> extérieur et y laisse des kiwis choisis qui **tiennent la tête de pont** (absents, nourris
> sur vos stocks) ; les aliens **contre-attaquent** environ une fois par jour, annoncés 6 h
> avant (une tête de pont qui tombe perd de 50 à 90 % de ses kiwis) ; un **renfort** amène ou
> ramène des kiwis ; le Kikiwiwi **aménage** une tête de pont (12 h, 400 jus). Avec deux têtes
> de pont dont une aménagée, l'**assaut final** affronte la reine **au sol et dans les airs** :
> chaque tête de pont l'affaiblit et tous les kiwis postés se joignent au combat. Victoire :
> la face est conquise et le brouillard se lève (la seconde colonie arrive à la 2e moitié du
> chantier). Les forces réelles restent **cachées côté serveur**.
>
> **Chantier 24** — les planètes sont **de vrais astres** : la jumelle a sa place fixe dans
> l'espace, du côté d'où viennent les vagues, et les planètes des allié·es tournent sur un
> anneau plus loin ; elles tournent lentement sur elles-mêmes. En **dézoomant**, la caméra se
> redresse vers l'horizon et l'on découvre la jumelle puis tout le système. Le bandeau « à
> coloniser » a disparu : au survol, la planète dit son nom et ce qu'on en a exploré, et un
> clic propose **« Y aller »** — la caméra **vole** jusqu'à elle, on tourne autour, puis
> **« Retour à ma colonie »**. Une liste **Planètes** (bouton rond sur ordinateur, menu sur
> téléphone) mène partout en un geste ; sur la jumelle, raccourcis vers l'expédition et le
> siège. De loin, chaque planète ne coûte presque rien à dessiner.
>
> **Chantier 23** — le PC **chauffe moins** : la scène se limite à **60 images/s** (réglage
> 30 / 60 / illimité) et **ralentit au repos** (30 puis 20 images/s quand rien ne bouge,
> reprise immédiate au moindre geste) ; en Auto, la qualité Haute ne se choisit plus que si
> la carte graphique a de la marge. La **lumière suit la journée** : aube rosée, midi franc,
> crépuscule doré avec un contre-jour chaud, heure bleue, nuit au clair de lune. La nuit, les
> **fenêtres s'allument** là où des kiwis dorment ou travaillent, et des **lanternes**
> bordent les chemins dès l'âge de Pierre. Les **cases récoltées ont l'air cultivées**
> (buttes et pousses de pulpe, touffes taillées et botte de fibre, pépins en sillons,
> ponton sur le jus) et l'on voit le gisement s'épuiser puis repousser ; l'herbe et les
> touffes ondulent au vent. Les **chemins** se raccordent et changent de matière avec les
> âges : planches, pavés irréguliers, pavés taillés bordés, route marquée.
>
> **Chantier 21** — sur téléphone, **une barre au pouce** remplace la colonne d'icônes :
> **Construire**, **Village**, l'**Œuf** au centre (son coût dessous), **Défense** (avec le
> compte à rebours de la vague) et **Menu**, un tiroir aux entrées **nommées** et rangées
> (Colonie, Carte, Social, Réglages). En paysage la barre passe sur le bord droit ; sur
> tablette tactile elle reste en bas. La file et les alertes se rangent au-dessus de la
> barre, l'objectif du tutoriel reste visible en une ligne (la récompense se récupère d'un
> appui), et les fiches gardent leur bouton principal en vue. Le tutoriel a été joué en
> entier au doigt sur trois tailles de téléphone.
>
> **Chantier 20** — plus besoin de **recharger la page** : un appui sur la carte relâché sur
> un panneau ne bloque plus les taps. La fiche d'un kiwi garde sa barre ◀ ▶ (avec le nom et
> la classe) **collée en haut** ; le Village se **trie par stat** (les meilleur·es d'abord) ;
> une **barre verte** suit la formation à l'École. La **file des chantiers** et l'**alerte de
> vague** se **replient** en pastille (choix gardé ; une vague à moins d'une heure redéplie
> l'alerte). Survoler un bâtiment montre **sa zone** ; pendant la pose, la **zone visée**
> ressort nettement des tuiles possibles. Sur téléphone, un lancer du doigt **glisse**
> vraiment (et la rotation à deux doigts aussi). Les **grillons** chantent plus rarement, plus
> bas, et se taisent à la mi-nuit.
>
> **Chantier 22** — de **meilleures premières impressions** : au chargement, un kiwi oiseau
> **court sur un kiwi** qui tourne (plus de texte « On épluche le kiwi »). L'intro **attend le
> joueur** : le kiwi dérive dans l'espace, vu de trois quarts, sa couture à peine marquée ; on
> le **touche** (ou on glisse le doigt dessus, ou le bouton « Trancher le kiwi ») et la lame
> suit exactement la couture. La découpe est **juteuse** : ralenti, chair humide avec ses
> pépins, filets de jus qui s'étirent entre les moitiés avant de casser, poils qui frémissent,
> puis la chair fond pour laisser voir les deux faces.
>
> **Chantier 17** — on **reconnaît chaque bâtiment** d'un coup d'œil : une couleur par
> famille (la production prend la couleur de sa ressource, l'entrepôt bois sombre et ardoise,
> le savoir pierre et bleu, la défense pierre grise et fer), une silhouette signature (grande
> bobine qui tourne sur l'atelier à fibre, presse en forme de kiwi à la pulperie, clocher bleu
> de l'école, entrepôt large et bas) et une **enseigne ronde** avec l'icône du bâtiment. La
> **planète alien** se voit dès le lancement, avec son ruban « Face alien — à coloniser »,
> et la **mer de nuages** ondule, roule et s'entrouvre sur des étoiles. `?sheet` montre tous
> les bâtiments côte à côte.
>
> **Chantier 15** — la colonie **s'organise toute seule** : chaque chantier part avec le kiwi
> le plus fort (emprunté à son poste, il y retourne ensuite), et le Nid permet jusqu'à **trois
> chantiers en même temps** ; choisir une recherche envoie les kiwis qui ont le plus d'**Esprit**
> à la Bibliothèque ; une **météorite** devient un **poste à part** (3 places pour les plus
> adroits, une **foreuse** à rechercher qui creuse plus vite à chaque âge) ; la poussière
> d'étoiles, les **réparations** et la **garnison** avant une attaque se font aussi seules. Un
> **panneau Automatisation** (écran du village) permet de passer chaque tâche en manuel.
>
> **Chantier 16** — on **voit ce qu'un bâtiment fait au terrain** : pendant la pose, le
> bâtiment **lévite, translucide**, au-dessus de la tuile visée (vert si on peut construire,
> rouge sinon, avec la raison). Autour de lui, les tuiles qu'il récoltera **pulsent en vert**
> et celles déjà prises par un autre bâtiment sont **grises**, avec le total du gisement
> (« 3 tuiles de chair : 1 800 pulpe en réserve »). Sur téléphone, on touche une tuile puis
> « Construire ici ». À la fin d'un chantier, une **onde** allume la zone du bâtiment, de
> proche en proche. Le calque **Logistique** (touche O) montre la zone de chaque producteur et
> les recouvrements. Chaque kiwi qui dépose sa récolte affiche **ce qu'il rapporte**
> (« +0,4 » et l'icône de la ressource), et plus un débit horaire.
> **Chantier 18** — l'équilibrage joue maintenant comme un·e joueur·euse attentif·ve : il
> trace des **chemins** quand ils se remboursent vite, pose des **camps** sur les météorites et
> les gisements lointains, envoie des **reconnaissances** et des **raids** sur la face jumelle.
> Les raids deviennent intéressants : une victoire **blesse** les kiwis touchés (6 h) au lieu
> de les tuer, et le **butin** est 8 fois plus gros, et plus encore aux âges suivants. Le
> rapport compare un·e joueur·euse attentif·ve et occasionnel·le (trois visites par jour) et
> chiffre l'apport de chaque mécanique ; les âges arrivent à l'heure (Pierre ≈ 1,5 jour, Fer
> ≈ 4 jours, Industrie ≈ 8 jours) dans tous les biomes.
>
> **Chantier 13** — des **comètes** passent tous les 3 à 5 jours : annoncées quelques heures
> avant, elles traversent le ciel (plus belles la nuit) et laissent de la **poussière
> d'étoiles** dorée sur 1 à 3 tuiles pendant un jour. On y envoie ses kiwis les plus adroits
> (bouton dans la fiche de la tuile) ; la poussière se garde à part (50 au plus). Elle paie des
> **bénédictions** (guérir tout de suite, redistribuer les stats, +1 pour toujours), l'**œuf
> étoilé** (1 chance sur 8 d'un kiwi **doré**), la branche de recherche **Étoiles** (nuits
> claires, vagues annoncées plus tôt, comètes plus fréquentes, météorites plus riches), le
> **carburant** du vaisseau (trajet plus court, moins de pannes), le monument du **Fer** et de
> l'**Industrie** et la transformation en **Kikiwiwi**.
>
> **Chantier 12** — on **voit la logistique** : chaque kiwi qui dépose sa récolte affiche
> « +N/h », marche plus vite sur les chemins et va au dépôt le plus proche à pied ; la fiche d'un
> producteur indique « 92 % · 4 pas jusqu'au dépôt (Nid) » ; tracer un chemin montre le gain
> (« Pulperie 78 % → 104 % ») ; poser un producteur colore les tuiles selon l'efficacité ; un
> **calque logistique** (touche O) l'affiche au-dessus de chaque producteur. Les **vagues ont
> une direction** : la muraille est découpée en un **front** face à la planète alien et deux
> **flancs**. Une tourelle défend le rempart **à sa portée** (3 à 5 tuiles), la garnison et les
> kiwis à la maison courent là où il manque de défense, et l'écran Défense détaille chaque
> secteur. Les **nuits durent 20 min** (15 en été), et l'interface montre ce que coûtent les
> kiwis sans lit.
>
> **Chantier 10** — le jeu est plus fluide : la barre du haut ne recalcule plus toute la
> production plusieurs fois par seconde (≈ 3 fois moins de travail pour l'interface, menus deux
> fois plus rapides à ouvrir), les grands écrans haute densité rendent moins de pixels, la 3D
> ralentit derrière les menus, et `?debug` affiche images/s et temps d'ouverture des menus. Sur
> téléphone, la caméra **glisse** après un geste, un **double tap** y vole et une **boussole**
> montre la planète alien (tap : retour au Nid). La planète alien reste du même côté du ciel,
> le flou de la qualité haute est plus léger, la planète est fermée (on voit la coupe du
> fruit, jamais l'intérieur) et l'intro montre un kiwi bien rond tranché net, avec du jus.
>
> **Chantier 11** — construire devient lisible : de **petites icônes** partout (bâtiments,
> effets, branches de recherche), un tableau **« niveau actuel → suivant »** en vert avant
> chaque amélioration, l'effet chiffré de chaque technologie, et un écran **Plans** (bouton
> livre) avec l'**arbre des bâtiments** : familles, niveaux, conditions, âges futurs en
> « ??? », et **Poser**, qui allume les tuiles valides. Chaque niveau ajoute un **élément de
> silhouette** visible de loin, et un **badge de niveau** (avec une flèche verte quand on peut
> améliorer) s'affiche au zoom moyen, ou partout avec la touche L.
>
> **Chantier 09** — on gère ses kiwis un par un : depuis la fiche d'un kiwi, « Affecter à… »
> liste chaque poste avec son rendement (le meilleur est mis en avant) et l'envoie en deux
> taps, en échangeant sa place si le poste est plein ; flèches et balayage pour passer d'un
> kiwi à l'autre. Un onglet **Postes** montre qui travaille où, ressource par ressource, et la
> barre du haut affiche le nombre de kiwis **sans poste**. Un **cadenas** garde un kiwi à son
> poste, un drapeau en fait un·e **bâtisseur·euse prioritaire**. Quand un stock est plein, ses
> récolteur·euses partent d'eux-mêmes vers un poste libre qui leur va bien, et reviennent
> quand il redescend sous 90 %.
>
> **Chantier 14** — on peut **emporter sa colonie solo en rejoignant** un univers avec un code
> (ou un lien d'invitation) : elle déménage sur un kiwi à elle, avec bâtiments, kiwis et ce
> qu'elle sait de sa jumelle, suit les saisons de l'univers et reçoit un **bouclier de 48 h**
> contre les prédateurs. La liste des membres montre la **puissance** de chaque colonie (âge,
> Nid, kiwis, défense), un badge « venue du solo » et le bouclier ; l'hôte peut fermer
> l'univers aux colonies importées.
>
> **Chantier 08 (2e moitié)** — des **obstacles** parsèment la carte : de vieilles souches
> qu'un·e bâtisseur·euse arrache pour un peu de fibre, des rochers trop lourds pour un kiwi, et
> les épaves luisantes que laissent les cratères de météorite. À l'âge du Fer, la recherche
> « contre nature » ouvre le **laboratoire contre nature** : un kiwi aguerri plonge dans une cuve
> de jus et en ressort **Kikiwiwi** — plus gros, veines vertes qui pulsent, yeux brillants,
> gouttes de jus à chaque pas lourd. L'infusion peut rater (le kiwi survit, blessé et affaibli).
> Un Kikiwiwi frappe furets et chauves-souris, prend la place de cinq kiwis dans le vaisseau (un
> seul par vaisseau, un par âge dès le Fer) et boit du jus : sans jus, il s'affaiblit. Il mène
> aussi des **travaux de titan** : fracasser rochers et épaves, creuser une source de jus,
> élever une terrasse contre les crues, aplanir un bosquet.
>
> **Chantier 08 (1re moitié)** — la civilisation traverse les **âges** : Éden, Pierre, Fer puis
> Industrie. Les kiwis à l'Esprit vif étudient à la **Bibliothèque** (on choisit qui y va) et
> accumulent des points de recherche ; l'**arbre des technologies** offre, à chaque âge, des
> bonus d'économie, de défense et d'exploration, plus la recherche de passage. Une fois le
> passage trouvé, on élève le **monument** (cercle de pierres, forge, tour d'horloge) : le nouvel
> âge ouvre un niveau de bâtiment de plus (jusqu'au niveau 6), un vaisseau plus solide (rondins,
> fer, réaction), des cadeaux du ciel plus riches… et des prédateurs plus forts. À l'âge
> industriel, les armes à feu permettent aux guerrier·ères de tirer sur les chauves-souris. Le
> village change d'allure : toits d'ardoise puis de tôle, lanternes, cheminées qui fument, chemins
> pavés ; la Bibliothèque devient laboratoire.
>
> **Chantier 07** — le vaisseau devient un **oiseau kiwi mécanique** qui bat des ailes : il
> respire sur son aire d'envol, prend son élan, décolle et file vers la face adverse (dézoomer
> pour le suivre), puis revient se poser. Son modèle change avec l'aire : oiseau de bois et de
> toile à pédales (fiable à 70 %), de rondins et de cordes (85 %), de fer riveté à vapeur (95 %,
> blindé). Un vaisseau qui casse fait demi-tour à mi-chemin et l'aire est à réparer. Nouvelle
> mission de **reconnaissance** : 1 ou 2 éclaireurs discrets (l'Agilité et l'Esprit comptent)
> cartographient une partie de la face adverse et estiment sa garnison en fourchette (furets,
> chauves-souris, défense) ; s'ils sont repérés, escarmouche et rapport bâclé. Les rapports
> vieillissent (la garnison grossit un peu chaque jour) et les nuages de la face jumelle
> s'ouvrent sur les secteurs vus. **Anti-triche** : en ligne, le serveur ne renvoie jamais la
> garnison réelle, seulement ce que les missions rapportent.
>
> **Chantier 06** — les **prédateurs** des kiwis attaquent : des meutes de **furets** au sol et
> des nuées de **chauves-souris** dans les airs (surtout la nuit), en grosses vagues annoncées 8 à
> 12 h à l'avance (environ une par jour, jamais avant le Nid 2 et 24 h de jeu), plus quelques
> petits incidents sans préavis. On se défend avec des **tourelles à pépins** posées sur le
> rempart de peau (arbalète contre les furets, fronde céleste contre les chauves-souris, qui
> consomment des pépins) et une **garnison** de kiwis postés (les épées ne touchent pas les
> chauves-souris : il faut des mages ou des éclaireurs). On peut aussi mettre tout le monde à
> l'abri au Nid. Une défaite abîme des bâtiments (à réparer), pille une partie du stock non
> protégé, blesse des kiwis et peut en tuer un, mais ne rase jamais la colonie. Le ciel apporte
> aussi du bon : des **météorites** de pépins, de jus ou de fibre, à récolter avant qu'elles
> s'éteignent.
>
> **Chantier 05** — chaque nouveau monde commence par un kiwi entier qui tourne dans l'espace et
> se fait **trancher en deux** : on choisit sa face (Kiwisu ou Kiwino), chacune avec son
> **biome** tiré au hasard (Verger luxuriant, Hauts plateaux duveteux, Delta sucré, Couronne de
> pépins, Lagunes de jus et leurs crues de printemps, Toundra veloutée), tous équilibrés à
> ±10 %. L'autre moitié flotte au-dessus de la colonie (dézoomer pour la voir), sous un
> **brouillard de guerre**, sauf si un·e ami·e y vit : on voit alors sa colonie et son nom.
>
> **Chantier 04** — le monde vit au rythme des jours (2 h, dont une courte nuit où les kiwis
> dorment) et des saisons (24 h chacune) : soleil qui tourne, nuits bleutées, maisons éclairées,
> averses de printemps, feuilles d'automne, neige et bassins gelés en hiver. Chaque cycle compte :
> repousse, récolte, marche dans la neige. Les kiwis **mangent** de la pulpe et boivent du jus :
> stocks qui baissent, alertes, faim qui ralentit le travail, et des morts possibles en cas de
> famine (jamais avant le Nid 2, jamais les 2 derniers kiwis). Ils se **reposent** dans le lit le
> plus proche de leur travail (des huttes bien placées font gagner du temps) et le **moral** de la
> colonie varie de ±10 %.
>
> **Chantier 03** — chaque kiwi est unique : statistiques tirées à l'éclosion, trait, rarissime
> **shiny** (1/512 : rouge, jaune, vert ou bleu), niveaux (jusqu'à 30) et maîtrises de métier qui
> augmentent sa production. Écran **Village** : fiches avec portrait, radar de stats, points à
> placer, renommer, suivre un kiwi avec la caméra, mémorial des disparus. En expédition, on
> choisit l'équipage : un kiwi investi frappe plus fort et tombe moins souvent. L'**École**
> forme des bâtisseur·euses, guerrier·ères, mages, éclaireur·euses et un·e maire, avec leurs
> compétences (Pluie, Discours…) et leurs tenues.
>
> **Chantier 02** — le jeu a du son : clics, chantiers, éclosions, expéditions, kiwis qui
> parlent (chacun sa voix) quand on les touche, ambiance nature/vent qui suit le zoom et musique
> acoustique douce ; volumes par canal et bouton muet. Un **espace admin** (`/admin`) permet
> d'envoyer ses propres sons et de régler chaque événement sonore sans toucher au code (sons
> partagés via Supabase, ou bac à sable local). Crédits : [`docs/AUDIO_CREDITS.md`](docs/AUDIO_CREDITS.md).
>
> **Chantier 01** — on peut démolir tout bâtiment sauf le Nid (25 % remboursés, confirmation),
> et le village vit : pressoir, rouet, marteau-pilon, moulin du puits, grue, drapeaux, fumées,
> particules ; l'animation s'arrête quand un bâtiment ne produit pas (badge pause ou épuisé).
>
> **Jalon 4** — le territoire compte : gisements qui s'épuisent et repoussent, zones de
> récolte, camps de cueillette sans bâtiment, logistique (distance au dépôt) et chemins à tracer.
> Vision long terme : [`docs/VISION.md`](docs/VISION.md).
>
> **Jalon 3** — expéditions (vaisseau, provisions, combat contre les extraterrestres),
> univers partagés sur invitation et chat d'équipe.
>
> **Jalon 2** — en ligne avec Supabase (invité immédiat, comptes Google / lien magique,
> serveur qui fait autorité), voir [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md). Sans
> configuration, le jeu reste jouable en mode local.
>
> **Jalon 1** (solo, local, sans serveur). Une face procédurale en 3D, une caméra
> desktop/tactile, 7 bâtiments sur 3 niveaux, villageois autonomes, éclosion, objectifs guidés,
> progression hors ligne, FR/EN et PWA.

## Installation

Prérequis : Node ≥ 20 et pnpm (`corepack enable` suffit pour activer pnpm).

```bash
pnpm install
pnpm dev
```

Ouvrez ensuite http://localhost:5173. Le serveur de dev écoute aussi sur le réseau local
(`--host`) : depuis un téléphone sur le même Wi-Fi, ouvrez l'URL « Network » affichée par Vite.

### Paramètres d'URL

| Paramètre                          | Effet                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `?seed=banane`                     | Génère la face à partir de cette graine (demande confirmation si une colonie existe) |
| `?face=kiwino`                     | Choisit la face (`kiwisu` par défaut)                                                |
| `?quality=low\|medium\|high\|auto` | Force un preset graphique                                                            |

## Déploiement (Vercel)

Le fichier `vercel.json` configure tout : importez le dépôt dans Vercel **sans changer le Root
Directory** (racine du dépôt), Vercel lit `vercel.json` (install pnpm, `pnpm build`, sortie
`apps/client/dist`, cache long sur les assets, pas de cache sur le service worker).
Sans variable d'environnement, le jeu tourne en mode local (sauvegarde dans le navigateur).
Pour le mode en ligne, ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` : voir
[`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md).

## Scripts

| Script                     | Rôle                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                 | Serveur de développement Vite (client)                                                                        |
| `pnpm build`               | Build de production + service worker PWA (`apps/client/dist`)                                                 |
| `pnpm preview`             | Sert le build de production                                                                                   |
| `pnpm test`                | Vitest sur tous les workspaces                                                                                |
| `pnpm typecheck`           | `tsc --noEmit` sur chaque workspace                                                                           |
| `pnpm lint`                | ESLint (zéro warning toléré)                                                                                  |
| `pnpm format`              | Prettier                                                                                                      |
| `pnpm balance`             | Rapport d'équilibrage Kiwisu vs Kiwino (`--seeds 200 --threshold 10 --hours 72 --out fichier.md`)             |
| `pnpm balance:expeditions` | Sonde des expéditions : pannes, éclaireurs repérés, secteurs, raids à l'aveugle ou renseignés (`--seeds 300`) |

## Commandes de jeu

|                                       | Desktop                                                         | Mobile                                 |
| ------------------------------------- | --------------------------------------------------------------- | -------------------------------------- |
| Sélectionner une tuile ou un bâtiment | Clic gauche                                                     | Toucher                                |
| Déplacer la carte                     | Clic gauche glissé (aussi clic milieu, WASD / flèches)          | Glisser à un doigt                     |
| Tourner autour                        | Clic droit glissé, ou Alt/Option (ou Ctrl) + clic gauche glissé | Glisser à deux doigts (ou les tourner) |
| Zoom                                  | Molette ou pincement du trackpad                                | Pincer                                 |
| Rotation par paliers de 45°           | Q / E                                                           | —                                      |
| Infos d'une ressource                 | Survol de la ressource                                          | Toucher la ressource                   |
| Fermer la sélection                   | Échap                                                           | ✕                                      |
| Fiche d'un kiwi                       | Clic sur le kiwi (ou bouton Village en haut)                    | Toucher le kiwi                        |
| Panneau debug                         | `` ` `` (ou `²` en AZERTY)                                      | Réglages → Panneau debug               |

Le panneau debug propose le multiplicateur de temps (×1, ×10, ×100), +500 de chaque ressource,
la régénération avec une nouvelle graine, la bascule Kiwisu/Kiwino et un compteur de fps.

## Architecture

```
packages/shared   Règles, données, simulation, génération procédurale — TypeScript pur
                  (aucune dépendance DOM ou Three.js, déterministe)
apps/client       Rendu Three.js + HUD Preact ; lit l'état et envoie des commandes
tools/balance     Simulations headless d'équilibrage (CLI)
supabase/         Migrations SQL (RLS) et fonction serveur `game` (Deno)
docs/             Brief, décisions, rapport d'équilibrage
```

### `packages/shared`

- `data/` : ressources, tuiles, profils de face, bâtiments (coûts, durées, production par niveau),
  éclosion, objectifs. **Changer l'équilibrage revient à changer une donnée.**
- `worldgen/generateFace(seed, face, params)` : disque hexagonal selon l'anatomie d'une tranche
  de kiwi (cœur, rayons, anneau de graines, chair, bosquets de duvet, poches de jus, peau).
- `sim/` : `GameState` (avec `playerId`, `universeId`, `kiwiId`, `face`, `seasonId` prévus pour
  le multijoueur), `advance(state, now)` (pur, piloté par les événements, exact même après des
  jours d'absence) et `applyCommand(state, command, { now, map })` avec validation.
- `save/` : sauvegarde versionnée, validée par zod, avec migrations.
- Déterminisme garanti par l'outillage : ESLint interdit `Math.random`, `Date.now`, le DOM et
  les imports Three/Preact dans `shared`. Le hasard passe par un RNG à graine (sfc32), le temps
  par un paramètre `now`.

### `apps/client`

- `game/GameController` : horloge injectée (multiplicateur debug), boucle `advance`, commandes,
  sauvegarde automatique dans `localStorage`, résumé « Pendant votre absence… ».
- `render/` : terrain instancié (1 draw call), shader de jus, props instanciés, bâtiments
  procéduraux, kiwis instanciés (4 draw calls quel que soit leur nombre), post-processing
  (N8AO, bloom, tilt-shift, tone mapping neutre, vignette), presets Bas / Moyen / Haut avec
  détection automatique et baisse adaptative si le fps chute.
- `camera/CameraRig` : `camera-controls` configuré pour la souris, le clavier et le tactile.
- `ui/` : HUD Preact « parchemin » (barre de ressources, panneau de tuile ou bottom sheet sur
  mobile, file de construction, œuf, objectifs, réglages, debug). Store `zustand` (vanilla)
  partagé avec le renderer.
- `i18n/` : dictionnaires FR/EN typés ; une clé manquante est une erreur de compilation.
- `audio/` : moteur Web Audio (canaux musique / ambiance / effets / interface), catalogue
  d'événements sonores, liaisons réglables, synthé de secours, manifeste lu depuis Supabase.
- `admin/` : espace admin des sons (`/admin`, chunk séparé, sans la 3D).

Le client ne modifie jamais l'état : il émet des commandes (`build`, `upgrade`, `cancel`,
`assignWorkers`, `hatchEgg`, `claimObjective`…) validées par `shared`.

### Mode en ligne (Jalon 2)

- `shared/server/gameService` : service de jeu qui fait autorité (horloge et hasard côté serveur,
  validation des commandes avec les mêmes règles, limitation de débit, commandes debug réservées
  aux admins, contrôle de cohérence à l'import d'une sauvegarde locale).
- `supabase/functions/game` : fonction Deno qui authentifie le joueur et appelle ce service ;
  `supabase/migrations` : tables `games`, `command_log`, `admins` avec RLS (lecture seule pour
  le joueur).
- Côté client, les commandes sont appliquées immédiatement (optimiste), envoyées dans l'ordre,
  puis l'état local est recalé sur la réponse du serveur. Hors connexion, elles attendent et
  repartent automatiquement.

## Tests

`pnpm test` couvre notamment :

- la grille hexagonale et le RNG ;
- le déterminisme de `generateFace` (même graine = même face) et les quantités minimales de
  chaque ressource sur 60 graines × 2 faces ;
- `advance()` : production, plafonds de stockage, constructions en chaîne hors ligne, éclosion,
  et équivalence entre un grand pas et de nombreux petits pas ;
- la validation de chaque commande et le déterminisme d'un journal de commandes ;
- la sauvegarde (aller-retour, fichiers corrompus, versions futures) ;
- le pathfinding des kiwis, la cohérence FR/EN des traductions et le bot d'équilibrage ;
- l'audio : résolution des liaisons (anti-spam, probabilité, conditions), rendu du synthé,
  manifeste, présence des fichiers intégrés.

## Performances

- Bas : environ 36 draw calls et 75 k triangles pour une face complète.
- Ombres statiques (recalculées seulement quand un bâtiment change) ; ombres-pastilles sous les kiwis.
- Le build de production pèse environ 290 ko de JS gzippé, en trois chunks (jeu, three, post-processing).

## Crédits

- Police : [Alegreya](https://fonts.google.com/specimen/Alegreya) de Juan Pablo del Peral,
  SIL Open Font License 1.1 (via [Fontsource](https://fontsource.org)).
- Bibliothèques : three.js (MIT), postprocessing (Zlib), n8ao (ISC), camera-controls (MIT),
  Preact (MIT), zustand (MIT), zod (MIT), simplex-noise (MIT), Vite / Vitest (MIT).
- Modèles 3D, textures, icônes et effets visuels sont générés par le code.
- Sons : fichiers CC0 de Kenney, Thimras et Trex0n, détaillés dans
  [`docs/AUDIO_CREDITS.md`](docs/AUDIO_CREDITS.md) ; sons de secours synthétisés par le code.
