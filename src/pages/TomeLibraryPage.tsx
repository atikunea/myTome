import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardActions,
  Chip,
  Container,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import type { Tome, TomeStatus } from "../models/Tome";
import { store } from "../services/store";
import { useTomes } from "../context/TomesContext";
import { useConfirm } from "../context/ConfirmContext";
import { CoverThumbnail } from "../components/CoverThumbnail";
import { EmptyState } from "../components/EmptyState";
import { TomeFormDialog } from "../components/TomeFormDialog";

const statusChipColor: Record<TomeStatus, "warning" | "success" | "default"> = {
  Draft: "warning",
  Completed: "success",
  Archived: "default",
};

export function TomeLibraryPage({ creating = false }: { creating?: boolean }) {
  const tomes = useTomes();
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");

  const filtered = tomes.filter(
    (tome) =>
      (status === "All" || tome.status === status) &&
      `${tome.title} ${tome.subtitle ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3.5, sm: 6 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          mb: 4.5,
        }}
      >
        <Box>
          <Typography variant="overline" color="primary" sx={{ fontWeight: 800, letterSpacing: "0.12em" }}>
            MY TOME
          </Typography>
          <Typography variant="h1" sx={{ fontSize: { xs: "2rem", sm: "3.4rem" }, letterSpacing: "-0.05em" }}>
            Your story library
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1.25 }}>
            A quiet place to keep every world together.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Button
            variant="text"
            startIcon={<CloudDoneIcon />}
            onClick={() => navigate("/backup")}
          >
            Backup
          </Button>
          <Button startIcon={<AddIcon />} onClick={() => navigate("/tomes/new")}>
            New tome
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", mb: 3.5 }}>
        <TextField
          aria-label="Search tomes"
          placeholder="Search by title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          size="small"
          sx={{ flex: 1, minWidth: 180 }}
        />
        <TextField
          aria-label="Filter status"
          select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          size="small"
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="All">All</MenuItem>
          <MenuItem value="Draft">Draft</MenuItem>
          <MenuItem value="Completed">Completed</MenuItem>
          <MenuItem value="Archived">Archived</MenuItem>
        </TextField>
      </Stack>

      {filtered.length ? (
        <Grid container spacing={2.5}>
          {filtered.map((tome) => (
            <Grid key={tome.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <TomeCard
                tome={tome}
                onOpen={() => navigate(`/tomes/${tome.id}/dashboard`)}
                onEdit={() => navigate(`/tomes/${tome.id}/edit`)}
                onDelete={() =>
                  confirmAction(
                    `Permanently delete "${tome.title}" and everything in it? This cannot be undone.`,
                    async () => {
                      await store.deleteTome(tome.id);
                    },
                  )
                }
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <EmptyState title="No tomes found" body="Create a tome to start shaping a new story." />
      )}

      <TomeFormDialog open={creating} />
    </Container>
  );
}

function TomeCard({
  tome,
  onOpen,
  onEdit,
  onDelete,
}: {
  tome: Tome;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card variant="outlined">
      <CoverThumbnail image={tome.coverImage} label={tome.title} alt={`${tome.title} cover`} sx={{ height: 142 }} />
      <Box sx={{ p: 2.1 }}>
        <Chip size="small" label={tome.status} color={statusChipColor[tome.status]} />
        <Typography variant="h2" sx={{ fontSize: "1.35rem", my: 1.1 }}>
          {tome.title}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: "0.92rem", lineHeight: 1.45 }}>
          {tome.subtitle || tome.description || "No description yet."}
        </Typography>
      </Box>
      <CardActions sx={{ px: 2.1, pb: 2.1, pt: 0, gap: 0.5 }}>
        <Button size="small" onClick={onOpen}>
          Open
        </Button>
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
