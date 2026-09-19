import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { WritingDay, WritingGoals } from "../models/Activity";
import { weekdayLabels } from "../models/Activity";
import type { Tome } from "../models/Tome";
import { store } from "../services/store";
import {
  currentStreak,
  dayKey,
  durationLabel,
  isCountedDay,
  longestStreak,
  metGoal,
  netByDay,
  netOn,
  parseDay,
  plural,
  shiftDay,
  signedWords,
  totalNet,
  weekOf,
} from "../services/activityStats";
import { useTomes } from "../context/TomesContext";
import { useObservable } from "../hooks/useObservable";
import { ActivityStat } from "../components/ActivityStat";
import { WritingGoalsDialog } from "../components/WritingGoalsDialog";
import { brandFontFamily } from "../theme";

/**
 * The daily goal, and every book that counts towards it.
 *
 * Library-level for the same reason `/backup` and `/authors` are: the goal is
 * one row shared by the whole shelf, so it belongs to no single workspace.
 * **One goal, one streak, every book** — the per-book rows here are a breakdown
 * of the day, never separate goals to keep separately.
 *
 * It deliberately shows less than a book's own activity page: no calendar and
 * no sittings. What crosses books is the habit — today, this week, the streak —
 * and everything below that granularity is a question about one manuscript.
 */
