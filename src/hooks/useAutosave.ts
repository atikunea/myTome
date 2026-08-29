import { useEffect, useRef, useState } from "react";
import type { AutosaveController, SaveState } from "./autosave";
import { createAutosave } from "./autosave";

/**
 * Binds an {@link createAutosave} controller to React state, so a component can
 * render the save state without owning any of the timing.
 *
 * The controller is created once per component instance and kept in a ref — it
 * is inert until `schedule` is called, so building it during render is safe,
 * and building it there rather than in an effect means `StrictMode`'s dev-only
 * remount reuses the same machine instead of throwing away a debounce that was
 * already ticking.
 */
export function useAutosave(save: () => Promise<void>) {
  const [state, setState] = useState<SaveState>("clean");

  // Read through a ref so the controller, built once, always calls the current
  // closure rather than the one from the render that happened to create it.
  const saveRef = useRef(save);
  saveRef.current = save;

  // A transition can arrive after the component is gone — the unmount flush
  // writes, and a floor timer may still be in flight. `alive` keeps those from
  // setting state on a dead component, and the re-run effect sets it back
  // before anything deferred fires under StrictMode's remount.
  const alive = useRef(true);

  const controller = useRef<AutosaveController>(undefined);
  if (!controller.current) {
    controller.current = createAutosave({
      save: () => saveRef.current(),
      onState: (next) => {
        if (alive.current) setState(next);
      },
    });
  }
  const autosave = controller.current;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Only the timers: `dirty` stands, so the caller's unmount flush can
      // still write the edit that was waiting.
      autosave.cancel();
    };
  }, [autosave]);

  return { state, autosave };
}
