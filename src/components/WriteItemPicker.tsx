import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import type { PlotItem } from "../models/Plot";
import type { WriteItem } from "../models/WriteItem";
import { untitledWriteItem, writeItemTypeLabels } from "../models/WriteItem";
import { store } from "../services/store";
import { useObservable } from "../hooks/useObservable";
import { WriteItemTypeIcon } from "./WriteItemTypeIcon";

/**
 * Picks text already written in this tome to compose into a beat.
 *
 * Composing one `WriteItem` into several beats is legal by design, so a text
 * already used elsewhere is **shown with a count, not hidden** — "in 2 beats" is
 * information the author wants, and suppressing those rows would quietly make
 * the reuse the model allows unreachable. Only the beat's *own* text is filtered
 * out, via `exclude`: `setPlotItemWriteItems` dedupes anyway, so offering them
 * would be a control that does nothing.
 *
 * Picking is multi-select and **lands in the order picked**, which is why the
 * selection is an array rather than a `Set` — pulling in three snippets in
 * reading order should not then need three trips through "Move earlier".
 *
 * Mounted only while its route is matched (like `RestoreDialog`), so the tome's
 * beats are subscribed to while the picker is open rather than for the whole
 * writing session.
 */
export function WriteItemPicker({
  tomeId,
  items,
  exclude,
  where,
  onAdd,
  onClose,
}: {
  tomeId: string;
  /** Every text in the tome. What this beat already holds is filtered out here. */
  items: WriteItem[];
  exclude: string[];
  /** Where the picked texts will land, in words — "at the end", "before …". */
  where: string;
  onAdd: (ids: string[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const beats =
    useObservable<PlotItem[]>(
      (cb) => store.observeTomePlotItems(tomeId, cb),
      [tomeId],
    ) ?? [];

  /** How many beats compose each text — the "already used" hint beside a row. */
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const beat of beats)
      for (const id of beat.writeItemIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [beats]);

  const candidates = useMemo(() => {
    const taken = new Set(exclude);
    return items
      .filter((item) => !taken.has(item.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [items, exclude]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        item.preview.toLowerCase().includes(needle),
    );
  }, [candidates, query]);

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    );

  const submit = async () => {
    if (!picked.length) return;
    setBusy(true);
    try {
      await onAdd(picked);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        Add existing text
        <Typography variant="body2" color="text.secondary">
          {where}
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {candidates.length ? (
          <>
            <Box sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
              <TextField
                autoFocus
                fullWidth
                size="small"
                placeholder="Search titles and text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" color="disabled" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>
            {visible.length ? (
              <List dense sx={{ maxHeight: 360, overflowY: "auto", py: 0 }}>
                {visible.map((item) => {
                  const used = usage.get(item.id) ?? 0;
                  return (
                    <ListItemButton
                      key={item.id}
                      onClick={() => toggle(item.id)}
                      sx={{ px: 3, alignItems: "flex-start" }}
                    >
                      <ListItemIcon sx={{ minWidth: 34, mt: 0.25 }}>
                        <Checkbox
                          edge="start"
                          size="small"
                          tabIndex={-1}
                          disableRipple
                          checked={picked.includes(item.id)}
                          sx={{ p: 0 }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Stack
                            direction="row"
                            spacing={0.75}
                            sx={{ alignItems: "center", minWidth: 0 }}
                          >
                            <WriteItemTypeIcon
                              type={item.type}
                              fontSize="small"
                              sx={{ color: "text.disabled", flexShrink: 0 }}
                            />
                            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                              {item.title.trim() || untitledWriteItem}
                            </Typography>
                            <Typography variant="caption" color="text.disabled" noWrap>
                              {writeItemTypeLabels[item.type]}
                              {used ? ` · in ${used} ${used === 1 ? "beat" : "beats"}` : ""}
                            </Typography>
                          </Stack>
                        }
                        secondary={item.preview.trim() || "No text yet"}
                        slotProps={{
                          secondary: {
                            noWrap: true,
                            variant: "body2",
                            color: "text.secondary",
                          },
                        }}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            ) : (
              <Box sx={{ px: 3, py: 5, textAlign: "center" }}>
                <Typography color="text.secondary">
                  Nothing matches “{query.trim()}”.
                </Typography>
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ px: 3, py: 5, textAlign: "center" }}>
            <Typography variant="h2" sx={{ fontSize: "1.2rem", mb: 1 }}>
              {items.length ? "This beat already holds every text" : "Nothing written yet"}
            </Typography>
            <Typography color="text.secondary">
              {items.length
                ? "Every text in this tome is already part of this beat."
                : "Write something first, and it can be composed into any beat."}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {picked.length > 1 ? (
          <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
            Added in the order you picked them
          </Typography>
        ) : null}
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={!picked.length || busy}
        >
          {picked.length > 1 ? `Add ${picked.length} texts` : "Add text"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
