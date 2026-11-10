"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export function WorkspaceNav({
  selected,
  label,
  children,
}: {
  selected: string;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState({ x: 0, width: 0 });
  useLayoutEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const measure = () => {
      const button = nav.querySelector<HTMLElement>('[aria-selected="true"]');
      setIndicator({
        x: button?.offsetLeft ?? 0,
        width: button?.offsetWidth ?? 0,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    for (const button of nav.querySelectorAll("button"))
      observer.observe(button);
    return () => observer.disconnect();
  }, [selected, label]);
  return (
    <nav
      className="workspace-nav"
      role="tablist"
      aria-label={label}
      ref={ref}
      style={
        {
          "--nav-x": `${indicator.x}px`,
          "--nav-width": `${indicator.width}px`,
        } as CSSProperties
      }
    >
      <span className="workspace-nav-indicator" aria-hidden="true" />
      {children}
    </nav>
  );
}
