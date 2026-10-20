# Mise en ligne avec Supabase (Jalon 2)

Sans configuration, Kiwar fonctionne en **mode local** : la partie est sauvegardée dans le navigateur.
Ce guide active le **mode en ligne** : jeu immédiat en invité, comptes Google ou lien magique,
état stocké et validé par le serveur. Compter environ 20 minutes.

## 1. Créer le projet Supabase

1. Sur https://supabase.com/dashboard, cliquez sur **New project** et choisissez une région proche de vos
   joueurs (par exemple _West EU_).
2. Notez deux valeurs dans **Project Settings → API** (ou **Connect**) :
   - **Project URL**, de la forme `https://xxxx.supabase.co` ;
   - la clé publique : **anon public**, ou **publishable key** (`sb_publishable_…`) sur les projets récents.

## 2. Authentification

Dans **Authentication** :

1. **Sign In / Providers**, section **Allow anonymous sign-ins** : activez-la. Elle permet de jouer
   en invité.
2. **Sign In / Providers → Email** : activé. Il sert au lien magique.
3. **Sign In / Providers**, section **Allow manual linking** : activez-la. Elle permet de convertir
   un invité en compte Google sans perdre sa colonie.
4. **Sign In / Providers → Google** :
   - dans [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
     créez un **OAuth client ID** de type _Web application_ ;
   - dans _Authorized redirect URIs_, collez l'URL de callback affichée par Supabase
     (`https://xxxx.supabase.co/auth/v1/callback`) ;
   - recopiez le _Client ID_ et le _Client secret_ dans Supabase, puis activez le fournisseur.
5. **URL Configuration** :
   - _Site URL_ : `https://kiwars.vercel.app`, ou votre domaine ;
   - _Redirect URLs_ : ajoutez `https://kiwars.vercel.app/**`, `https://kiwars-*-sheschires-projects.vercel.app/**`
     (prévisualisations : adaptez au format des URLs affichées par Vercel) et `http://localhost:5173/**`.

> Conseil anti-abus : dans **Authentication → Attack Protection**, activez le CAPTCHA
> (Turnstile) pour les connexions anonymes si le jeu devient public.

## 3. Base de données

Deux options.

**Option A, avec la CLI (recommandée)**

```bash
npx supabase login
npx supabase link --project-ref xxxx        # xxxx = l'identifiant du projet
npx supabase db push                         # applique supabase/migrations
```

**Option B, à la main (projet neuf)** : ouvrez **SQL Editor**, collez **tout** le fichier
[`supabase/setup.sql`](../supabase/setup.sql) (il regroupe toutes les migrations dans l'ordre),
puis cliquez sur **Run**.

**Mises à jour ensuite** : chaque chantier qui touche la base ajoute un fichier dans
`supabase/migrations/` et Claude vous donne son SQL prêt à coller. Exécutez seulement les
nouvelles migrations, dans l'ordre (jamais `setup.sql` une seconde fois).

Ces tables sont créées : `games` (états de jeu), `command_log` (journal anti-triche), `admins`,
`universes`, `universe_members`, `chat_messages`, `chat_reports`, `audio_assets` et
`audio_bindings`, ainsi que le bucket Storage **`audio`** (lecture publique, 2 Mo par fichier).
Les joueurs peuvent seulement **lire** leur partie. Toute écriture passe par la fonction serveur.
Les parties (`games`) ne sont lisibles que par la fonction `game` : elles contiennent les
garnisons extraterrestres réelles, que les joueurs ne connaissent que par leurs reconnaissances.

Les sons (tables `audio_*` et bucket `audio`) sont lisibles par tout le monde et modifiables
uniquement par les comptes de la table `admins`.

Migrations, dans l'ordre :

| Fichier                                 | Contenu                                                    |
| --------------------------------------- | ---------------------------------------------------------- |
| `20261020000000_init.sql`               | parties, journal, admins                                   |
| `20261021000000_universes_chat.sql`     | univers partagés, chat d'équipe                            |
| `20261022000000_audio.sql`              | sons : `is_admin()`, tables `audio_*`, bucket              |
| `20261024000000_hide_game_state.sql`    | parties illisibles par les joueurs (garnisons cachées)     |
| `20261025000000_member_planet_seed.sql` | graine du kiwi d'une colonie solo emportée dans un univers |

## 4. Fonction serveur `game`

**Sans rien installer (recommandé)** : GitHub la déploie automatiquement (workflow
`.github/workflows/deploy-functions.yml`, à chaque modification de `supabase/functions/`).

1. Créez un jeton sur https://supabase.com/dashboard/account/tokens (_Generate new token_).
2. Sur GitHub : dépôt → **Settings → Secrets and variables → Actions → New repository secret** :
   - `SUPABASE_ACCESS_TOKEN` = le jeton ;
   - `SUPABASE_PROJECT_REF` = l'identifiant du projet (le `xxxx` de `https://xxxx.supabase.co`).
3. Onglet **Actions** → _Deploy Supabase functions_ → **Run workflow** (premier déploiement).
   Vérifiez ensuite dans Supabase → **Edge Functions** que `game` apparaît.

**Depuis un ordinateur** (alternative) :

```bash
pnpm build:functions                          # régénère le bundle des règles partagées
npx supabase functions deploy game --project-ref xxxx --use-api
```

La fonction utilise automatiquement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`, fournis par
Supabase. Aucun secret n'est à configurer côté Supabase.

## 5. Vercel

Dans le projet Vercel, ouvrez **Settings → Environment Variables** et ajoutez, pour _Production_
et _Preview_ :

| Nom                      | Valeur                                |
| ------------------------ | ------------------------------------- |
| `VITE_SUPABASE_URL`      | la Project URL                        |
| `VITE_SUPABASE_ANON_KEY` | la clé publique (anon ou publishable) |

Puis lancez **Deployments → … → Redeploy**. Les variables `VITE_*` sont intégrées au moment du build.

Le chat en direct utilise **Realtime** : la migration ajoute `chat_messages` à la publication
`supabase_realtime`. Vous pouvez le vérifier dans _Database → Publications_.

## 6. Vérifier

- Ouvrez le site : le nuage en haut à droite devient **vert** (« Sauvegardé en ligne »). Une
  pastille dorée indique que vous jouez en invité.
- Réglages → **Compte** → _Continuer avec Google_ : la colonie est conservée.
- Une colonie du Jalon 1 sauvegardée dans le navigateur est importée **une fois**, si le compte
  est encore vierge et si elle passe les contrôles de cohérence.

## Administration

- Pour autoriser les commandes debug (`+500 de tout`) sur un compte, lancez dans le SQL Editor :
  `insert into public.admins (user_id) values ('<uuid du joueur>');`
  L'uuid se trouve dans _Authentication → Users_. L'accélération du temps n'existe pas en ligne :
  c'est le serveur qui maîtrise l'horloge.
- Le même compte admin ouvre l'**espace admin des sons** sur `/admin` (connexion Google ou lien
  magique, avec le compte ajouté ci-dessus). Ajoutez `https://<votre-site>/admin` dans
  _Authentication → URL Configuration → Redirect URLs_ pour que la connexion y revienne.
  L'espace admin affiche l'uuid du compte connecté et la requête `insert` à lancer s'il n'est
  pas encore admin.
- Les messages signalés se lisent dans _Table editor → chat_reports_.
- Pour purger régulièrement le journal (plus de 30 jours), planifiez avec pg_cron :
  `select cron.schedule('purge-kiwar-log', '0 4 * * *', 'select public.purge_command_log()');`

## Développer en ligne sans Supabase

```bash
pnpm mock:supabase     # faux Supabase en mémoire sur :54321 (auth invité + fonction game)
pnpm dev:online        # client connecté au mock, sur http://localhost:5174
```

Ajoutez `?offline=1` à l'URL pour forcer le mode local même si les variables sont définies.
