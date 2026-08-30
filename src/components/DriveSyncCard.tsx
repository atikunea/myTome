import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import CloudQueueIcon from "@mui/icons-material/CloudQueue";
import SyncIcon from "@mui/icons-material/Sync";
import {
  connect,
  disconnect,
  driveConfigured,
  isConnected,
  lastSyncAt,
  syncNow,
} from "../services/drive";
import type { SyncReport } from "../services/drive";

/**
 * The Google Drive half of "where backups go".
 *
 * Three states, and the first one matters most: **without a client id compiled
 * in, this is prose and nothing else** — no buttons that fail, no half-wired
 * connection. A fork of the repo, or a build that never set the variable, gets
 * an honest description of a feature it does not have.
 *
 * Syncing is a button, never a background loop. Google's silent token renewal
 * depends on third-party cookies that browsers keep tightening, and a
 * local-first app has to treat "no network" as an ordinary Tuesday rather than
 * an error state.
 */
export function DriveSyncCard() {
  const [connected, setConnected] = useState(isConnected);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<SyncReport | null>(null);
  const [syncedAt, setSyncedAt] = useState(lastSyncAt);

  const run = async (what: string, action: () => Promise<void>) => {
    setBusy(what);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Drive did not respond.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Card variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="h2" sx={{ fontSize: "1.35rem", mb: 0.75 }}>
        Where backups go
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        myTome has no server of its own, so a backup only leaves this browser
        when you take it somewhere.
      </Typography>

      <Stack divider={<Divider />}>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "center", justifyContent: "space-between", py: 1.25 }}
        >
          <Box>
            <Typography sx={{ fontWeight: 600 }}>This device</Typography>
            <Typography variant="body2" color="text.secondary">
              Backup files download to your computer, and you restore them by
              picking one.
            </Typography>
          </Box>
          <Chip size="small" color="success" label="In use" />
        </Stack>

        <Box sx={{ py: 1.5 }}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
          >
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {connected ? (
                  <CloudDoneIcon fontSize="small" color="success" />
                ) : (
                  <CloudQueueIcon fontSize="small" sx={{ color: "text.secondary" }} />
                )}
                <Typography sx={{ fontWeight: 600 }}>Google Drive</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {driveConfigured
                  ? "Keeps one backup file per tome in a myTome folder in your own Drive, so another browser signed in as you can pick them up. Still no server: the sync runs here, in this tab."
                  : "Not set up in this build. It needs a Google OAuth client id compiled in — see docs/google-drive-sync.md. Nothing is sent anywhere until it is."}
              </Typography>
              {driveConfigured ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  myTome can only see files it created there, never the rest of
                  your Drive. Sync never deletes: remove a tome here and the next
                  sync brings it back from Drive, so delete its file there too.
                </Typography>
              ) : null}
            </Box>
            <Chip
              size="small"
              label={
                !driveConfigured ? "Not set up" : connected ? "Connected" : "Not connected"
              }
              color={connected ? "success" : "default"}
            />
          </Stack>

          {driveConfigured ? (
            <Stack
              direction="row"
              spacing={1}
              sx={{ mt: 1.5, flexWrap: "wrap", alignItems: "center" }}
            >
              {connected ? (
                <>
                  <Button
                    size="small"
                    startIcon={<SyncIcon fontSize="small" />}
                    loading={busy === "sync"}
                    onClick={() =>
                      run("sync", async () => {
                        const result = await syncNow();
                        setReport(result);
                        setSyncedAt(result.at);
                      })
                    }
                  >
                    Sync now
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    loading={busy === "disconnect"}
                    onClick={() =>
                      run("disconnect", async () => {
                        await disconnect();
                        setConnected(false);
                        setReport(null);
                      })
                    }
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  size="small"
                  loading={busy === "connect"}
                  onClick={() =>
                    run("connect", async () => {
                      await connect();
                      setConnected(true);
                    })
                  }
                >
                  Connect Google Drive
                </Button>
              )}
              {syncedAt ? (
                <Typography variant="body2" color="text.secondary">
                  Last synced {new Date(syncedAt).toLocaleString()}
                </Typography>
              ) : null}
            </Stack>
          ) : null}

          {error ? (
            <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => setError("")}>
              {error}
            </Alert>
          ) : null}
          {report ? (
            <Alert
              severity={report.raced.length ? "warning" : "success"}
              sx={{ mt: 1.5 }}
              onClose={() => setReport(null)}
            >
              {describe(report)}
            </Alert>
          ) : null}
        </Box>
      </Stack>
    </Card>
  );
}

const list = (titles: string[]) =>
  titles.length > 2 ? `${titles.length} tomes` : titles.join(" and ");

/** Says what moved, in tome titles rather than counts wherever it fits. */
const describe = (report: SyncReport) => {
  const parts: string[] = [];
  if (report.pulled.length) parts.push(`brought down ${list(report.pulled)}`);
  if (report.pushed.length) parts.push(`sent up ${list(report.pushed)}`);
  if (!parts.length && !report.raced.length)
    parts.push(
      report.matched
        ? `everything already matched (${report.matched})`
        : "nothing to sync yet",
    );
  const raced = report.raced.length
    ? ` ${list(report.raced)} changed in Drive mid-sync and ${report.raced.length === 1 ? "was" : "were"} left alone — sync again to settle ${report.raced.length === 1 ? "it" : "them"}.`
    : "";
  const dupes = report.duplicates
    ? ` ${report.duplicates} older duplicate file${report.duplicates === 1 ? "" : "s"} in Drive ${report.duplicates === 1 ? "was" : "were"} ignored.`
    : "";
  return `Sync finished: ${parts.join(", ")}.${raced}${dupes}`;
};
