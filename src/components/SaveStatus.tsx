import {
  Box,
  CircularProgress,
  Link,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import PendingOutlinedIcon from "@mui/icons-material/PendingOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import type { SaveState } from "../hooks/autosave";

const labels: Record<SaveState, string> = {
  clean: "Saved",
  pending: "Editing…",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn’t save",
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * The autosave indicator for the Write editor: one caption-sized line that is
 * never absent, reading "Saved" in `text.secondary` at rest.
 *
 * It is deliberately stateless — the editor owns the machine and hands the
 * current state down, so the words can never disagree with what was written.
 * Two details are load-bearing:
 *
 * - **The icon sits in a fixed 16px box.** The spinner and the glyphs are
 *   different sizes, and without the box the words shuffle sideways on every
 *   state change.
 * - **Only the failure is announced.** A polite live region on the success
 *   states would speak every few seconds while someone writes, which is worse
 *   than silence; `role="alert"` on the error branch alone leaves "Saved"
 *   readable on demand rather than pushed.
 */
export function SaveStatus({
  state,
  savedAt,
  onRetry,
}: {
  state: SaveState;
  /** ISO timestamp of the last write, shown in the tooltip. */
  savedAt?: string;
  onRetry: () => void;
}) {
  // A frozen spinner reads as a hung save rather than a calm one, so reduced
  // motion swaps it for the same static glyph `pending` uses.
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  if (state === "error") {
    return (
      <Stack
        role="alert"
        direction="row"
        spacing={0.625}
        sx={{ alignItems: "center", color: "error.main" }}
      >
        <Box sx={{ width: 16, height: 16, display: "grid", placeItems: "center" }}>
          <WarningAmberRoundedIcon sx={{ fontSize: 16 }} />
        </Box>
        <Typography variant="caption" sx={{ lineHeight: 1 }}>
          {labels.error}
        </Typography>
        <Link
          component="button"
          type="button"
          variant="caption"
          underline="always"
          onClick={onRetry}
          sx={{ color: "inherit", fontWeight: 700, lineHeight: 1 }}
        >
          Retry
        </Link>
      </Stack>
    );
  }

  const spinning = state === "saving" && !reducedMotion;
  const persisted = state === "clean" || state === "saved";

  return (
    <Tooltip
      title={savedAt ? `Saved in this browser at ${formatTime(savedAt)}` : ""}
      placement="bottom"
    >
      <Stack
        direction="row"
        spacing={0.625}
        sx={{
          alignItems: "center",
          color: state === "saved" ? "success.main" : "text.secondary",
          transition: (theme) => theme.transitions.create("color"),
        }}
      >
        <Box sx={{ width: 16, height: 16, display: "grid", placeItems: "center" }}>
          {spinning ? (
            <CircularProgress size={13} thickness={5} color="inherit" />
          ) : persisted ? (
            <CheckCircleOutlineRoundedIcon sx={{ fontSize: 16 }} />
          ) : (
            <PendingOutlinedIcon sx={{ fontSize: 16 }} />
          )}
        </Box>
        <Typography variant="caption" sx={{ lineHeight: 1 }}>
          {labels[state]}
        </Typography>
      </Stack>
    </Tooltip>
  );
}
