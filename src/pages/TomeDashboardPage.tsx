import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import type { ImageSource, Tome, TomeStatus } from "../models/Tome";
import type { SaveState } from "../hooks/autosave";
import type { CaretPoint } from "../lexical/CaretAtPointPlugin";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useConfirm } from "../context/ConfirmContext";
import { useProseFace } from "../context/ProseFaceContext";
import { ImagePicker } from "../components/ImagePicker";
import { InlineTextField } from "../components/InlineTextField";
import { ProseField } from "../components/ProseField";
import { SaveStatus } from "../components/SaveStatus";

export function TomeDashboardPage() {
  const { tome } = useTomeWorkspace();
  if (!tome) return null;

  // Keyed by id for `ElementPage`'s reason: moving between two tomes builds a
  // fresh page rather than carrying one book's pending edit onto the next.
  return <TomeOverview key={tome.id} tome={tome} />;
}

/**
 * A tome as a page you read, with every field editable where it sits.
 *
 * `ElementPage`'s arrangement one table over, and it holds the same rules —
 * they are written up in full there and in `components/AGENTS.md`:
 *
 * - **No Save button.** There is no form to submit, so nothing for a Cancel to
 *   undo, and `SaveStatus` is the only thing that says a write happened.
 * - **Writes are patches.** `store.updateTome` re-reads the row inside its
 *   transaction, so the title saved while a live query's echo is in flight
 *   cannot revert the subtitle saved a moment before it.
 * - **A deactivated prose field redraws from `edit`, not from the row**, since
 *   the write and its echo are not synchronous and re-reading would flash the
 *   pre-edit text for a frame.
 *
 * There is no unmount sweep: unlike an element or a prose row, a tome is never
 * created as a draft at a click site — `TomeFormDialog` makes one deliberately,
 * with a title, and only ever on `/tomes/new`.
 */
function TomeOverview({ tome }: { tome: Tome }) {
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const { face } = useProseFace();
  const [save, setSave] = useState<{ state: SaveState; retry: () => void }>({
    state: "clean",
    retry: () => {},
  });
  const [active, setActive] = useState<{ point: CaretPoint | null } | null>(null);
  // What the description editor last held. See the note above the component.
  const [edit, setEdit] = useState<string | null>(null);
  const [error, setError] = useState("");
  const tomeId = tome.id;

  const handleSaveState = useCallback(
    (state: SaveState, retry: () => void) => setSave({ state, retry }),
    [],
  );

  /**
   * Every write on this page. A rejected one — a cleared title — is reported as
   * an inline alert rather than only in the console, since there is no dialog
   * left to render it in.
   */
  const patch = useCallback(
    async (fields: Parameters<typeof store.updateTome>[1]) => {
      try {
        await store.updateTome(tomeId, fields);
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save that change.");
        throw cause;
      }
    },
    [tomeId],
  );

  return (
    // A click anywhere that is not the description stands it down, exactly as
    // on the element page — `ProseField` stops its own clicks so the caret can
    // still be moved inside it.
    <Box onClick={() => setActive(null)} sx={{ maxWidth: 680 }}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}
      >
        <Typography
          variant="overline"
          color="primary"
          sx={{ fontWeight: 800, letterSpacing: "0.12em" }}
        >
          TOME OVERVIEW
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <SaveStatus state={save.state} savedAt={tome.updatedAt} onRetry={save.retry} />
          {/* Up here with the other controls rather than down among the fields:
              a status is something the author sets about the book, not part of
              what they write in it. A plain select saving on change, like a
              `select` custom field — at rest it already looks like a value, so
              there is nothing to swap. */}
          <TextField
            select
            size="small"
            value={tome.status}
            onChange={(event) => void patch({ status: event.target.value as TomeStatus })}
            slotProps={{ htmlInput: { "aria-label": "Status" } }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="Draft">Draft</MenuItem>
            <MenuItem value="Completed">Completed</MenuItem>
            <MenuItem value="Archived">Archived</MenuItem>
          </TextField>
          {/* Last, and on its own at the end of the row: the library card is a
              link to this page and nothing else, so this is the only place a
              book can be deleted — which is where the cost of deleting one is
              actually on screen. */}
          <Tooltip title="Delete this tome">
            <IconButton
              aria-label="Delete"
              size="small"
              color="error"
              onClick={() =>
                confirmAction(
                  `Permanently delete "${tome.title}" and everything in it? This cannot be undone.`,
                  async () => {
                    await store.deleteTome(tomeId);
                    navigate("/tomes");
                  },
                )
              }
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      ) : null}

      {/* The cover is shown whole rather than cropped, so `imageSx` sizes it by
          its own proportions inside the tile. The tile's own height is for the
          monogram that stands in when there is no cover and so has no
          proportions of its own. */}
      <ImagePicker
        image={tome.coverImage}
        label={tome.title}
        alt="cover"
        onChange={(coverImage?: ImageSource) => void patch({ coverImage })}
        sx={{ height: 220, maxWidth: 340 }}
        imageSx={{ objectFit: "contain", bgcolor: "transparent" }}
      />

      <Box sx={{ mt: 1.5 }}>
        <InlineTextField
          value={tome.title}
          placeholder="Title"
          ariaLabel="Title"
          save={(title) => patch({ title })}
          onSaveState={handleSaveState}
          onFocus={() => setActive(null)}
          sx={{ fontSize: "1.7rem", fontWeight: 700, lineHeight: 1.2 }}
        />
      </Box>
      <Box sx={{ mt: 0.5 }}>
        <InlineTextField
          value={tome.subtitle ?? ""}
          placeholder="Add a subtitle…"
          ariaLabel="Subtitle"
          save={(subtitle) => patch({ subtitle })}
          onSaveState={handleSaveState}
          onFocus={() => setActive(null)}
          sx={{ fontSize: "1.3rem", lineHeight: 1.3 }}
        />
      </Box>

      <Box sx={{ mt: 3 }}>
        <ProseField
          value={edit ?? tome.description}
          active={active !== null}
          caretPoint={active?.point ?? null}
          face={face}
          placeholder="Click to give this tome its north star…"
          editorKey={`${tomeId}:description`}
          save={(description) => patch({ description })}
          onActivate={(point) => setActive({ point })}
          onEdit={setEdit}
          onSaveState={handleSaveState}
        />
      </Box>
    </Box>
  );
}
