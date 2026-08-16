import { useEffect, useRef, useState } from "react";
import type { Subscription } from "dexie";

/**
 * Subscribes to a Dexie liveQuery-backed observer (as exposed by `services/store`)
 * and re-subscribes whenever `deps` changes. The subscribe function itself is read
 * from a ref updated on every render, so callers can pass a fresh closure each time
 * without needing to memoize it.
 */
export function useObservable<T>(
  subscribe: (callback: (value: T) => void) => Subscription,
  deps: React.DependencyList,
): T | undefined {
  const [value, setValue] = useState<T>();
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;

  useEffect(() => {
    const subscription = subscribeRef.current(setValue);
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
