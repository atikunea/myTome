import { useRef, useState, type ChangeEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  Container,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { backupFileName, parseBackup, store } from "../services/store";
import type { BackupFile, BackupSummary, RestoreMode } from "../services/store";
import { useTomes } from "../context/TomesContext";
import { useConfirm } from "../context/ConfirmContext";
import { DriveSyncCard } from "../components/DriveSyncCard";
import { RestoreDialog } from "../components/RestoreDialog";

/**
 * Backup and restore, for the whole library or one tome at a time.
 *
 * This page is the transport half of `services/backup.ts`: turning a
 * `BackupFile` into a download and a chosen file back into text is the only
 * part that needs the DOM, so it is the only part that lives here. When Google
 * Drive lands it becomes a second transport under "Where backups go" and reads
 * and writes the same file, rather than a second format.
 */
export function BackupPage() {
  const tomes = useTomes();
  const confirmAction = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{
    file: BackupFile;
    name: string;
    summary: BackupSummary;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const download = (file: BackupFile) => {
    const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = backupFileName(file);
    link.click();
    URL.revokeObjectURL(url);
  };

  const run = async (what: () => Promise<void>) => {
    setError("");
    setNotice("");
    try {
      await what();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    }
  };

  const exportAll = () =>
    run(async () => {
      const file = await store.exportBackup();
      download(file);
      setNotice(
        `Saved ${file.tomes.length === 1 ? "1 tome" : `${file.tomes.length} tomes`} to ${backupFileName(file)}.`,
      );
    });

  const exportOne = (tomeId: string) =>
    run(async () => {
      const file = await store.exportTomeBackup(tomeId);
      download(file);
      setNotice(`Saved ${backupFileName(file)}.`);
    });

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    // Clearing the input is what lets the same file be picked twice in a row —
    // without it a second pick of the same path fires no change event.
    event.target.value = "";
    if (!chosen) return;
    void run(async () => {
      const file = parseBackup(await chosen.text());
      setPicked({ file, name: chosen.name, summary: await store.summarizeBackup(file) });
    });
  };

  const restore = async (mode: RestoreMode) => {
    if (!picked) return;
    setPending(true);
    setError("");
    try {
      const result = await store.restoreBackup(picked.file, mode);
      setPicked(null);
      setNotice(
        mode === "replace"
          ? `Restored ${result.added === 1 ? "1 tome" : `${result.added} tomes`} from ${picked.name}.`
          : `Merged ${picked.name}: ${result.added} added, ${result.replaced} updated, ${result.kept} left alone.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The restore did not finish.");
    } finally {
      setPending(false);
    }
  };

  const onRestore = (mode: RestoreMode) => {
    if (mode !== "replace") return void restore(mode);
    // Replacing wipes the library, so it goes through the app-wide confirm like
    // every other destructive action.
    confirmAction(
      `This deletes ${tomes.length === 1 ? "the tome" : `all ${tomes.length} tomes`} in this browser and replaces ${tomes.length === 1 ? "it" : "them"} with the ${picked?.summary.tomes.length ?? 0} in the backup file. This cannot be undone.`,
      () => restore("replace"),
    );
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3.5, sm: 6 } }}>
      <Button
        component={RouterLink}
        to="/tomes"
        size="small"
        startIcon={<ArrowBackIcon fontSize="small" />}
        sx={{ color: "text.secondary", fontWeight: 500, px: 0 }}
      >
        Library
      </Button>
      <Typography variant="h1" sx={{ fontSize: { xs: "2rem", sm: "3rem" }, mt: 1 }}>
        Backup &amp; restore
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.25, maxWidth: 620 }}>
        myTome keeps your writing inside this browser and nowhere else. A backup
        file is the copy that survives a cleared browser, a new machine, or a
        change of mind — keep one somewhere safe.
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mt: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert severity="success" sx={{ mt: 3 }} onClose={() => setNotice("")}>
          {notice}
        </Alert>
      ) : null}

      <Stack spacing={2.5} sx={{ mt: 3.5 }}>
        <Card variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="h2" sx={{ fontSize: "1.35rem", mb: 0.75 }}>
            Back up everything
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Every tome in this browser — elements, plots, beats and prose — in one
            file.
          </Typography>
          <Button
            startIcon={<DownloadIcon />}
            onClick={exportAll}
            disabled={!tomes.length}
          >
            Download backup
          </Button>
          {!tomes.length ? (
            <Typography color="text.secondary" sx={{ mt: 1.5 }}>
              There is nothing to back up yet.
            </Typography>
          ) : null}
        </Card>

        <Card variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="h2" sx={{ fontSize: "1.35rem", mb: 0.75 }}>
            Restore from a file
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Open a backup made here or in another browser. You choose whether to
            merge it with what you have or replace everything.
          </Typography>
          <Button
            startIcon={<UploadFileIcon />}
            onClick={() => fileInput.current?.click()}
          >
            Choose backup file…
          </Button>
          <Box
            component="input"
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={choose}
            sx={{ display: "none" }}
          />
        </Card>

        <Card variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="h2" sx={{ fontSize: "1.35rem", mb: 0.75 }}>
            One tome at a time
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            A single-tome file restores the same way, so this is also how you hand
            one book to another browser without carrying the rest.
          </Typography>
          {tomes.length ? (
            <Stack divider={<Divider />}>
              {tomes.map((tome) => (
                <Stack
                  key={tome.id}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  sx={{
                    alignItems: { xs: "flex-start", sm: "center" },
                    justifyContent: "space-between",
                    py: 1.25,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>{tome.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Last changed {new Date(tome.updatedAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    startIcon={<DownloadIcon fontSize="small" />}
                    onClick={() => exportOne(tome.id)}
                  >
                    Export
                  </Button>
                </Stack>
              ))}
            </Stack>
          ) : (
            <Typography color="text.secondary">No tomes yet.</Typography>
          )}
        </Card>

        <DriveSyncCard />
      </Stack>

      {picked ? (
        <RestoreDialog
          summary={picked.summary}
          fileName={picked.name}
          pending={pending}
          error={error}
          onCancel={() => {
            setPicked(null);
            setError("");
          }}
          onRestore={onRestore}
        />
      ) : null}
    </Container>
  );
}
