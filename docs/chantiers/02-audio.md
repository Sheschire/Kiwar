# Chantier 02 — Audio : socle, sons de base, espace admin

## Intention du porteur

« Prépare le socle pour que je puisse uploader des sons et des effets audio, et propose des sons
de base si tu peux en récupérer. Dans l'idéal, un espace admin pour gérer les sons selon tous les
paramètres qui en auraient besoin, pour que je puisse expérimenter sans te demander. »

## Proposition

### 1. Moteur audio (client)

- `apps/client/src/audio/` : un `AudioEngine` sur Web Audio API, lancé au premier geste du
  joueur (contrainte des navigateurs mobiles). Bus séparés : **musique**, **ambiance**,
  **effets**, **interface**, chacun avec son volume, plus un volume général et un bouton muet.
  Réglages dans la modale Paramètres, mémorisés en local.
- **Catalogue d'événements sonores** typé (`SoundEventId`) : le code du jeu ne joue jamais un
  fichier, il émet un événement (`ui.click`, `build.complete`, `egg.hatch`, `kiwi.chirp`,
  `harvest.pulp`, `storage.full`, `ship.launch`, `ship.return`, `threat.warning`,
  `ambience.day`, `ambience.night`, `ambience.<saison>`, `music.main`…). Une **liaison**
  associe un événement à un ou plusieurs sons avec ses paramètres.
- Paramètres d'une liaison : sons (tirage aléatoire parmi plusieurs variantes), volume,
  variation de hauteur (pitch ±), probabilité, délai minimal entre deux lectures (anti-spam),
  boucle (ambiances, musique), fondu, **spatialisation** (son 3D positionné sur la tuile, atténué
  par la distance caméra), conditions (jour/nuit, saison, niveau de zoom).
- Les sons d'ambiance suivent la caméra (plus de nature quand on zoome, plus de vent de loin).
- Chargement paresseux et mise en cache (service worker PWA) ; aucun son ne bloque le
  démarrage du jeu.

### 2. Sons de base

- Par défaut, des **sons synthétisés en code** (petit synthé type zzfx, sans fichier ni licence)
  pour chaque événement : clic, pop de construction, éclosion, pépiement, etc. Le jeu a donc du
  son même sans rien uploader.
- Proposer au porteur des packs **CC0** (domaine public) à uploader : Kenney.nl (Interface
  Sounds, Impact Sounds, RPG Audio), sons de nature CC0 de Freesound. Si le réseau le permet,
  les télécharger et les intégrer ; noter la source et la licence de chaque son dans
  `docs/AUDIO_CREDITS.md`.

### 3. Espace admin

- Route `/admin` (chunk chargé à la demande), accessible aux comptes présents dans la table
  `admins` (existe déjà). Hors ligne / sans Supabase : un mode « bac à sable local » qui garde
  les réglages dans le navigateur, pour tester sans serveur.
- Fonctions : **uploader** des fichiers (mp3/ogg/wav, taille limitée), écouter, renommer,
  supprimer ; **lier** des sons aux événements et régler tous les paramètres ci-dessus avec
  aperçu immédiat ; **déclencher** n'importe quel événement pour l'écouter en contexte ;
  exporter / importer la configuration (JSON).
- Le jeu lit un **manifeste** (liaisons + URLs) au démarrage, mis en cache ; les changements de
  l'admin sont visibles au rechargement (ou en direct via Realtime, optionnel).
- Prévoir que cet espace admin accueillera plus tard d'autres réglages (équilibrage en direct,
  événements du ciel…) : structure de page à onglets.

### Base de données (SQL à fournir au porteur, prêt à copier-coller)

- Bucket Supabase Storage `audio` (lecture publique, écriture admins), créé par SQL
  (`storage.buckets`) avec ses policies.
- Tables `audio_assets` (id, nom, chemin, durée, taille, auteur, date) et `audio_bindings`
  (event_id, liste d'assets, paramètres en colonnes ou JSON validé, activé, date de mise à
  jour). RLS : lecture pour tous (même anonymes), écriture pour `admins` seulement.
- Ajouter le test RLS correspondant dans `supabase/tests/rls_test.sql`.

## Découpage proposé

1. Moteur audio + catalogue d'événements + sons synthétisés + réglages de volume, branchés sur
   les événements existants. Commit jouable.
2. Tables, bucket, RLS, manifeste lu par le client (SQL donné au porteur). Commit.
3. Page admin (upload, liaisons, paramètres, test en direct, export/import). Commit.
4. Ambiances spatialisées et musique, sons CC0 si disponibles, crédits. Commit.

## Critères d'acceptation

- Le jeu a du son dès le premier clic, sans aucun fichier uploadé, et respecte le bouton muet.
- Le porteur peut, seul, uploader un son, l'attacher à un événement, régler volume et hauteur,
  l'écouter dans le jeu, sans toucher au code.
- Aucun son ne joue en double de façon agaçante (anti-spam), rien ne coupe sur iOS/Android.

## Questions ouvertes

1. Ambiance musicale souhaitée (douce et acoustique, chiptune, orchestrale légère) ?
2. Les kiwis doivent-ils « parler » (petits gazouillis avec variations selon le kiwi, à la
   Animal Crossing) ? Cela se marierait bien avec le chantier 03 (kiwis individuels).
3. L'espace admin doit-il aussi permettre d'inviter d'autres admins ?

## Réalisé (octobre 2026)

Réponses du porteur : musique **douce et acoustique** ; les kiwis **parlent** dès maintenant
(voix propre à chaque kiwi) ; **pas** de gestion des admins dans l'interface (SQL) ; sons CC0
**dans le dépôt, utilisés par défaut**.

1. **Moteur** (`apps/client/src/audio/`) : Web Audio lancé au premier geste, suspendu quand la
   page est cachée ou muette ; canaux musique / ambiance / effets / interface + général ; réglages
   dans Paramètres et bouton muet dans la barre du haut. Catalogue typé de 26 événements
   (`catalog.ts`), liaisons validées par zod (`binding.ts`), synthé en code (`synth.ts`) qui sert
   de secours à chaque événement.
2. **Base** : migration `20261022000000_audio.sql` (`is_admin()`, `audio_assets`,
   `audio_bindings`, bucket `audio` public 2 Mo, policies admin) + tests RLS. Le client lit le
   manifeste par PostgREST (sans supabase-js), le met en cache, retombe sur les défauts.
3. **Espace admin** `/admin` : connexion Google / lien magique, mode partagé (admins) ou bac à
   sable local (localStorage + IndexedDB, utilisé par le jeu du même navigateur) ; onglets Sons
   (envoi, écoute, renommage, suppression) et Événements (tous les paramètres, enregistrement
   automatique, test) ; export / import JSON ; onglets Équilibrage et Ciel réservés.
4. **Sons** : 22 fichiers CC0 (Kenney, Thimras, Trex0n) en ogg + mp3, ambiance oiseaux / vent
   qui suit le zoom, musique en boucle, sons spatialisés, kiwi qui parle quand on le touche,
   pépiements près de la caméra, cache du service worker.

Reste à faire / idées :

- Changements de l'admin en direct (Realtime) : aujourd'hui au rechargement.
- Ambiances jour / nuit / saisons (`ambience.day`, `ambience.night`, conditions) : avec le
  chantier 04 ; `threat.warning` : avec le chantier 06.
- Voix des kiwis tirée de leurs traits (chantier 03) au lieu d'un hachage de l'identifiant.
- Sons choisis sans écoute : au porteur de valider à l'oreille et de remplacer via `/admin`.
- Gestion des admins depuis l'interface (écartée pour l'instant).
