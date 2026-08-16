import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Grid,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import type { FieldDefinition } from "../models/ElementType";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useConfirm } from "../context/ConfirmContext";
import { FieldDefinitionsEditor } from "../components/FieldDefinitionsEditor";
import { ElementTypeIcon, elementTypeIconOptions } from "../components/ElementTypeIcon";

export function ElementTypesPage({ creating = false }: { creating?: boolean }) {
  const { configId } = useParams<{ configId?: string }>();
  const { tome, types } = useTomeWorkspace();
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [icon, setIcon] = useState<string | undefined>(undefined);

  const editing = configId ? types.find((type) => type.id === configId) : undefined;

  useEffect(() => {
    setFields(editing?.fieldDefinitions ?? []);
    setIcon(editing?.icon);
    setError("");
    // Reset only when navigating to a different editor instance, not on every live data update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId, creating]);

  if (!tome) return null;
  const goTo = (path = "") => navigate(`/tomes/${tome.id}/elements/settings${path}`);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await store.saveType({
        id: editing?.id,
        tomeId: tome.id,
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? ""),
        icon,
        fieldDefinitions: fields,
      });
      goTo();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save element type.");
    }
  };

  const handleFieldRemove = async (id: string) => {
    const persisted = editing?.fieldDefinitions.find((definition) => definition.id === id);
    if (!editing || !persisted) {
      setFields((prev) => prev.filter((field) => field.id !== id));
      return;
    }
    const count = await store.countField(editing.id, id);
    confirmAction(
      `Remove "${persisted.name}"? ${count} stored value${count === 1 ? "" : "s"} will be permanently deleted.`,
      async () => {
        await store.deleteField(editing, id);
        setFields((prev) => prev.filter((field) => field.id !== id));
      },
    );
  };

  if (creating || editing) {
    return (
      <Card variant="outlined" sx={{ maxWidth: 750 }}>
        <CardContent sx={{ p: 3.25 }}>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 3 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <ElementTypeIcon icon={icon} color="primary" />
                <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
                  {editing ? `Configure ${editing.name}` : "New element type"}
                </Typography>
              </Stack>
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
                minRows={2}
                defaultValue={editing?.description ?? ""}
              />
              <Stack spacing={1}>
                <Typography variant="subtitle2">Icon</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  <IconButton
                    aria-label="No icon"
                    title="No icon"
                    onClick={() => setIcon(undefined)}
                    sx={{
                      border: 1,
                      borderColor: icon === undefined ? "primary.main" : "divider",
                      bgcolor: icon === undefined ? "action.selected" : "transparent",
                    }}
                  >
                    <ElementTypeIcon fontSize="small" />
                  </IconButton>
                  {elementTypeIconOptions.map(({ key, label, Icon }) => (
                    <IconButton
                      key={key}
                      aria-label={label}
                      title={label}
                      onClick={() => setIcon(key)}
                      sx={{
                        border: 1,
                        borderColor: icon === key ? "primary.main" : "divider",
                        bgcolor: icon === key ? "action.selected" : "transparent",
                      }}
                    >
                      <Icon fontSize="small" />
                    </IconButton>
                  ))}
                </Box>
              </Stack>
              <FieldDefinitionsEditor fields={fields} onChange={setFields} onRemove={handleFieldRemove} />
            </Stack>
            <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 3 }}>
              <Button type="submit" variant="contained">
                Save type
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 3.25 }}>
        <Box>
          <Typography variant="overline" color="primary" sx={{ fontWeight: 800, letterSpacing: "0.12em" }}>
            ELEMENT CONFIGURATION
          </Typography>
          <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
            Element types
          </Typography>
          <Typography color="text.secondary">Define the building blocks for this tome.</Typography>
        </Box>
        <Button startIcon={<AddIcon />} onClick={() => goTo("/new")}>
          New type
        </Button>
      </Stack>
      <Grid container spacing={1.9}>
        {types.map((type) => (
          <Grid key={type.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <ElementTypeIcon icon={type.icon} color="primary" fontSize="small" />
                <Typography variant="h3" sx={{ fontSize: "1.15rem" }}>
                  {type.name}
                </Typography>
              </Stack>
              <Typography color="text.secondary" sx={{ my: 1 }}>
                {type.description || "No description"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {type.fieldDefinitions.length} custom field{type.fieldDefinitions.length === 1 ? "" : "s"}
              </Typography>
              <CardActions sx={{ px: 0, pb: 0, pt: 1.75, gap: 0.5 }}>
                <Button size="small" onClick={() => goTo(`/${type.id}`)}>
                  Configure
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={async () => {
                    const count = await store.countElements(type.id);
                    confirmAction(
                      `Permanently delete "${type.name}" and all ${count} of its elements? This cannot be undone.`,
                      async () => {
                        await store.deleteType(type);
                        goTo();
                      },
                    );
                  }}
                >
                  Delete
                </Button>
              </CardActions>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
