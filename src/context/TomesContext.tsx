import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Tome } from "../models/Tome";
import { requestPersistentStorage, store } from "../services/store";
import { useObservable } from "../hooks/useObservable";

const TomesContext = createContext<Tome[] | undefined>(undefined);

export function TomesProvider({ children }: { children: ReactNode }) {
  const tomes = useObservable<Tome[]>((cb) => store.observeTomes(cb), []) ?? [];

  // Move the database off the browser's evictable tier once there is a book in
  // it worth keeping. Deliberately not on mount: Firefox prompts for this, and
  // a visitor who has not written anything yet should not be asked. The request
  // memoises, so the repeat renders and StrictMode's double mount cost nothing.
  const hasWork = tomes.length > 0;
  useEffect(() => {
    if (!hasWork) return;
    void requestPersistentStorage();
  }, [hasWork]);

  return <TomesContext.Provider value={tomes}>{children}</TomesContext.Provider>;
}

export function useTomes() {
  const ctx = useContext(TomesContext);
  if (ctx === undefined) throw new Error("useTomes must be used within TomesProvider");
  return ctx;
}
