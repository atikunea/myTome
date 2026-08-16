import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActions,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import UploadIcon from "@mui/icons-material/UploadFile";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import ViewListIcon from "@mui/icons-material/ViewList";
import type { Element } from "../models/Element";
import type { Relationship } from "../models/Relationship";
import { imageFrom, store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useConfirm } from "../context/ConfirmContext";
import { useObservable } from "../hooks/useObservable";
import { CoverThumbnail } from "../components/CoverThumbnail";
import { EmptyState } from "../components/EmptyState";

interface RelationshipRow {
  key: string;
  id?: string;
  otherElementId: string;
  otherElementTypeId: string;
  label: string;
}

export function ElementListPage({ creating = false }: { creating?: boolean }) {
  const { typeId, elementId } = useParams<{ typeId: string; elementId?: string }>();
  const { tome, types } = useTomeWorkspace();
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [listView, setListView] = useState(false);
  const [error, setError] = useState("");

  const type = types.find((t) => t.id === typeId);
  const elements =
    useObservable<Element[]>(
      (cb) => store.observeElements(tome!.id, typeId!, cb),
      [tome?.id, typeId],
    ) ?? [];
  const tomeElements =
    useObservable<Element[]>(
      (cb) => store.observeTomeElements(tome!.id, cb),
      [tome?.id],
    ) ?? [];
  const relationshipsRaw = useObservable<Relationship[]>(
    (cb) => store.observeElementRelationships(tome!.id, elementId ?? "", cb),
    [tome?.id, elementId],
  );
  const [relationshipRows, setRelationshipRows] = useState<RelationshipRow[]>([]);

  useEffect(() => {
    setError("");
  }, [elementId, creating]);

  useEffect(() => {
    if (creating) {
      setRelationshipRows([]);
    } else if (elementId && relationshipsRaw) {
      setRelationshipRows(
        relationshipsRaw.map((r) => ({
          key: r.id,
          id: r.id,
          otherElementId: r.fromElementId === elementId ? r.toElementId : r.fromElementId,
          otherElementTypeId:
            r.fromElementId === elementId ? r.toElementTypeId : r.fromElementTypeId,
          label: r.label,
        })),
      );
    }
  }, [elementId, creating, relationshipsRaw]);

  if (!tome) return null;
  if (!type)
    return (
      <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
        Element type not found
      </Typography>
    );

  const goTo = (path = "") => navigate(`/tomes/${tome.id}/elements/${type.id}${path}`);
  const editing = elementId ? elements.find((item) => item.id === elementId) : undefined;
  const targetOptions = tomeElements
    .filter((item) => item.id !== elementId)
    .map((item) => ({
      id: item.id,
      name: item.name,
      elementTypeId: item.elementTypeId,
      typeName: types.find((t) => t.id === item.elementTypeId)?.name ?? "",
    }));

  const items = [...elements]
    .filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const attributes: Record<string, string> = {};
    type.fieldDefinitions.forEach((field) => {
      attributes[field.id] = String(data.get(`attr-${field.id}`) ?? "");
    });
    const filledRelationships = relationshipRows.filter(
      (row) => row.otherElementId || row.label.trim(),
    );
    try {
      for (const row of filledRelationships) {
        if (!row.otherElementId || !row.label.trim())
          throw new Error(
            "Every relationship needs both a related element and a description.",
          );
      }
      const image = await imageFrom(
        String(data.get("imageUrl") ?? ""),
        (form.elements.namedItem("imageFile") as HTMLInputElement).files?.[0],
      );
      const saved = await store.saveElement({
        id: editing?.id,
        tomeId: tome.id,
        elementTypeId: type.id,
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? ""),
        attributes,
        image: image ?? editing?.image,
      });
      await store.saveElementRelationships(
        saved,
        filledRelationships.map((row) => ({
          id: row.id,
          otherElementId: row.otherElementId,
          otherElementTypeId: row.otherElementTypeId,
          label: row.label,
        })),
      );
      goTo();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save element.");
    }
  };

  if (creating || editing) {
    return (
      <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 750 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 3 }}>
          <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
            {editing ? `Edit ${editing.name}` : `New ${type.name}`}
          </Typography>
          <IconButton aria-label="Cancel" size="small" onClick={() => goTo()}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Stack spacing={2.5}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField name="name" label="Name" required fullWidth defaultValue={editing?.name ?? ""} />
          <TextField
            name="description"
            label="Description"
            fullWidth
            multiline
            minRows={3}
            defaultValue={editing?.description ?? ""}
          />
          {type.fieldDefinitions.map((field) =>
            field.kind === "select" ? (
              <TextField
                key={field.id}
                name={`attr-${field.id}`}
                label={`${field.name}${field.required ? " *" : ""}`}
                select
                fullWidth
                defaultValue={editing?.attributes[field.id] ?? ""}
              >
                <MenuItem value="">Select…</MenuItem>
                {(field.options ?? []).map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                key={field.id}
                name={`attr-${field.id}`}
                label={`${field.name}${field.required ? " *" : ""}`}
                fullWidth
                defaultValue={editing?.attributes[field.id] ?? ""}
              />
            ),
          )}
          <Stack spacing={1.25}>
            <Typography variant="subtitle2">Relationships</Typography>
            {relationshipRows.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No relationships yet.
              </Typography>
            ) : null}
            {relationshipRows.map((row) => (
              <RelationshipRowEditor
                key={row.key}
                row={row}
                tomeId={tome.id}
                fromTypeId={type.id}
                targetOptions={targetOptions}
                onChange={(next) =>
                  setRelationshipRows((rows) =>
                    rows.map((r) => (r.key === row.key ? next : r)),
                  )
                }
                onRemove={() =>
                  setRelationshipRows((rows) => rows.filter((r) => r.key !== row.key))
                }
              />
            ))}
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() =>
                setRelationshipRows((rows) => [
                  ...rows,
                  { key: crypto.randomUUID(), otherElementId: "", otherElementTypeId: "", label: "" },
                ])
              }
              sx={{ alignSelf: "flex-start" }}
            >
              Add relationship
            </Button>
          </Stack>
          <TextField name="imageUrl" label="Image URL" placeholder="https://…" fullWidth />
          <Button component="label" variant="outlined" startIcon={<UploadIcon />} sx={{ alignSelf: "flex-start" }}>
            Upload an image
            <input type="file" name="imageFile" accept="image/*" hidden />
          </Button>
        </Stack>
        <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 3 }}>
          <Button type="submit" variant="contained">
            Save {type.name}
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 3.25 }}>
        <Box>
          <Typography variant="overline" color="primary" sx={{ fontWeight: 800, letterSpacing: "0.12em" }}>
            {type.name.toUpperCase()}S
          </Typography>
          <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
            {type.name}s
          </Typography>
        </Box>
        <Button startIcon={<AddIcon />} onClick={() => goTo("/new")}>
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
        <TextField select value={sort} onChange={(e) => setSort(e.target.value)} size="small" sx={{ minWidth: 190 }}>
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
              <ElementListCard key={item.id} item={item} type={type} onEdit={() => goTo(`/${item.id}/edit`)} onDelete={() => confirmAction(
                `Permanently delete "${item.name}"? This cannot be undone.`,
                async () => {
                  await store.deleteElement(item.id);
                },
              )} />
            ))}
          </Stack>
        ) : (
          <Grid container spacing={2.5}>
            {items.map((item) => (
              <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <ElementCard item={item} type={type} onEdit={() => goTo(`/${item.id}/edit`)} onDelete={() => confirmAction(
                  `Permanently delete "${item.name}"? This cannot be undone.`,
                  async () => {
                    await store.deleteElement(item.id);
                  },
                )} />
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

interface TargetOption {
  id: string;
  name: string;
  elementTypeId: string;
  typeName: string;
}

function RelationshipRowEditor({
  row,
  tomeId,
  fromTypeId,
  targetOptions,
  onChange,
  onRemove,
}: {
  row: RelationshipRow;
  tomeId: string;
  fromTypeId: string;
  targetOptions: TargetOption[];
  onChange: (row: RelationshipRow) => void;
  onRemove: () => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const target = targetOptions.find((option) => option.id === row.otherElementId) ?? null;

  useEffect(() => {
    if (!row.otherElementTypeId) {
      setSuggestions([]);
      return;
    }
    let active = true;
    store
      .suggestRelationshipLabels(tomeId, fromTypeId, row.otherElementTypeId)
      .then((labels) => {
        if (active) setSuggestions(labels);
      });
    return () => {
      active = false;
    };
  }, [tomeId, fromTypeId, row.otherElementTypeId]);

  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <Autocomplete
        options={targetOptions}
        value={target}
        getOptionLabel={(option) => `${option.name} (${option.typeName})`}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        onChange={(_, value) =>
          onChange({
            ...row,
            otherElementId: value?.id ?? "",
            otherElementTypeId: value?.elementTypeId ?? "",
          })
        }
        renderInput={(params) => <TextField {...params} label="Related to" size="small" />}
        sx={{ flex: 1, minWidth: 200 }}
      />
      <Autocomplete
        freeSolo
        options={suggestions}
        inputValue={row.label}
        onInputChange={(_, value) => onChange({ ...row, label: value })}
        renderInput={(params) => <TextField {...params} label="Relationship" size="small" />}
        sx={{ flex: 1, minWidth: 200 }}
      />
      <IconButton aria-label="Remove relationship" size="small" onClick={onRemove} sx={{ mt: 0.5 }}>
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

function attributeSnippets(item: Element, type: { fieldDefinitions: { id: string; name: string }[] }) {
  return type.fieldDefinitions.filter((field) => item.attributes[field.id]).slice(0, 2);
}

function ElementCard({
  item,
  type,
  onEdit,
  onDelete,
}: {
  item: Element;
  type: { fieldDefinitions: { id: string; name: string }[] };
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card variant="outlined">
      <CoverThumbnail image={item.image} label={item.name} alt={item.name} sx={{ height: 142 }} />
      <Box sx={{ p: 2.1 }}>
        <Typography variant="h3" sx={{ fontSize: "1.15rem", mb: 0.75 }}>
          {item.name}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: "0.92rem", lineHeight: 1.45 }}>
          {item.description || "No description yet."}
        </Typography>
        {attributeSnippets(item, type).map((field) => (
          <Typography key={field.id} variant="body2" color="text.secondary">
            {field.name}: {item.attributes[field.id]}
          </Typography>
        ))}
      </Box>
      <CardActions sx={{ px: 2.1, pb: 2.1, pt: 0, gap: 0.5 }}>
        <Button size="small" onClick={onEdit}>
          Edit
        </Button>
        <Button size="small" color="error" onClick={onDelete}>
          Delete
        </Button>
      </CardActions>
    </Card>
  );
}

function ElementListCard({
  item,
  type,
  onEdit,
  onDelete,
}: {
  item: Element;
  type: { fieldDefinitions: { id: string; name: string }[] };
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card variant="outlined" sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" } }}>
      <CoverThumbnail
        image={item.image}
        label={item.name}
        alt={item.name}
        sx={{ width: { xs: "100%", sm: 110 }, height: { xs: 120, sm: "auto" } }}
      />
      <Box sx={{ p: 2.1, flex: 1 }}>
        <Typography variant="h3" sx={{ fontSize: "1.15rem", mb: 0.75 }}>
          {item.name}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: "0.92rem", lineHeight: 1.45 }}>
          {item.description || "No description yet."}
        </Typography>
        {attributeSnippets(item, type).map((field) => (
          <Typography key={field.id} variant="body2" color="text.secondary">
            {field.name}: {item.attributes[field.id]}
          </Typography>
        ))}
        <CardActions sx={{ px: 0, pb: 0, pt: 1.5, gap: 0.5 }}>
          <Button size="small" onClick={onEdit}>
            Edit
          </Button>
          <Button size="small" color="error" onClick={onDelete}>
            Delete
          </Button>
        </CardActions>
      </Box>
    </Card>
  );
}
