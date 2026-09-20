import { useState } from "react";
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
import { transport } from "#fileTransport";
import type { FileFilter } from "../services/fileTransport";
import { backupFileName, parseBackup, store } from "../services/store";
import type { BackupFile, BackupSummary, RestoreMode } from "../services/store";
import { useTomes } from "../context/TomesContext";
import { useConfirm } from "../context/ConfirmContext";
import { DriveSyncCard } from "../components/DriveSyncCard";
import { RestoreDialog } from "../components/RestoreDialog";

/**
 * Backup and restore, for the whole library or one tome at a time.
 *
 * This page turns a `BackupFile` into a saved file and a chosen file back into
 * text. *How* either happens is no longer its business — `#fileTransport` is a
 * browser download and a hidden input on the web, and real dialogs on the
 * desktop, and this page cannot tell which it has. Google Drive under "Where
 * backups go" is a third transport for the same file, never a second format.
 */
const BACKUP_FILTERS: FileFilter[] = [{ name: "myTome backup", extensions: ["json"] }];

export function BackupPage() {
  const tomes = useTomes();
  const confirmAction = useConfirm();
  const [picked, setPicked] = useState<{
    file: BackupFile;
    name: string;
    summary: BackupSummary;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const download = (file: BackupFile) =>
    transport.save({
      suggestedName: backupFileName(file),
      filters: BACKUP_FILTERS,
      data: new Blob([JSON.stringify(file)], { type: "application/json" }),
    });

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
      const { saved, name } = await download(file);
      // A cancelled dialog is an ordinary outcome, and says nothing. Only the
      // desktop build can tell; the web build always reports a save.
      if (!saved) return;
      setNotice(
        `Saved ${file.tomes.length === 1 ? "1 tome" : `${file.tomes.length} tomes`} to ${name ?? backupFileName(file)}.`,
      );
    });

  const exportOne = (tomeId: string) =>
    run(async () => {
      const file = await store.exportTomeBackup(tomeId);
      const { saved, name } = await download(file);
      if (!saved) return;
      setNotice(`Saved ${name ?? backupFileName(file)}.`);
    });

  // No input element to clear between picks: the transport builds one per call
  // on the web and throws it away, so picking the same file twice in a row
  // works without the value-reset that used to be needed here.
  const choose = () =>
    void run(async () => {
      const chosen = await transport.open({
        accept: "application/json,.json",
        filters: BACKUP_FILTERS,
      });
      if (!chosen) return;
      const file = parseBackup(await chosen.blob.text());
      setPicked({ file, name: chosen.name, summary: await store.summarizeBackup(file) });
    });

  const restore = async (mode: RestoreMode) => {
    if (!picked) return;
    setPending(true);
    setError("");
    try {
      const result = await store.restoreBackup(picked.file, mode);
      const profiles = result.authors.added + result.authors.replaced;
      setPicked(null);
      setNotice(
        (mode === "replace"
          ? `Restored ${result.added === 1 ? "1 tome" : `${result.added} tomes`} from ${picked.name}.`
          : `Merged ${picked.name}: ${result.added} added, ${result.replaced} updated, ${result.kept} left alone.`) +
          (profiles
            ? ` ${profiles === 1 ? "1 author profile" : `${profiles} author profiles`} came in with it.`
            : ""),
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
            Every tome in this browser — elements, plots, beats and prose — and
            every author profile, in one file.
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
            onClick={choose}
          >
            Choose backup file…
          </Button>
        </Card>

        <Card variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="h2" sx={{ fontSize: "1.35rem", mb: 0.75 }}>
            One tome at a time
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            A single-tome file restores the same way, so this is also how you hand
            one book to another browser without carrying the rest. It brings the
            book’s author profile with it.
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
