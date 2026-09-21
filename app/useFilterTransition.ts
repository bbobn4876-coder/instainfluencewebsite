"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** How long a card takes to fade out, and the survivors to slide into place. */
export const FILTER_MS = 300;

type Keyed = { id: string };

/**
 * Keeps filtered-out items mounted long enough to animate away, and slides the
 * survivors to their new spots (FLIP) instead of letting the grid snap.
 *
 * Returns the list to render plus the ids on their way out, so the caller can
 * mark them and let CSS handle the fade.
 */
export function useFilterTransition<T extends Keyed>(
  items: T[],
  container: React.RefObject<HTMLElement | null>,
  enabled = true,
): { rendered: T[]; leaving: Set<string> } {
  const [rendered, setRendered] = useState<T[]>(items);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const positions = useRef(new Map<string, DOMRect>());

  // Measure where every card sits before React paints the new list.
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const next = new Map<string, DOMRect>();
    for (const node of root.querySelectorAll<HTMLElement>("[data-flip-id]")) {
      next.set(node.dataset.flipId!, node.getBoundingClientRect());
    }
    positions.current = next;
  });

  useEffect(() => {
    if (!enabled) {
      setRendered(items);
      setLeaving(new Set());
      return;
    }

    const wanted = new Set(items.map((item) => item.id));
    const gone = rendered.filter((item) => !wanted.has(item.id)).map((item) => item.id);
    const added = items.filter((item) => !rendered.some((seen) => seen.id === item.id));

    if (gone.length === 0 && added.length === 0) {
      // Same set, but the order may have changed.
      setRendered(items);
      return;
    }

    if (gone.length > 0) {
      // Hold the departing cards in place while they fade, then drop them.
      setLeaving(new Set(gone));
      const timer = window.setTimeout(() => {
        setLeaving(new Set());
        setRendered(items);
      }, FILTER_MS);
      return () => window.clearTimeout(timer);
    }

    setLeaving(new Set());
    setRendered(items);
    // `rendered` is this effect's own output; reacting to it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, enabled]);

  // After the list settles, move each survivor from where it was to where it is.
  useLayoutEffect(() => {
    const root = container.current;
    if (!root || !enabled) return;
    const before = positions.current;
    for (const node of root.querySelectorAll<HTMLElement>("[data-flip-id]")) {
      const id = node.dataset.flipId!;
      const previous = before.get(id);
      if (!previous) continue;
      const now = node.getBoundingClientRect();
      const dx = previous.left - now.left;
      const dy = previous.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: FILTER_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
      );
    }
  }, [rendered, leaving, container, enabled]);

  return { rendered, leaving };
}
