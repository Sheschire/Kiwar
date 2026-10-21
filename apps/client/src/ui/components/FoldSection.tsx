import type { ComponentChildren } from 'preact';
import { useThumbLayout } from '../layout';

/**
 * Chantier 21: a sheet section that folds behind its title on phones and touch screens (long
 * sheets keep their main actions and the essentials in view); a plain section elsewhere.
 */
export function FoldSection({
  title,
  class: cls = '',
  children,
}: {
  title: ComponentChildren;
  class?: string;
  children: ComponentChildren;
}) {
  const thumb = useThumbLayout();
  if (!thumb)
    return (
      <section class={`field ${cls}`}>
        <h3>{title}</h3>
        {children}
      </section>
    );
  return (
    <details class={`field fold-details ${cls}`}>
      <summary>
        <h3>{title}</h3>
      </summary>
      {children}
    </details>
  );
}
