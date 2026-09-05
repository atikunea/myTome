import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import type { Plot, PlotItem } from "../models/Plot";
import type { WriteItem } from "../models/WriteItem";
import { writeItemTypeLabels, writeItemTypes } from "../models/WriteItem";
import type { ManuscriptOptions } from "../services/manuscript";
import {
  buildManuscript,
  defaultManuscriptOptions,
  manuscriptFileName,
  summarizeSkips,
} from "../services/manuscript";
import { useProseFace } from "../context/ProseFaceContext";
import { ManuscriptPrint } from "./ManuscriptPrint";

/**
 * Turns one plot line into a manuscript file.
 *
 * The dialog owns only the two choices and the two transports. What the
 * document *contains* is decided by `services/manuscript.ts`, which is pure and
 * tested; this recomputes it on every toggle so the counts under the switches
 * are the counts of the file that is about to be written, not an estimate.
 *
 * **Nothing is left out silently.** Beats with no included text, texts excluded
 * by the type filter and texts composed into more than one beat are all counted
 * back to the author before they export. A manuscript is the last place to make
 * a quiet decision on someone's behalf.
 */
/**
 * "Departure and The bridge", or "Departure, The ford and The bridge". Beat
 * labels are not unique, so a text composed into two beats that happen to share
 * a name legitimately reads as "The mill and The mill" — which is exactly the
 * confusion the author needs to see.
 */
function formatBeatNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function ManuscriptExportDialog({
  tomeTitle,
  plot,
  beats,
  writeItems,
  onClose,
}: {
  tomeTitle: string;
  plot: Plot;
  beats: PlotItem[];
  writeItems: WriteItem[];
  onClose: () => void;
}) {
  const { face } = useProseFace();
  const [options, setOptions] = useState<ManuscriptOptions>(defaultManuscriptOptions);
  const [printing, setPrinting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const manuscript = useMemo(
    () => buildManuscript({ tomeTitle, plot, beats, writeItems, options }),
    [tomeTitle, plot, beats, writeItems, options],
  );
  const skips = summarizeSkips(manuscript.skipped);
  const empty = manuscript.beats.length === 0;

  /**
   * The print document is mounted, printed, and taken down again on
   * `afterprint` rather than immediately after `window.print()` returns — the
   * call blocks until the preview closes in every browser we care about, but a
   * browser where it does not would otherwise unmount the pages mid-print.
   */
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);

  const toggleType = (type: (typeof writeItemTypes)[number]) =>
    setOptions((current) => ({
      ...current,
      types: current.types.includes(type)
        ? current.types.filter((x) => x !== type)
        : [...current.types, type],
    }));

  const handlePrint = () => {
    setError("");
    // The pages have to be in the DOM before `print()` is called, and React
    // would otherwise batch the state change until after it.
    flushSync(() => setPrinting(true));
    window.print();
  };

  const handleDownload = async () => {
    setError("");
    setBusy(true);
    try {
      // `docx` is half a megabyte and is the only thing in this app that needs
      // it, so it is fetched when an author actually exports rather than
      // shipped to everyone who opens a tome. This is also why the PDF goes
      // through the browser's own printer: nothing to download at all.
      const { manuscriptDocxBlob } = await import("../services/manuscriptDocx");
      const blob = await manuscriptDocxBlob(manuscript);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = manuscriptFileName(manuscript, "docx");
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be built.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Export “{plot.name}”</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Include
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                {writeItemTypes.map((type) => {
                  const on = options.types.includes(type);
                  return (
                    <Chip
                      key={type}
                      label={writeItemTypeLabels[type]}
                      onClick={() => toggleType(type)}
                      color={on ? "primary" : "default"}
                      variant={on ? "filled" : "outlined"}
                    />
                  );
                })}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                Lore and snippets are left out by default — they are background
                and scratch rather than the book.
              </Typography>
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={options.beatHeadings}
                  onChange={(event) =>
                    setOptions((current) => ({
                      ...current,
                      beatHeadings: event.target.checked,
                    }))
                  }
                />
              }
              label="Open each beat with its title as a heading"
            />

            <Box>
              <Typography variant="body2">
                {empty
                  ? "Nothing to export with these settings."
                  : `${manuscript.beats.length} ${
                      manuscript.beats.length === 1 ? "beat" : "beats"
                    }, each starting a new page · ${manuscript.words.toLocaleString()} words`}
              </Typography>
              {(skips.empty > 0 || skips.type > 0 || skips.missing > 0) && (
                <Stack component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }} spacing={0.25}>
                  {skips.type > 0 && (
                    <Typography component="li" variant="caption" color="text.secondary">
                      {skips.type} text{skips.type === 1 ? "" : "s"} left out by the
                      filter above
                    </Typography>
                  )}
                  {skips.empty > 0 && (
                    <Typography component="li" variant="caption" color="text.secondary">
                      {skips.empty} beat{skips.empty === 1 ? "" : "s"} with no
                      included text — no blank pages
                    </Typography>
                  )}
                  {skips.missing > 0 && (
                    <Typography component="li" variant="caption" color="warning.main">
                      {skips.missing} text{skips.missing === 1 ? "" : "s"} could not
                      be found
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>

            {/*
              Repeats are named rather than counted, and they are not an
              omission: each one is printed in every beat that composes it. The
              author is the only one who can tell a deliberate refrain from a
              double-compose, so the beats are named for them to go and look.
            */}
            {manuscript.repeated.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Appears more than once
                </Typography>
                <Stack component="ul" sx={{ m: 0, pl: 2.5 }} spacing={0.25}>
                  {manuscript.repeated.map((repeat) => (
                    <Typography
                      key={repeat.writeItemId}
                      component="li"
                      variant="caption"
                      color="text.secondary"
                    >
                      <Box component="span" sx={{ color: "text.primary" }}>
                        “{repeat.title}”
                      </Box>{" "}
                      — in {formatBeatNames(repeat.beatNames)}
                    </Typography>
                  ))}
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.5, display: "block" }}
                >
                  Each is included in every beat listed, and counted in the words
                  above.
                </Typography>
              </Box>
            )}

            {error && <Alert severity="error">{error}</Alert>}

            <Typography variant="caption" color="text.secondary">
              PDF goes through your browser’s print dialog — choose “Save as PDF”
              as the destination.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
          <Button
            onClick={handlePrint}
            disabled={empty}
            startIcon={<PictureAsPdfOutlinedIcon />}
          >
            Print / Save as PDF
          </Button>
          <Button
            onClick={handleDownload}
            disabled={empty || busy}
            variant="contained"
            startIcon={<DescriptionOutlinedIcon />}
          >
            {busy ? "Building…" : "Download .docx"}
          </Button>
        </DialogActions>
      </Dialog>
      {printing && <ManuscriptPrint manuscript={manuscript} face={face} />}
    </>
  );
}
