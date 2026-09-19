import { Link as RouterLink } from "react-router-dom";
import { Box, Button, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import type { WritingDay, WritingGoals } from "../models/Activity";
import type { Tome } from "../models/Tome";
import { store } from "../services/store";
import {
  bookProgress,
  currentStreak,
  dayKey,
  netByDay,
  netOn,
  pace,
  parseDay,
  signedWords,
} from "../services/activityStats";
import { useObservable } from "../hooks/useObservable";
import { brandFontFamily } from "../theme";

/**
 * Today against the goal, on the tome overview — the smallest of the three
 * activity surfaces, and read-only.
 *
 * **It renders nothing at all when there is no goal and no target.** A card of
 * zeroes on a page about the book would be an invitation to configure something
 * rather than a fact about it; the activity page in the nav is where that
 * invitation belongs. This card exists only once the author has said what they
 * are aiming at.
 *
 * Every figure here is the same derivation the activity page uses, from the
 * same pure module, so the overview can never disagree with the page it links
 * to.
 */
export function ActivityCard({ tome }: { tome: Tome }) {
  const today = dayKey();
  const days =
    useObservable<WritingDay[]>((cb) => store.observeWritingDays(tome.id, cb), [tome.id]) ?? [];
  const goals = useObservable<WritingGoals>((cb) => store.observeWritingGoals(cb), []);
  const total = useObservable<number>((cb) => store.observeTomeWordCount(tome.id, cb), [tome.id]);

  if (!goals || total === undefined) return null;
  if (!goals.dailyWords && !tome.wordTarget && !tome.deadline) return null;

  const net = netByDay(days);
  const todayNet = netOn(net, today);
  const streak = currentStreak(days, goals, today);
  const progress = bookProgress(total, tome.wordTarget);
  const forecast = pace({
    total,
    wordTarget: tome.wordTarget,
    deadline: tome.deadline,
    goals,
    today,
  });

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
      <Typography
        variant="overline"
        sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.1em" }}
      >
        Activity
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", mt: 0.25 }}>
        <Typography
          sx={{
            fontFamily: brandFontFamily,
            fontSize: "1.7rem",
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
            color: todayNet < 0 ? "error.main" : "text.primary",
          }}
        >
          {signedWords(todayNet)}
        </Typography>
        <Typography sx={{ color: "text.secondary", fontSize: "0.85rem", fontWeight: 600 }}>
          {goals.dailyWords ? `/ ${goals.dailyWords.toLocaleString()} today` : "words today"}
        </Typography>
      </Stack>
      {goals.dailyWords ? (
        <LinearProgress
          variant="determinate"
          value={Math.min(100, Math.max(0, (todayNet / goals.dailyWords) * 100))}
          sx={{ mt: 1.25, height: 7, borderRadius: 99 }}
        />
      ) : null}
      <Box sx={{ mt: 1.5 }}>
        {goals.dailyWords ? (
          <Row label="Streak" value={`${streak} ${streak === 1 ? "day" : "days"}`} />
        ) : null}
        {progress ? (
          <Row
            label="The book"
            value={`${total.toLocaleString()} / ${progress.wordTarget.toLocaleString()}`}
          />
        ) : null}
        {forecast?.projectedEnd ? (
          <Row
            label="Projected finish"
            value={parseDay(forecast.projectedEnd).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          />
        ) : null}
      </Box>
      <Button
        component={RouterLink}
        to={`/tomes/${tome.id}/activity`}
        size="small"
        sx={{ mt: 1.5 }}
      >
        Open activity
      </Button>
    </Paper>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      direction="row"
      sx={{
        justifyContent: "space-between",
        gap: 2,
        py: 0.6,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-of-type": { borderBottom: 0 },
        fontSize: "0.85rem",
      }}
    >
      <Box component="span" sx={{ color: "text.secondary" }}>
        {label}
      </Box>
      <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Box>
    </Stack>
  );
}
