import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProseFace } from "../components/manuscriptStyles";

const STORAGE_KEY = "mytome:prose-face";

/**
 * The manuscript's typeface is the one piece of the focus surface an author
 * chooses. It lives in `localStorage` rather than Dexie, following
 * `ColorModeContext`: it is a property of this browser, not of a tome, and a
 * tome exported to another machine should not carry someone else's reading
 * preference with it.
 *
 * The measure is deliberately *not* here — see `proseMeasure`.
 */
const initialFace = (): ProseFace => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "sans" || stored === "serif" ? stored : "serif";
};

type ProseFaceValue = { face: ProseFace; setFace: (face: ProseFace) => void };

const ProseFaceContext = createContext<ProseFaceValue | undefined>(undefined);

export function ProseFaceProvider({ children }: { children: ReactNode }) {
  const [face, setFace] = useState<ProseFace>(initialFace);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, face);
  }, [face]);

  const value = useMemo(() => ({ face, setFace }), [face]);

  return <ProseFaceContext.Provider value={value}>{children}</ProseFaceContext.Provider>;
}

export function useProseFace() {
  const value = useContext(ProseFaceContext);
  if (!value) throw new Error("useProseFace must be used inside a ProseFaceProvider");
  return value;
}