export function LibraryActivityPage({ editing }: { editing?: boolean } = {}) {
  const navigate = useNavigate();
  const tomes = useTomes();
  const today = dayKey();
  // A year and a bit: enough for this week, the month, and a streak that has
  // been running a while, without reading every day the library ever had.
  const from = shiftDay(today, -400);
  const days =
    useObservable<WritingDay[]>((cb) => store.observeLibraryDays(from, cb), [from]) ?? [];
  const goals = useObservable<WritingGoals>((cb) => store.observeWritingGoals(cb), []);
  if (!goals) return null;

  // One row per day across every book: the library's day, which is what the
  // goal is actually set against.
  const combined = combineDays(days);
  const net = netByDay(combined);
  const todayNet = netOn(net, today);
  const streak = currentStreak(combined, goals, today);
  const week = weekOf(today);
  const weekNet = week.reduce((sum, key) => sum + netOn(net, key), 0);
  const weekGoal = goals.dailyWords * week.filter((key) => isCountedDay(key, goals)).length;
  const month = today.slice(0, 7);
  const monthDays = combined.filter((day) => day.date.startsWith(month));
  const byTome = todayByTome(days, today, tomes);

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, sm: 7 } }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/tomes")} sx={{ mb: 2 }}>
        Library
      </Button>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: "flex-end", justifyContent: "space-between", mb: 3, flexWrap: "wrap" }}
      >
        <Box>
          <Typography variant="h1" sx={{ fontFamily: brandFontFamily, fontSize: "2.1rem" }}>
            Writing activity
          </Typography>
          <Typography color="text.secondary">
            {goals.dailyWords
              ? `${goals.dailyWords.toLocaleString()} words a day on ${countedDaysLabel(goals)}, across every book.`
              : "No daily goal set yet — everything below is still being recorded."}
          </Typography>
        </Box>
        <Button variant="contained" onClick={() => navigate("/activity/goals")}>
          {goals.dailyWords ? "Edit goals" : "Set a daily goal"}
        </Button>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
          mb: 2,
        }}
      >
        <ActivityStat
          label="Today"
          value={signedWords(todayNet)}
          unit={goals.dailyWords ? `/ ${goals.dailyWords.toLocaleString()}` : "words"}
          tone={todayNet < 0 ? "error" : "primary"}
          fraction={goals.dailyWords ? Math.max(0, todayNet) / goals.dailyWords : undefined}
          note={
            metGoal(net, today, goals) ? (
              <Chip size="small" color="success" label="Goal met" />
            ) : goals.dailyWords && isCountedDay(today, goals) ? (
              `${(goals.dailyWords - todayNet).toLocaleString()} to go today.`
            ) : goals.dailyWords ? (
              "Today isn't one of your writing days."
            ) : null
          }
        />
        <ActivityStat
          label="This week"
          value={signedWords(weekNet)}
          unit={weekGoal ? `/ ${weekGoal.toLocaleString()}` : "words"}
          fraction={weekGoal ? Math.max(0, weekNet) / weekGoal : undefined}
          note={`${durationLabel(week.reduce((sum, key) => sum + minutesOn(combined, key), 0))} at the keyboard.`}
        />
        <ActivityStat
          label="Streak"
          value={goals.dailyWords ? String(streak) : "—"}
          unit={goals.dailyWords ? (streak === 1 ? "day" : "days") : undefined}
          tone="secondary"
          note={
            goals.dailyWords
              ? plural(longestStreak(combined, goals), "day") + " at your longest."
              : "Set a daily goal to keep a streak."
          }
        />
      </Box>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography
          variant="overline"
          sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.1em" }}
        >
          Today, book by book
        </Typography>
        {byTome.length ? (
          <Stack sx={{ mt: 1 }} divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
            {byTome.map((row) => (
              <Stack
                key={row.id}
                direction="row"
                sx={{ justifyContent: "space-between", alignItems: "center", py: 1, gap: 2 }}
              >
                <Button
                  size="small"
                  onClick={() => navigate(`/tomes/${row.id}/activity`)}
                  sx={{ textTransform: "none", justifyContent: "flex-start", minWidth: 0 }}
                >
                  {row.title}
                </Button>
                <Typography
                  sx={{
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 700,
                    color: row.net < 0 ? "error.main" : "text.primary",
                  }}
                >
                  {signedWords(row.net)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        ) : (
          <Typography color="text.secondary" sx={{ mt: 1, fontSize: "0.9rem" }}>
            Nothing written today yet.
          </Typography>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography
          variant="overline"
          sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.1em" }}
        >
          {parseDay(`${month}-01`).toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </Typography>
        <Stack direction="row" spacing={4} sx={{ mt: 1, flexWrap: "wrap" }}>
          <Figure label="Words" value={signedWords(totalNet(monthDays))} />
          <Figure label="Days written" value={String(monthDays.filter((d) => d.net !== 0).length)} />
          <Figure
            label="Sittings"
            value={String(monthDays.reduce((sum, day) => sum + day.sessions, 0))}
          />
          <Figure
            label="At the keyboard"
            value={durationLabel(monthDays.reduce((sum, day) => sum + day.minutes, 0))}
          />
        </Stack>
      </Paper>

      {editing ? (
        <WritingGoalsDialog goals={goals} onClose={() => navigate("/activity")} />
      ) : null}
    </Container>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", letterSpacing: "0.08em" }}>
        {label.toUpperCase()}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: "1.15rem" }}>
        {value}
      </Typography>
    </Box>
  );
}

/** "every day", "weekdays", or the days themselves when it is neither. */
const countedDaysLabel = (goals: WritingGoals) => {
  const days = [...goals.countedDays].sort((a, b) => a - b).join(",");
  if (days === "0,1,2,3,4,5,6") return "every day";
  if (days === "1,2,3,4,5") return "weekdays";
  return goals.countedDays.map((day) => weekdayLabels[day]).join(", ") || "no days";
};

/**
 * Every book's rows for one date folded into one, because the daily goal is one
 * goal. Ids and tome ids are meaningless on the result, so they are left blank:
 * this is a total, not a row anybody could write back.
 */
const combineDays = (days: WritingDay[]): WritingDay[] => {
  const byDate = new Map<string, WritingDay>();
  for (const day of days) {
    const held = byDate.get(day.date);
    if (!held) {
      byDate.set(day.date, { ...day, id: day.date, tomeId: "" });
      continue;
    }
    held.added += day.added;
    held.removed += day.removed;
    held.net += day.net;
    held.sessions += day.sessions;
    held.minutes += day.minutes;
  }
  return [...byDate.values()];
};

const minutesOn = (days: WritingDay[], date: string) =>
  days.find((day) => day.date === date)?.minutes ?? 0;

/** Today's figure per book, busiest first, skipping books with nothing on it. */
const todayByTome = (days: WritingDay[], today: string, tomes: Tome[]) => {
  const titles = new Map(tomes.map((tome) => [tome.id, tome.title]));
  return days
    .filter((day) => day.date === today && day.net !== 0 && titles.has(day.tomeId))
    .map((day) => ({ id: day.tomeId, title: titles.get(day.tomeId) ?? "", net: day.net }))
    .sort((a, b) => b.net - a.net);
};
