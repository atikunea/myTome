import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOffIcon from "@mui/icons-material/FolderOff";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import {
  autoExportError,
  autoExportFolder,
  autoExportSettings,
  autoExportState,
  autoExportSupported,
  chooseAutoExportFolder,
  forgetAutoExportFolder,
  onAutoExport,
  runAutoExport,
  saveAutoExportSettings,
} from "../services/autoExport";
import type { AutoExportSettings } from "../services/autoExport";

/**
 * "Keep a copy in a folder" — the desktop build's third place a backup can go.
 *
 * **It renders nothing at all on the web**, which is the one way it differs
 * from `DriveSyncCard`. A web build without a client id still *could* have
 * Drive, so that card says so; a browser tab cannot be given a folder to write
 * to unattended at all, and describing a feature the platform will never have
 * is worse than silence. See `services/backupTransport.web.ts`.
 *
 * The card owns no scheduling. `useAutoExport` in `App.tsx` runs the clock,
 * `services/autoExport.ts` decides, and this subscribes so that an export
 * happening while the page is open is visible when it does.
 */

const INTERVALS = [
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 180, label: "Every 3 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Once a day" },
];

const KEEPS = [3, 5, 10, 20, 50];

export function AutoExportCard() {
  const [folder, setFolder] = useState<string>();
  const [settings, setSettings] = useState<AutoExportSettings>(() =>
    autoExportSupported ? autoExportSettings() : { everyMinutes: 30, keep: 10 },
  );
  const [state, setState] = useState(() => (autoExportSupported ? autoExportState() : {}));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const refresh = useCallback(() => {
    setState(autoExportState());
    setError(autoExportError() ?? "");
  }, []);

  // Only the shell knows where the folder is, so the answer arrives a tick
  // after mount. Everything else is already here.
  useEffect(() => {
    if (!autoExportSupported) return;
    let live = true;
    void autoExportFolder().then((chosen) => {
      if (live) setFolder(chosen);
    });
    refresh();
    // A scheduled export can land while this page is open; without this the
    // card would keep showing the time of the one before it.
    const stop = onAutoExport(() => {
      if (live) refresh();
    });
    return () => {
      live = false;
      stop();
    };
  }, [refresh]);

  if (!autoExportSupported) return null;

  const run = async (what: string, action: () => Promise<void>) => {
    setBusy(what);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The backup could not be written.");
    } finally {
      setBusy("");
      refresh();
    }
  };

  const choose = () =>
    run("choose", async () => {
      const chosen = await chooseAutoExportFolder();
      if (!chosen) return;
      setFolder(chosen);
      // Write one straight away. An author who has just pointed this at a
      // folder should see a file appear in it, not a promise about later.
      await runAutoExport({ force: true });
    });

  /**
   * Not a `confirmAction`, deliberately. That dialog's fixed button says
   * "Delete permanently", and stopping deletes nothing — every file already in
   * the folder stays. Putting a deletion confirm on a non-deletion would teach
   * the author to read that button as meaning less than it does.
   */
  const stop = () =>
    run("stop", async () => {
      await forgetAutoExportFolder();
      setFolder(undefined);
    });

  const change = (next: AutoExportSettings) => setSettings(saveAutoExportSettings(next));

  return (
    <Card variant="outlined" sx={{ p: 2.5 }}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h2" sx={{ fontSize: "1.35rem", mb: 0.75 }}>
            Keep a copy in a folder
          </Typography>
          <Typography color="text.secondary">
            myTome can write a full backup into a folder you choose, by itself,
            while you write. It is the same file as “Download backup” — so if
            that folder is inside Dropbox, iCloud or your own Drive, your work
            is somewhere else without myTome having to ask anyone’s permission.
          </Typography>
        </Box>
        <Chip
          size="small"
          color={folder ? "success" : "default"}
          label={folder ? "On" : "Off"}
        />
      </Stack>

      {folder ? (
        <>
          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
            <FolderIcon fontSize="small" sx={{ color: "text.secondary" }} />
            <Typography
              variant="body2"
              sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
            >
              {folder}
            </Typography>
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
            <TextField
              select
              size="small"
              label="How often"
              value={settings.everyMinutes}
              onChange={(event) =>
                change({ ...settings, everyMinutes: Number(event.target.value) })
              }
              sx={{ minWidth: 200 }}
            >
              {INTERVALS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Files to keep"
              value={settings.keep}
              onChange={(event) => change({ ...settings, keep: Number(event.target.value) })}
              sx={{ minWidth: 160 }}
            >
              {KEEPS.map((option) => (
                <MenuItem key={option} value={option}>
                  {option} backups
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Nothing is written unless something has changed since the last one,
            so a day you don’t write costs no files. Once there are more than{" "}
            {settings.keep}, the oldest is deleted — and only ones myTome wrote
            itself. A backup you saved by hand in the same folder is never
            touched.
          </Typography>

          <Stack
            direction="row"
            spacing={1}
            sx={{ mt: 2, flexWrap: "wrap", alignItems: "center" }}
          >
            <Button
              size="small"
              startIcon={<SaveAltIcon fontSize="small" />}
              loading={busy === "now"}
              onClick={() => void run("now", async () => void (await runAutoExport({ force: true })))}
            >
              Back up now
            </Button>
            <Button size="small" onClick={choose} loading={busy === "choose"}>
              Change folder…
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<FolderOffIcon fontSize="small" />}
              loading={busy === "stop"}
              onClick={stop}
            >
              Stop
            </Button>
            {state.lastExportAt ? (
              <Typography variant="body2" color="text.secondary">
                Last written {new Date(state.lastExportAt).toLocaleString()}
                {state.lastFileName ? ` as ${state.lastFileName}` : ""}
              </Typography>
            ) : null}
          </Stack>
        </>
      ) : (
        <Button
          startIcon={<FolderIcon />}
          onClick={choose}
          loading={busy === "choose"}
          sx={{ mt: 2 }}
        >
          Choose a folder…
        </Button>
      )}

      {error ? (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>
          {error} Automatic backups are paused until this works — fix the folder,
          or choose another one, then use “Back up now”.
        </Alert>
      ) : null}
    </Card>
  );
}
