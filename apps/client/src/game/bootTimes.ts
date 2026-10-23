/**
 * Chantier 32: milestones of the page load (ms since navigation start), shown in the `?debug`
 * panel and printed once to the console with `?debug`, to see which step makes a refresh slow.
 */
export interface BootStep {
  step: string;
  at: number;
}

const steps: BootStep[] = [];

export function bootMark(step: string): void {
  // Later loads (universe switches) are not the boot: keep the list short.
  if (steps.length < 24) steps.push({ step, at: Math.round(performance.now()) });
}

export function bootSteps(): readonly BootStep[] {
  return steps;
}

/** One line: "script 120 · renderer 340 (+220) · …". */
export function bootSummary(): string {
  return steps
    .map((s, i) =>
      i === 0 ? `${s.step} ${s.at}` : `${s.step} ${s.at} (+${s.at - steps[i - 1]!.at})`,
    )
    .join(' · ');
}
