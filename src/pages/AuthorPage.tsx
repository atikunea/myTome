import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import type { Author } from "../models/Author";
import { authorByline } from "../models/Author";
import type { ImageSource } from "../models/Tome";
import type { SaveState } from "../hooks/autosave";
import type { CaretPoint } from "../lexical/CaretAtPointPlugin";
import { store } from "../services/store";
import { useTomes } from "../context/TomesContext";
import { useConfirm } from "../context/ConfirmContext";
import { useProseFace } from "../context/ProseFaceContext";
import { useObservable } from "../hooks/useObservable";
import { ImagePicker } from "../components/ImagePicker";
import { InlineTextField } from "../components/InlineTextField";
import { ProseField } from "../components/ProseField";
import { SaveStatus } from "../components/SaveStatus";

export function AuthorPage() {
  const { authorId } = useParams<{ authorId: string }>();
  const author = useObservable<Author | null>(
    (cb) => store.observeAuthor(authorId!, cb),
    [authorId],
  );

  if (author === undefined) return null;
  if (author === null)
    return (
      <Container maxWidth="md" sx={{ py: { xs: 3.5, sm: 6 } }}>
        <BackToAuthors />
        <Typography variant="h2" sx={{ fontSize: "1.7rem", mt: 2 }}>
          That author no longer exists
        </Typography>
      </Container>
    );

  // Keyed by id so moving between two profiles builds a fresh page rather than
  // carrying one's pending bio onto the next — `ElementPage`'s reason.
  return <AuthorDetail key={author.id} author={author} />;
}

function BackToAuthors() {
  return (
    <Button
      component={RouterLink}
      to="/authors"
      size="small"
      startIcon={<ArrowBackIcon fontSize="small" />}
      sx={{ color: "text.secondary", fontWeight: 500, px: 0 }}
    >
      Authors
    </Button>
  );
}

/**
 * A profile as a page you read, with every field edited where it sits.
 *
 * The element page's arrangement a third time, and it holds the same rules —
 * written up in full there and in `components/AGENTS.md`: no Save button, so
 * `SaveStatus` is the only thing that says a write happened; writes are patches
 * re-read inside their transaction; the bio redraws from `edit`, not the row,
 * when its editor stands down; and a click that reaches the page stands it
 * down.
 *
 * Unlike the tome overview it **does** sweep on unmount, because a profile —
 * like an element — is created blank at a click site ("New author", or "New
 * author…" on a tome's overview) and an untouched one should not survive being
 * walked away from. The sweep is `ElementPage`'s verbatim: deferred a tick past
 * StrictMode's remount, and awaiting the editor's flush first.
 */
function AuthorDetail({ author }: { author: Author }) {
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const { face } = useProseFace();
  const tomes = useTomes();
  const [save, setSave] = useState<{ state: SaveState; retry: () => void }>({
    state: "clean",
    retry: () => {},
  });
  const [active, setActive] = useState<{ point: CaretPoint | null } | null>(null);
  // What the bio editor last held. See the note above the component.
  const [edit, setEdit] = useState<string | null>(null);
  const [error, setError] = useState("");
  const flushRef = useRef<Promise<unknown> | null>(null);
  const alive = useRef(true);
  const authorId = author.id;

  const credited = tomes.filter((tome) => tome.authorId === authorId);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.setTimeout(async () => {
        await flushRef.current;
        if (!alive.current) await store.discardAuthorIfBlank(authorId);
      }, 0);
    };
  }, [authorId]);

  const handleSaveState = useCallback(
    (state: SaveState, retry: () => void) => setSave({ state, retry }),
    [],
  );

  /** Every write on this page. A cleared name is refused, and said so inline. */
  const patch = useCallback(
    async (fields: Parameters<typeof store.updateAuthor>[1]) => {
      try {
        await store.updateAuthor(authorId, fields);
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save that change.");
        throw cause;
      }
    },
    [authorId],
  );

  const byline = authorByline(author);

  return (
    <Container
      maxWidth="md"
      onClick={() => setActive(null)}
      sx={{ py: { xs: 3.5, sm: 6 } }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}
      >
        <BackToAuthors />
        {/* Clear of `ColorModeToggle`, fixed in the corner: on a phone the
            container's edge runs under it and would swallow the delete button. */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", pr: { xs: 6, sm: 0 } }}>
          <SaveStatus state={save.state} savedAt={author.updatedAt} onRetry={save.retry} />
          <Tooltip title="Delete this author">
            <IconButton
              aria-label="Delete"
              size="small"
              color="error"
              onClick={() =>
                confirmAction(
                  `Permanently delete the author "${byline}"?${
                    credited.length
                      ? ` ${credited.length === 1 ? "1 tome" : `${credited.length} tomes`} will no longer credit an author.`
                      : ""
                  } This cannot be undone.`,
                  async () => {
                    await store.deleteAuthor(authorId);
                    navigate("/authors");
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

      <Stack direction={{ xs: "column", sm: "row" }} spacing={3} sx={{ alignItems: "flex-start" }}>
        {/* A portrait, shown whole like the tome's cover rather than cropped. */}
        <ImagePicker
          image={author.image}
          label={byline}
          alt={`${byline} photo`}
          onChange={(image?: ImageSource) => void patch({ image })}
          sx={{ width: 180, height: 220, flexShrink: 0 }}
          imageSx={{ objectFit: "contain", bgcolor: "transparent" }}
        />
        <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
          <Typography
            variant="overline"
            color="primary"
            sx={{ fontWeight: 800, letterSpacing: "0.12em" }}
          >
            AUTHOR PROFILE
          </Typography>
          <Typography variant="subtitle2" sx={{ mt: 1 }}>
            Name
          </Typography>
          <InlineTextField
            value={author.name}
            placeholder="Name"
            ariaLabel="Name"
            save={(name) => patch({ name })}
            onSaveState={handleSaveState}
            onFocus={() => setActive(null)}
            sx={{ fontSize: "1.7rem", fontWeight: 700, lineHeight: 1.2 }}
          />
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Pseudonym
          </Typography>
          <InlineTextField
            value={author.pseudonym ?? ""}
            placeholder="Add a pen name…"
            ariaLabel="Pseudonym"
            save={(pseudonym) => patch({ pseudonym })}
            onSaveState={handleSaveState}
            onFocus={() => setActive(null)}
            sx={{ fontSize: "1.3rem", lineHeight: 1.3 }}
          />
          {/* The rule the title page follows, said where the fields that feed
              it are — so leaving the pen name blank reads as a choice. */}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Title pages read “{byline}”.
            {author.pseudonym ? "" : " Add a pen name to publish under a different name."}
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ mt: 4 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          About the author
        </Typography>
        <ProseField
          value={edit ?? author.description}
          active={active !== null}
          caretPoint={active?.point ?? null}
          face={face}
          placeholder="Click to write the bio that goes with this name…"
          editorKey={`${authorId}:description`}
          save={(description) => patch({ description })}
          onActivate={(point) => setActive({ point })}
          onEdit={setEdit}
          onSaveState={handleSaveState}
          flushRef={flushRef}
        />
      </Box>

      <Divider sx={{ my: 3 }} />
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Credited on
      </Typography>
      {credited.length ? (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          {credited.map((tome) => (
            <Chip
              key={tome.id}
              icon={<MenuBookOutlinedIcon fontSize="small" />}
              label={tome.title}
              variant="outlined"
              onClick={() => navigate(`/tomes/${tome.id}/dashboard`)}
            />
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No tome credits this author yet. Choose it under the title on a tome’s
          overview.
        </Typography>
      )}
    </Container>
  );
}
