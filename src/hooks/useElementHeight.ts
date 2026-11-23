import { useCallback, useState } from 'react';

/**
 * Tracks an element's rendered height (border box). Returns a callback ref and
 * the height (0 while unmounted), so layout can react to wrapping toolbars.
 */
export function useElementHeight<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [height, setHeight] = useState(0);
  const ref = useCallback((el: T | null) => {
    if (!el) {
      setHeight(0);
      return;
    }
    const measure = () => setHeight(Math.round(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // React 19 runs the returned cleanup (instead of ref(null)) when the element detaches.
    return () => {
      ro.disconnect();
      setHeight(0);
    };
  }, []);
  return [ref as (el: T | null) => void, height];
}
