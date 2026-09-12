import { useNavigate } from "react-router-dom";
import {
  Box,
  IconButton,
  ListItemIcon,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { Author } from "../models/Author";
import { authorByline } from "../models/Author";
import type { Tome } from "../models/Tome";
import { store } from "../services/store";
import { useObservable } from "../hooks/useObservable";

/** A value no profile id can take — `crypto.randomUUID()` never makes one. */
const NEW_AUTHOR = "new-author";

/**
 * "by J.D. Robb" under a tome's title: which profile the book is credited to.
 *
 * It reads as the line a title page has, which is what it decides, and it is a
 * plain select saving on change for the reason the status select is — at rest
 * it already looks like a value, so there is nothing to swap.
 *
 * "New author…" creates the profile *and* credits it in one write at the click
 * site, then opens its page: a profile, like an element, is never created by a
 * route. If the author walks away from that page without writing anything, its
 * sweep takes the blank profile and the credit with it.
 *
 * A credit naming a profile that is gone — a single-tome backup restored into a
 * browser that never saw its author — shows as uncredited rather than as an
 * empty select, and choosing again repairs it.
 */
export function AuthorPicker({
  tome,
  onChange,
}: {
  tome: Tome;
  onChange: (authorId: string) => void;
}) {
  const navigate = useNavigate();
  const authors = useObservable<Author[]>((cb) => store.observeAuthors(cb), []) ?? [];
  const current = authors.find((author) => author.id === tome.authorId);
  const value = current?.id ?? "";

  const choose = async (next: string) => {
    if (next !== NEW_AUTHOR) return onChange(next);
    const draft = await store.createDraftAuthor(tome.id);
    navigate(`/authors/${draft.id}`);
  };

  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <Typography color="text.secondary" sx={{ fontSize: "1.05rem" }}>
        by
      </Typography>
      <TextField
        select
        variant="standard"
        value={value}
        onChange={(event) => void choose(event.target.value)}
        slotProps={{
          htmlInput: { "aria-label": "Author" },
          input: { disableUnderline: true },
          select: {
            displayEmpty: true,
            renderValue: () =>
              current ? (
                authorByline(current)
              ) : (
                <Box component="span" sx={{ color: "text.secondary" }}>
                  Credit an author…
                </Box>
              ),
          },
        }}
        sx={{ "& .MuiInputBase-root": { fontSize: "1.05rem", fontWeight: 600 } }}
      >
        <MenuItem value="">
          <Typography color="text.secondary">No author</Typography>
        </MenuItem>
        {authors.map((author) => (
          <MenuItem key={author.id} value={author.id}>
            <Box>
              <Typography>{authorByline(author)}</Typography>
              {author.pseudonym ? (
                <Typography variant="caption" color="text.secondary">
                  Pen name of {author.name}
                </Typography>
              ) : null}
            </Box>
          </MenuItem>
        ))}
        {/* A rule drawn on the item rather than a `Divider` child: `Select`
            clones every child into an option, so a divider would be a blank,
            selectable row. */}
        <MenuItem value={NEW_AUTHOR} sx={{ borderTop: 1, borderColor: "divider" }}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          New author…
        </MenuItem>
      </TextField>
      {current ? (
        <Tooltip title="Open this author’s profile">
          <IconButton
            size="small"
            aria-label="Open author profile"
            onClick={() => navigate(`/authors/${current.id}`)}
          >
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
    </Stack>
  );
}
