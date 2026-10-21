import { trainingDuration, type GameState, type Villager } from '@kiwar/shared';

/** Chantier 20: how far a kiwi is through its course at the School (0 to 1), or null. */
export function trainingProgress(game: GameState, v: Villager, now: number): number | null {
  const job = v.job;
  if (job.kind !== 'train') return null;
  const school = game.buildings.find((b) => b.id === job.schoolId);
  if (!school) return null;
  const total = trainingDuration(school, job.classId);
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, (now - (job.until - total)) / total));
}

/** The course's progress bar (nothing when the kiwi is not in class). */
export function TrainingBar({ game, v, now }: { game: GameState; v: Villager; now: number }) {
  const share = trainingProgress(game, v, now);
  if (share === null) return null;
  return (
    <span class="xp-bar training-bar" role="progressbar" aria-valuenow={Math.round(share * 100)}>
      <span style={{ width: `${share * 100}%` }} />
    </span>
  );
}
