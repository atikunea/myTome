import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";

/**
 * The one line the guide shrinks to once the shelf has something on it.
 *
 * The library page shows the whole of `LibraryGuide` while the shelf is empty —
 * the only screen in the app with nothing to lose — and this afterwards. It
 * owns its own visibility rather than taking an `open` prop, because the only
 * thing that decides it is a dismissal this component records.
 *
 * **Dismissal is a preference of this browser, not of a tome**, so it lives in
 * `localStorage` beside colour mode and the prose face rather than in Dexie: a
 * tome carried to another machine should not arrive having already dismissed
 * something its new reader has never seen. Adding it means the privacy page's
 * storage list is wrong until it is edited too — it names every key.
 *
 * A dismissal is not a deletion: the guide keeps a permanent home at
 * `/tomes/guide`, linked from the library footer, so pressing ✕ hides a nudge
 * rather than losing a page.
 */

const STORAGE_KEY = "mytome:guide-dismissed";

function initiallyDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // A browser refusing storage (private mode, blocked site data) should show
    // the strip, not fail the page — the guide is worth more than the dismissal.
    return false;
  }
}

export function GuideStrip() {
  const [dismissed, setDismissed] = useState(initiallyDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Hidden for this visit is better than not hidden at all.
    }
  };

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 1, sm: 2 }}
      sx={(theme) => ({
        alignItems: { xs: "flex-start", sm: "center" },
        border: 1,
        borderColor: alpha(theme.palette.primary.main, 0.35),
        bgcolor: alpha(theme.palette.primary.main, 0.06),
        borderRadius: "12px",
        px: 2,
        py: 1.25,
      })}
    >
      <Typography sx={{ fontWeight: 800, fontSize: "0.95rem" }}>Still finding your way?</Typography>
      <Typography color="text.secondary" sx={{ fontSize: "0.92rem", flex: 1 }}>
        Five steps from an empty tome to a printed manuscript.
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Button component={RouterLink} to="/tomes/guide" size="small" variant="text">
          Read it
        </Button>
        <IconButton size="small" aria-label="Dismiss the guide" onClick={dismiss}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    </Stack>
  );
}
