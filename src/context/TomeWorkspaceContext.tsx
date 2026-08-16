import { createContext, useContext, type ReactNode } from "react";
import type { Tome } from "../models/Tome";
import type { ElementType } from "../models/ElementType";
import { store } from "../services/store";
import { useObservable } from "../hooks/useObservable";

interface TomeWorkspace {
  tome?: Tome;
  types: ElementType[];
}

const TomeWorkspaceContext = createContext<TomeWorkspace | undefined>(undefined);

export function TomeWorkspaceProvider({
  tomeId,
  children,
}: {
  tomeId: string;
  children: ReactNode;
}) {
  const tome = useObservable<Tome | undefined>((cb) => store.observeTome(tomeId, cb), [tomeId]);
  const types = useObservable<ElementType[]>((cb) => store.observeTypes(tomeId, cb), [tomeId]) ?? [];

  return (
    <TomeWorkspaceContext.Provider value={{ tome, types }}>
      {children}
    </TomeWorkspaceContext.Provider>
  );
}

export function useTomeWorkspace() {
  const ctx = useContext(TomeWorkspaceContext);
  if (ctx === undefined)
    throw new Error("useTomeWorkspace must be used within TomeWorkspaceProvider");
  return ctx;
}
