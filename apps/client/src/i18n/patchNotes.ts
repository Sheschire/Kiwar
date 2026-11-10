import type { Lang } from './i18n';

/**
 * The patch notes shown to players ("What's new"), newest first.
 *
 * EVERY update that changes what a player sees or plays adds an entry at the TOP of this list
 * (any agent, any chantier, any hotfix): a new unique `id` (`YYYY-MM-DD-slug`), the date, a
 * short title and 2–6 player-facing lines, in French AND English (same number of lines,
 * gender-neutral French). Write for players, not developers: no file names, no jargon.
 * Pure refactors, docs and balance-bot changes do not need an entry. A player who has not seen
 * the newest `id` gets the window once at their next start (`ui/patchNotes.ts`).
 */
export interface PatchNote {
  id: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  title: Record<Lang, string>;
  items: Record<Lang, readonly string[]>;
}

export const PATCH_NOTES: readonly PatchNote[] = [
  {
    id: '2026-11-10-patch-notes',
    date: '2026-11-10',
    title: { fr: 'Le journal des nouveautés', en: 'The “What’s new” log' },
    items: {
      fr: [
        'Cette fenêtre s’ouvre une fois après chaque mise à jour pour résumer ce qui a changé.',
        'Elle reste disponible à tout moment : menu « ⋯ » sur ordinateur, menu du bas sur téléphone, entrée « Nouveautés ».',
      ],
      en: [
        'This window opens once after every update to sum up what changed.',
        'It stays available at any time: the “⋯” menu on desktop, the bottom menu on phones, “What’s new”.',
      ],
    },
  },
  {
    id: '2026-11-09-orchard-apple-pineapple',
    date: '2026-11-09',
    title: {
      fr: 'Le Verger II : la pomme et l’ananas',
      en: 'The Orchard II: the apple and the pineapple',
    },
    items: {
      fr: [
        'La pomme et l’ananas pendent à côté de la framboise, au bout du même trou de ver.',
        'La pomme mûrit sur un calendrier public : mûre, elle paie bien et ses vers sont calmes ; blette, elle paie peu, ses vers sont agressifs… mais c’est le seul moment du cidre.',
        'L’ananas et ses fourmis tisserandes donnent la fibre d’or ; sa bromélaïne use les kiwis heure après heure (l’Endurance et les armures de fibre d’or protègent).',
        'Un comptoir par fruit, et des routes entre comptoirs : +25 % et trajets plus courts, contre un entretien quotidien.',
        'Nouveaux usages : armes de nectar, armures de fibre d’or, soirées de cidre, cidre en carburant et décors dorés.',
      ],
      en: [
        'The apple and the pineapple hang next to the raspberry, at the end of the same wormhole.',
        'The apple ripens on a public calendar: ripe, it pays well and its worms are calm; overripe, it pays little and its worms are aggressive… but that is the only time for cider.',
        'The pineapple and its weaver ants give golden fibre; its bromelain wears kiwis down hour after hour (Endurance and golden-fibre armour protect them).',
        'One trading post per fruit, and routes between posts: +25% and shorter trips, for a daily upkeep.',
        'New uses: nectar weapons, golden-fibre armour, cider evenings, cider as fuel and gilded decorations.',
      ],
    },
  },
  {
    id: '2026-11-06-orchard-raspberry',
    date: '2026-11-06',
    title: {
      fr: 'Trous de ver et le Verger I : la framboise',
      en: 'Wormholes and the Orchard I: the raspberry',
    },
    items: {
      fr: [
        'La technologie Trous de ver et une aire d’envol niveau 9 ouvrent le Verger cosmique, le même pour tout un univers.',
        'La framboise abrite des clans de coléoptères : commercez, offrez ou pillez, et surveillez votre réputation.',
        'Fondez un comptoir sur une drupéole (huttes, étals, palissades) et défendez-le contre les attaques annoncées.',
        'Le nectar rouge, une nouvelle ressource, et un écran Verger ; la framboise apparaît dans le ciel.',
        'Les batailles sur la framboise se jouent en 3D sur leur drupéole.',
      ],
      en: [
        'The Wormholes technology and a level-9 launchpad open the cosmic Orchard, the same for a whole universe.',
        'The raspberry is home to beetle clans: trade, give gifts or plunder, and watch your standing.',
        'Found a trading post on a drupelet (huts, stalls, palisades) and defend it against announced attacks.',
        'Red nectar, a new resource, and an Orchard screen; the raspberry shows up in the sky.',
        'Battles on the raspberry are played in 3D on their drupelet.',
      ],
    },
  },
  {
    id: '2026-11-06-kiwais',
    date: '2026-11-06',
    title: { fr: 'Les kiwaïs en orbite', en: 'The kiwais in orbit' },
    items: {
      fr: [
        'À l’Âge des étoiles, le chantier orbital lance jusqu’à 3 kiwaïs, de petites planètes en orbite avec leur propre carte.',
        'Quatre types : moisson d’étoiles, serre, observatoire et quai, à équiper de modules.',
        'Une navette monte et redescend les kiwis.',
        'Gare aux pannes annoncées et aux essaims des comètes : bouclier ou évacuation.',
        'Nouvel écran Orbite, et les kiwaïs tournent dans le ciel.',
      ],
      en: [
        'In the Age of the stars, the orbital yard launches up to 3 kiwais, small planets in orbit with their own map.',
        'Four kinds: star harvest, greenhouse, observatory and dock, fitted with modules.',
        'A shuttle carries kiwis up and back down.',
        'Watch out for announced breakdowns and comet swarms: shield or evacuation.',
        'A new Orbit screen, and the kiwais circle in the sky.',
      ],
    },
  },
  {
    id: '2026-11-04-top-bar-fixes',
    date: '2026-11-04',
    title: {
      fr: 'Une barre du haut plus légère, et des correctifs',
      en: 'A lighter top bar, and fixes',
    },
    items: {
      fr: [
        'Sur ordinateur, un menu « ⋯ » regroupe Ligue, Univers, Objectifs, Son et Réglages ; les ressources restent bien centrées.',
        'La fiche de la Forge ne plante plus.',
        'Relever une garde dit maintenant quand le vaisseau revient.',
        'Les bosquets en contrebas peuvent être creusés en canal ou dégagés en chair (technologie Canaux).',
      ],
      en: [
        'On desktop, a “⋯” menu holds League, Universes, Objectives, Sound and Settings; resources stay nicely centred.',
        'The Forge sheet no longer crashes.',
        'Relieving a guard now tells when the ship is back.',
        'Down groves can be dug into a canal or cleared into flesh (Canals technology).',
      ],
    },
  },
  {
    id: '2026-11-04-leagues',
    date: '2026-11-04',
    title: { fr: 'Les ligues', en: 'The leagues' },
    items: {
      fr: [
        'Dans un univers partagé, un classement par saisons de 28 jours sur des hauts faits publics et datés.',
        'Âges, balises, conquête, Tréfonds, forge, vagues tenues, population… chaque haut fait rapporte des points.',
        'Le podium garde un titre et choisit un cosmétique : bannière du Nid, capes, fanions ou couronne du monument.',
        'Nouvel écran Ligue, et les hauts faits s’affichent dans le chat.',
      ],
      en: [
        'In a shared universe, a ranking by 28-day seasons on public, dated feats.',
        'Ages, beacons, conquest, the depths, the forge, waves held, population… every feat scores points.',
        'The podium keeps a title and picks a cosmetic: Nest banner, capes, pennants or monument crown.',
        'A new League screen, and feats show up in the chat.',
      ],
    },
  },
  {
    id: '2026-11-04-depths-core',
    date: '2026-11-04',
    title: {
      fr: 'Tréfonds III : le cœur et la Liane-Mère',
      en: 'The depths III: the core and the Mother Vine',
    },
    items: {
      fr: [
        'Sous les loges, à l’Âge des étoiles : les cavernes blanches et leur sève, à ne pas trop charger sous peine d’éboulement.',
        'Au pédoncule attend le Grand Charançon : carapace, envol par à-coups et nuée de larves.',
        'Sa chute révèle la Liane-Mère : trésor, souvenir et pèlerinage.',
      ],
      en: [
        'Under the locules, in the Age of the stars: the white caverns and their sap — do not overload them or they cave in.',
        'The Great Weevil waits at the stem: a shell, bursts of flight and a swarm of larvae.',
        'Its fall reveals the Mother Vine: treasure, keepsake and pilgrimage.',
      ],
    },
  },
  {
    id: '2026-11-03-stardust-universes',
    date: '2026-11-03',
    title: { fr: 'Poussière d’étoiles et univers à 16', en: 'Stardust and universes of 16' },
    items: {
      fr: [
        'Les comètes laissent plus de poussière d’étoiles (+25 %), et chaque colonie a reçu 20 poussières en cadeau.',
        'Les météorites tombent un peu plus souvent (jusqu’à 6 cratères à la fois).',
        'L’hôte d’un univers peut retirer un·e joueur·se ; un univers accueille maintenant 16 joueur·ses.',
      ],
      en: [
        'Comets leave more stardust (+25%), and every colony received 20 stardust as a gift.',
        'Meteorites fall a little more often (up to 6 craters at once).',
        'A universe’s host can remove a player; a universe now welcomes 16 players.',
      ],
    },
  },
  {
    id: '2026-10-31-age-of-stars',
    date: '2026-10-31',
    title: { fr: 'L’Âge des étoiles', en: 'The Age of the stars' },
    items: {
      fr: [
        'Un cinquième âge, ouvert par les Cartes du ciel profond et le monument des étoiles.',
        'Les bâtiments montent jusqu’au niveau 15, payés en cristal et en graines géantes.',
        'Trois nouvelles technologies, de nouveaux objectifs et le voilier stellaire.',
        'Le village prend le look des étoiles.',
      ],
      en: [
        'A fifth age, opened by the Star charts of the deep sky and the star monument.',
        'Buildings go up to level 15, paid in crystal and giant seeds.',
        'Three new technologies, new objectives and the star sailboat.',
        'The village takes on the look of the stars.',
      ],
    },
  },
  {
    id: '2026-10-30-depths',
    date: '2026-10-30',
    title: {
      fr: 'Les Tréfonds, la tranche et les loges',
      en: 'The depths, the cut and the locules',
    },
    items: {
      fr: [
        'À l’Âge du fer, la Spéléologie ouvre une entrée de tunnel vers les Tréfonds : un réseau de salles sous le brouillard.',
        'Descentes avec dangers et prévision honnête, galeries et mineur·euses, et une nouvelle classe : le ou la Spéléologue.',
        'Attention aux remontées par le tunnel : fermez, fortifiez ou gardez la porte.',
        '« Voir en coupe » ouvre le fruit comme une part pour regarder la vie souterraine et les descentes en direct.',
        'À l’Industrie, les loges donnent le cristal et les graines géantes.',
      ],
      en: [
        'In the Iron age, Spelunking opens a tunnel entrance to the depths: a network of rooms under the fog.',
        'Delves with hazards and an honest forecast, galleries and miners, and a new class: the spelunker.',
        'Beware of upwellings through the tunnel: close, fortify or guard the door.',
        '“See in a cut” opens the fruit like a slice to watch life underground and delves live.',
        'In the Industry age, the locules give crystal and giant seeds.',
      ],
    },
  },
];
