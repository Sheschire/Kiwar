# Chantier 14 — Emporter sa colonie solo dans un univers existant

## Intention du porteur

« Pouvoir importer la partie solo d'un·e autre joueur·euse dans un monde existant, pour éviter
qu'il ou elle recommence de zéro quand sa partie solo est déjà avancée. »

## État actuel (code)

- **Sauvegarde locale → solo en ligne** : `importLocalSaveOnce` (`client/game/GameController.ts`)
  fait cet import une fois, après la connexion, si la partie en ligne est neuve. Le serveur
  vérifie la vraisemblance (`isPlausible`, `shared/server/gameService.ts`), remet à zéro les amis
  et les livraisons, et retire les garnisons aliens.
- **Solo → univers** : `moveSoloInto` existe, mais **seulement à la création** d'un univers (case
  « Emporter ma colonie solo » dans `UniverseModal.tsx`). Rejoindre avec un code démarre toujours
  une nouvelle colonie.
- Pas d'export ni d'import par fichier.

## Réponses du porteur (octobre 2026)

« Emporter ma colonie solo » doit aussi être possible **en rejoignant** un univers avec un code,
avec un **bouclier** de protection à l'arrivée et la **puissance de la colonie affichée** aux
autres.

## Proposition

- Dans l'écran « Rejoindre », la même case « Emporter ma colonie solo » (cochée par défaut si la
  partie solo est avancée), avec un aperçu (âge, kiwis, niveau du Nid).
- Le serveur reprend `moveSoloInto` : il garde le calendrier de la colonie, choisit une face
  libre de l'univers (`pickFace`), remet à zéro les liens propres au solo (amis, livraisons,
  intel, cibles), retire les garnisons aliens, et remet l'emplacement solo à un monde neuf.
- **Bouclier d'arrivée** : pas de raid entrant pendant 48 h (à confirmer), affiché sur la face.
- **Puissance visible** : âge et puissance de défense résumée dans la liste des membres, pour que
  le groupe sache qui arrive.
- Garde-fous : `isPlausible` obligatoire, une seule importation par compte et par univers, et
  l'univers peut refuser les colonies importées (réglage de l'hôte).

## Impact technique

- Action serveur `joinUniverse { code, fromSolo }`, avec le mock et la fonction `game` (rebuild
  du bundle).
- Probablement une **migration SQL** : colonne de bouclier ou drapeau « importée », réglage
  `allowImports` de l'univers. Nouvelle migration, `pnpm build:sql`, SQL complet donné au
  porteur.
- Client : `UniverseModal` (rejoindre), liste des membres.
- Tests : RLS et service (on ne rejoint pas deux fois, la vraisemblance est vérifiée).

## Découpage proposé

1. Serveur : `joinUniverse` avec `fromSolo`, bouclier, tests et migration.
2. Client : case, aperçu, puissance dans la liste des membres.
3. Docs (`SUPABASE_SETUP.md`), skill `kiwar-online`, SQL pour le porteur.

## Questions ouvertes

1. Durée du bouclier d'arrivée (48 h ?).
2. L'hôte de l'univers peut-il refuser les colonies importées, ou est-ce toujours permis ?
3. Faut-il aussi un export/import par fichier (changer d'appareil sans compte) ? Écarté pour
   l'instant (risque de triche).
