import { createContext, useContext, type ReactNode } from "react";
import type { Tome } from "../models/Tome";
import { store } from "../services/store";
import { useObservable } from "../hooks/useObservable";

const TomesContext = createContext<Tome[] | undefined>(undefined);

export function TomesProvider({ children }: { children: ReactNode }) {
  const tomes = useObservable<Tome[]>((cb) => store.observeTomes(cb), []) ?? [];
  return <TomesContext.Provider value={tomes}>{children}</TomesContext.Provider>;
}

export function useTomes() {
  const ctx = useContext(TomesContext);
  if (ctx === undefined) throw new Error("useTomes must be used within TomesProvider");
  return ctx;
}
