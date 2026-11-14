"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";

type ScopedElement = HTMLElement & {
  startViewTransition?: (update: () => void) => ViewTransition;
};
type MotionOptions = {
  animate?: boolean;
  direction?: "forward" | "back";
  from?: string;
  to?: string;
  focus?: string;
  scrollTop?: number;
};

export function useWorkspaceMotion(rootRef: RefObject<HTMLDivElement | null>) {
  const sequence = useRef(0);
  const active = useRef<{
    transition?: ViewTransition;
    cleanup: () => void;
  } | null>(null);

  useEffect(
    () => () => {
      sequence.current += 1;
      active.current?.transition?.skipTransition();
      active.current?.cleanup();
    },
    [],
  );

  return useCallback(
    (update: () => void, options: MotionOptions = {}) => {
      const id = ++sequence.current;
      active.current?.transition?.skipTransition();
      active.current?.cleanup();
      active.current = null;
      const scope = rootRef.current as ScopedElement | null;
      if (!scope || !scope.clientWidth || !scope.clientHeight) {
        update();
        return;
      }
      const animate =
        options.animate !== false &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const direction = options.direction ?? "forward";
      scope.dataset.motionDirection = direction;
      const oldCard = options.from
        ? scope.querySelector<HTMLElement>(options.from)
        : null;
      const oldName = oldCard?.style.viewTransitionName ?? "";
      let newCard: HTMLElement | null = null;
      let newName = "";
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (oldCard) oldCard.style.viewTransitionName = oldName;
        if (newCard) newCard.style.viewTransitionName = newName;
        if (id === sequence.current) active.current = null;
      };
      if (oldCard && animate)
        oldCard.style.viewTransitionName = "workspace-card";
      const commit = () => {
        if (id !== sequence.current) return;
        if (oldCard) oldCard.style.viewTransitionName = oldName;
        flushSync(update);
        if (options.scrollTop !== undefined)
          scope.scrollTo({ top: options.scrollTop, behavior: "instant" });
        newCard = options.to
          ? scope.querySelector<HTMLElement>(options.to)
          : null;
        newName = newCard?.style.viewTransitionName ?? "";
        if (newCard && animate)
          newCard.style.viewTransitionName = "workspace-card";
        if (options.focus)
          scope
            .querySelector<HTMLElement>(options.focus)
            ?.focus({ preventScroll: true });
      };
      if (animate && scope.startViewTransition) {
        const transition = scope.startViewTransition(commit);
        active.current = { transition, cleanup };
        // A second interaction can skip the previous snapshot before it is ready.
        void transition.ready.catch(() => {});
        void transition.finished.then(cleanup, cleanup);
      } else {
        commit();
        cleanup();
        if (animate) {
          const animation = scope.animate(
            [
              {
                opacity: 0.25,
                transform: `translateX(${direction === "back" ? -14 : 14}px)`,
              },
              { opacity: 1, transform: "translateX(0)" },
            ],
            { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
          );
          active.current = { cleanup: () => animation.cancel() };
          void animation.finished.then(
            () => {
              if (id === sequence.current) active.current = null;
            },
            () => {},
          );
        }
      }
    },
    [rootRef],
  );
}
