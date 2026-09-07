import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import ViewListIcon from "@mui/icons-material/ViewList";
import type { Element } from "../models/Element";
import type { FieldDefinition } from "../models/ElementType";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useObservable } from "../hooks/useObservable";
import { CoverThumbnail } from "../components/CoverThumbnail";
import { EmptyState } from "../components/EmptyState";
import { ElementTypeIcon } from "../components/ElementTypeIcon";

/**
 * One element type's elements. Editing lives on `ElementPage` now — this page
 * finds, opens and creates, and nothing here writes or destroys a row.
 *
 * The search box filters on `Element.searchText`, the mirror `saveElement`
 * derives: it spans the description and every custom field, prose ones
 * flattened, so a query matches the words an author wrote rather than the JSON
 * a document is stored as.
 */
export function ElementListPage() {
  const { typeId } = useParams<{ typeId: string }>();
  const { tome, types } = useTomeWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [listView, setListView] = useState(false);

  const type = types.find((t) => t.id === typeId);
  const elements =
    useObservable<Element[]>(
      (cb) => store.observeElements(tome!.id, typeId!, cb),
      [tome?.id, typeId],
    ) ?? [];

  if (!tome) return null;
  if (!type)
    return (
      <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
        Element type not found
      </Typography>
    );

  const open = (elementId: string) =>
    navigate(`/tomes/${tome.id}/elements/${type.id}/${elementId}`);

  const items = [...elements]
    .filter((item) => item.searchText.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt),
    );

  /**
   * The row is created here, at the click, and the page opens on its real id —
   * never by a `/new` route that creates on mount, which under `StrictMode`
   * fires twice and leaves an orphan behind every time. An untouched draft is
   * swept when the page unmounts.
   */
  const create = async () => {
    const draft = await store.createDraftElement(tome.id, type.id);
    open(draft.id);
  };

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", mb: 3.25 }}
      >
        <Box>
          <Typography
            variant="overline"
            color="primary"
            sx={{ fontWeight: 800, letterSpacing: "0.12em" }}
          >
            {type.name.toUpperCase()}S
          </Typography>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <ElementTypeIcon icon={type.icon} color="primary" sx={{ fontSize: "1.7rem" }} />
            <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
              {type.name}s
            </Typography>
          </Stack>
        </Box>
        <Button startIcon={<AddIcon />} onClick={() => void create()}>
          New {type.name}
        </Button>
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", mb: 3.5 }}>
        <TextField
          placeholder={`Search ${type.name.toLowerCase()}s…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          size="small"
          sx={{ flex: 1, minWidth: 180 }}
        />
        <TextField
          select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          size="small"
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="recent">Recently updated</MenuItem>
          <MenuItem value="name">Name</MenuItem>
        </TextField>
        <IconButton
          aria-label={listView ? "Switch to grid view" : "Switch to list view"}
          onClick={() => setListView((v) => !v)}
        >
          {listView ? <ViewModuleIcon /> : <ViewListIcon />}
        </IconButton>
      </Stack>

      {items.length ? (
        listView ? (
          <Stack spacing={1.25}>
            {items.map((item) => (
              <ElementListCard
                key={item.id}
                item={item}
                type={type}
                onOpen={() => open(item.id)}
              />
            ))}
          </Stack>
        ) : (
          <Grid container spacing={2.5}>
            {items.map((item) => (
              <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <ElementCard
                  item={item}
                  type={type}
                  onOpen={() => open(item.id)}
                />
              </Grid>
            ))}
          </Grid>
        )
      ) : (
        <EmptyState
          title={`No ${type.name.toLowerCase()}s yet`}
          body="Create one to begin filling out this world."
        />
      )}
    </Box>
  );
}

type CardType = { fieldDefinitions: FieldDefinition[] };

function attributeSnippets(item: Element, type: CardType) {
  return type.fieldDefinitions
    // A prose field's value is a stored document; a card has room for a line,
    // and printing one here would print JSON. They are read on the element page.
    .filter((field) => field.kind !== "prose" && item.attributes[field.id])
    .slice(0, 2);
}

/**
 * The card's summary line. `descriptionText` is the mirror `saveElement`
 * derives, so a card never parses a Lexical document to show two lines of it.
 */
function Summary({ item, type }: { item: Element; type: CardType }) {
  return (
    <>
      <Typography variant="h3" sx={{ fontSize: "1.15rem", mb: 0.75 }}>
        {item.name}
      </Typography>
      <Typography
        color="text.secondary"
        sx={{
          fontSize: "0.92rem",
          lineHeight: 1.45,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {item.descriptionText || "No description yet."}
      </Typography>
      {attributeSnippets(item, type).map((field) => (
        <Typography key={field.id} variant="body2" color="text.secondary">
          {field.name}: {item.attributes[field.id]}
        </Typography>
      ))}
    </>
  );
}

/**
 * A card is a way in and nothing else — the whole surface opens the element,
 * and there are no other controls on it.
 *
 * **Delete lives on the element page, not here.** A grid of cards each carrying
 * a delete button is a column of invitations beside the thing they destroy, and
 * the confirm dialog is the only thing standing between a mis-aimed click and
 * an author's character. Deleting from the page you are already reading costs
 * one extra click and puts the element in front of you first.
 */
function ElementCard({
  item,
  type,
  onOpen,
}: {
  item: Element;
  type: CardType;
  onOpen: () => void;
}) {
  return (
    <Card variant="outlined">
      <CardActionArea onClick={onOpen}>
        <CoverThumbnail image={item.image} label={item.name} alt={item.name} sx={{ height: 142 }} />
        <Box sx={{ p: 2.1 }}>
          <Summary item={item} type={type} />
        </Box>
      </CardActionArea>
    </Card>
  );
}

function ElementListCard({
  item,
  type,
  onOpen,
}: {
  item: Element;
  type: CardType;
  onOpen: () => void;
}) {
  return (
    <Card variant="outlined">
      <CardActionArea
        onClick={onOpen}
        sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: "stretch" }}
      >
        <CoverThumbnail
          image={item.image}
          label={item.name}
          alt={item.name}
          sx={{ width: { xs: "100%", sm: 110 }, height: { xs: 120, sm: "auto" }, flexShrink: 0 }}
        />
        <Box sx={{ p: 2.1, flex: 1 }}>
          <Summary item={item} type={type} />
        </Box>
      </CardActionArea>
    </Card>
  );
}
