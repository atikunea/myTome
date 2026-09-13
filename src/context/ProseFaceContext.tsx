import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { proseFaces, type ProseFace } from "../components/manuscriptStyles";

const STORAGE_KEY = "mytome:prose-face";
const INDENT_KEY = "mytome:first-line-indent";

/**
 * The manuscript's typeface, chosen on the focus surface and applied wherever
 * prose is drawn, and whether its paragraphs indent their first line. They
 * live in `localStorage` rather than Dexie, following `ColorModeContext`: they
 * are properties of this browser, not of a tome, and a tome exported to
 * another machine should not carry someone else's reading preference with it.
 *
 * The indent is here rather than beside the measure in `FocusSurface` because
 * the export reads it too: a manuscript prints and downloads indented if it
 * was written indented. Unlike the face it applies to the focus surface only —
 * a first-line indent on an element's description would read as a mistake.
 *
 * The measure is the surface's other choice, and is not here: nothing but
 * `FocusSurface` reads it, so it keeps its own key there.
 */
const initialFace = (): ProseFace => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return proseFaces.find((face) => face === stored) ?? "serif";
};

const initialIndent = () => localStorage.getItem(INDENT_KEY) === "true";

type ProseFaceValue = {
  face: ProseFace;
  setFace: (face: ProseFace) => void;
  firstLineIndent: boolean;
  setFirstLineIndent: (indent: boolean) => void;
};

const ProseFaceContext = createContext<ProseFaceValue | undefined>(undefined);

export function ProseFaceProvider({ children }: { children: ReactNode }) {
  const [face, setFace] = useState<ProseFace>(initialFace);
  const [firstLineIndent, setFirstLineIndent] = useState(initialIndent);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, face);
  }, [face]);

  useEffect(() => {
    localStorage.setItem(INDENT_KEY, String(firstLineIndent));
  }, [firstLineIndent]);

  const value = useMemo(
    () => ({ face, setFace, firstLineIndent, setFirstLineIndent }),
    [face, firstLineIndent],
  );

  return <ProseFaceContext.Provider value={value}>{children}</ProseFaceContext.Provider>;
}

export function useProseFace() {
  const value = useContext(ProseFaceContext);
  if (!value) throw new Error("useProseFace must be used inside a ProseFaceProvider");
  return value;
}
