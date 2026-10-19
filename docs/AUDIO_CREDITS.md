# Crédits audio

Tous les fichiers de `apps/client/public/audio/` sont dans le **domaine public (CC0 1.0)** :
https://creativecommons.org/publicdomain/zero/1.0/. Aucune attribution n'est exigée, mais nous
remercions leurs auteurs. Chaque son existe en `.ogg` et en `.mp3` (le navigateur prend le format
qu'il sait lire). Ils ont été convertis en mono, et les ambiances ont été découpées, normalisées
et rendues bouclables (fondu enchaîné).

Les sons que le jeu génère en code (`apps/client/src/audio/synth.ts`) sont originaux et servent de
secours quand un fichier ne peut pas être lu.

| Fichier (`public/audio/…`)        | Source                                                               | Auteur             | Licence |
| --------------------------------- | -------------------------------------------------------------------- | ------------------ | ------- |
| `ui/click1`, `ui/click2`          | Interface Sounds — `click_002`, `click_003`                          | Kenney (kenney.nl) | CC0     |
| `ui/tick`                         | Interface Sounds — `tick_002`                                        | Kenney             | CC0     |
| `ui/open`, `ui/close`             | Interface Sounds — `open_001`, `close_001`                           | Kenney             | CC0     |
| `ui/error`                        | Interface Sounds — `error_004`                                       | Kenney             | CC0     |
| `ui/notify`                       | Interface Sounds — `glass_001`                                       | Kenney             | CC0     |
| `colony/full`                     | Interface Sounds — `bong_001`                                        | Kenney             | CC0     |
| `build/wood1` à `build/wood3`     | Impact Sounds — `impactWood_medium_000` à `002`                      | Kenney             | CC0     |
| `build/remove`                    | Impact Sounds — `impactPlank_medium_000`                             | Kenney             | CC0     |
| `paths/step1`, `paths/step2`      | Impact Sounds — `footstep_grass_000`, `001`                          | Kenney             | CC0     |
| `colony/gather`                   | Impact Sounds — `impactSoft_medium_000`                              | Kenney             | CC0     |
| `build/complete`, `build/upgrade` | Music Jingles — `jingles_PIZZI01`, `jingles_PIZZI07`                 | Kenney             | CC0     |
| `ship/arrive`, `ship/return`      | Music Jingles — `jingles_PIZZI03`, `jingles_PIZZI12`                 | Kenney             | CC0     |
| `ambience/birds`                  | « Park Ambiences » — `park_ambience_birds` (extrait de 44 s à 70 s)  | Thimras            | CC0     |
| `ambience/wind`                   | « Park Ambiences » — `park_ambience_wind` (extrait de 214 s à 240 s) | Thimras            | CC0     |
| `music/small-fire`                | « A Small Fire Will Do (Calming Loop) »                              | Trex0n             | CC0     |

Pages des sources :

- Kenney : https://kenney.nl/assets/interface-sounds, https://kenney.nl/assets/impact-sounds,
  https://kenney.nl/assets/music-jingles
- Thimras : https://opengameart.org/content/park-ambiences
- Trex0n : https://opengameart.org/content/a-small-fire-will-do-calming-loop

Pour ajouter un son au dépôt : déposer le `.ogg` et le `.mp3`, l'ajouter à
`apps/client/src/audio/builtin.ts` et compléter ce tableau. Les sons envoyés depuis l'espace
admin (`/admin`) n'ont pas besoin d'être listés ici, mais leur licence doit permettre l'usage.
