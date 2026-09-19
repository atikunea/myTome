import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { WritingDay, WritingGoals, WritingSession } from "../models/Activity";
import type { Tome } from "../models/Tome";
import { store } from "../services/store";
import {
  bookProgress,
  currentStreak,
  dayKey,
  durationLabel,
  isCountedDay,
  longestStreak,
  metGoal,
  metSessionTarget,
  netByDay,
  netOn,
  pace,
  plural,
  parseDay,
  recentDays,
  sessionMinutes,
  signedWords,
} from "../services/activityStats";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useObservable } from "../hooks/useObservable";
import { ActivityCalendar } from "../components/ActivityCalendar";
import { ActivityStat } from "../components/ActivityStat";
import { EmptyState } from "../components/EmptyState";
import { TomeTargetsDialog } from "../components/TomeTargetsDialog";

/**
 * One book's writing: the calendar of days, the figures those days add up to,
 * and the sittings behind any one of them.
 *
 * The arrangement is deliberate and is the recommendation the design notes
 * landed on (`docs/activity-tracker.md`): the calendar is the panel an author
 * opens the app to look at, and the table underneath is the *same* data as
 * text — which is what keeps a page built out of coloured squares readable by
 * someone who cannot see the colours.
 *
 * The pace strip above it appears only when the book has both a target and a
 * deadline, because it answers a question nothing else can be asked: "will this
 * be finished in time". With no deadline there is no question, and a row of
 * dashes pretending there is would be worse than nothing.
 *
 * Nothing on this page is stored. Streaks, required pace and the projected
 * finish are derived on every render in `services/activityStats.ts`, from rows
 * that only ever record what already happened.
 */
export function ActivityPage({ editing }: { editing?: boolean } = {}) {
  const { tome } = useTomeWorkspace();
  if (!tome) return null;
  // Keyed by id for `TomeDashboardPage`'s reason: moving between two books
  // builds a fresh page rather than carrying one book's selected day onto the
  // next, where that date may mean nothing at all.
  return <TomeActivity key={tome.id} tome={tome} editing={editing} />;
}

const dayLabel = (date: string) =>
  parseDay(date).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

const clockLabel = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function TomeActivity({ tome, editing }: { tome: Tome; editing?: boolean }) {
  const navigate = useNavigate();
  const today = dayKey();
  const [selected, setSelected] = useState(today);
  const tomeId = tome.id;

  const days =
    useObservable<WritingDay[]>((cb) => store.observeWritingDays(tomeId, cb), [tomeId]) ?? [];
  const goals = useObservable<WritingGoals>((cb) => store.observeWritingGoals(cb), []);
  const total = useObservable<number>((cb) => store.observeTomeWordCount(tomeId, cb), [tomeId]);
  const sessions =
    useObservable<WritingSession[]>(
      (cb) => store.observeWritingSessions(tomeId, selected, cb),
      [tomeId, selected],
    ) ?? [];

  // Both arrive on their own live queries; drawing a streak against goals that
  // have not loaded would flash a zero the author never had.
  if (!goals || total === undefined) return null;

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
  const closeDialog = () => navigate(`/tomes/${tomeId}/activity`);

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}
      >
        <Box>
          <Typography
            variant="overline"
            color="primary"
            sx={{ fontWeight: 800, letterSpacing: "0.12em" }}
          >
            ACTIVITY
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: "0.9rem" }}>
            {tome.title} · {total.toLocaleString()} words
            {tome.wordTarget ? ` of ${tome.wordTarget.toLocaleString()}` : ""}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => navigate("/activity")}>
            Daily goal
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => navigate(`/tomes/${tomeId}/activity/targets`)}
          >
            Edit targets
          </Button>
        </Stack>
      </Stack>

      {forecast ? <PaceStrip forecast={forecast} goals={goals} deadline={tome.deadline!} /> : null}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
          mb: 2,
        }}
      >
        <ActivityStat
          label={`Today · ${dayLabel(today)}`}
          value={signedWords(todayNet)}
          unit={goals.dailyWords ? `/ ${goals.dailyWords.toLocaleString()}` : "words"}
          tone={todayNet < 0 ? "error" : "primary"}
          fraction={goals.dailyWords ? Math.max(0, todayNet) / goals.dailyWords : undefined}
          note={
            !goals.dailyWords
              ? "No daily goal set."
              : !isCountedDay(today, goals)
                ? "Today isn't one of your writing days."
                : todayNet >= goals.dailyWords
                  ? "Goal met."
                  : `${(goals.dailyWords - todayNet).toLocaleString()} words to today's goal.`
          }
        />
        <ActivityStat
          label="Streak"
          value={goals.dailyWords ? String(streak) : "—"}
          unit={goals.dailyWords ? (streak === 1 ? "day" : "days") : undefined}
          note={
            !goals.dailyWords ? (
              "Set a daily goal to keep a streak."
            ) : (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                {metGoal(net, today, goals) ? (
                  <Chip size="small" color="success" label="Today counted" />
                ) : isCountedDay(today, goals) ? (
                  <Chip size="small" variant="outlined" label="Today in play" />
                ) : null}
                <Box component="span">Longest {plural(longestStreak(days, goals), "day")}</Box>
              </Stack>
            )
          }
        />
        <ActivityStat
          label="The book"
          value={progress ? `${Math.round(progress.fraction * 100)}` : total.toLocaleString()}
          unit={progress ? "%" : "words"}
          tone="secondary"
          fraction={progress?.fraction}
          note={
            progress
              ? progress.done
                ? "Target reached."
                : `${progress.remaining.toLocaleString()} words to go.`
              : "No word target set for this book."
          }
        />
      </Box>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography
          variant="overline"
          sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.1em" }}
        >
          Recent weeks
        </Typography>
        <Box sx={{ mt: 1 }}>
          <ActivityCalendar
            days={days}
            goals={goals}
            to={today}
            selected={selected}
            onSelect={setSelected}
          />
        </Box>
      </Paper>

      {days.length ? (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "1.15fr 1fr" },
            alignItems: "start",
          }}
        >
          <DayTable days={days} goals={goals} selected={selected} onSelect={setSelected} />
          <SittingsPanel
            date={selected}
            net={netOn(net, selected)}
            sessions={sessions}
            goals={goals}
          />
        </Box>
      ) : (
        <EmptyState
          title="Nothing recorded yet"
          body="Write anything in this book and today's square will fill in. Nothing here is typed in by hand — it is counted from your prose as you save it."
        />
      )}

      {editing ? <TomeTargetsDialog tome={tome} onClose={closeDialog} /> : null}
    </Box>
  );
}

/**
 * The deadline, answered. Three figures rather than a chart: the projection,
 * what the deadline actually demands, and the gap between them — which is the
 * whole of what a burndown line would have said.
 */
function PaceStrip({
  forecast,
  goals,
  deadline,
}: {
  forecast: NonNullable<ReturnType<typeof pace>>;
  goals: WritingGoals;
  deadline: string;
}) {
  const tone =
    forecast.standing === "behind" || forecast.standing === "overdue" ? "error.main" : "success.main";
  const headline = {
    done: "Target reached",
    ahead: "On track",
    behind: "Behind pace",
    overdue: "Past the deadline",
  }[forecast.standing];

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, mb: 2, borderLeft: 3, borderLeftColor: tone, borderLeftStyle: "solid" }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={{ xs: 1.5, sm: 4 }}
        divider={
          <Box sx={{ borderLeft: { sm: 1 }, borderTop: { xs: 1, sm: 0 }, borderColor: "divider" }} />
        }
      >
        <Figure
          label={headline}
          value={
            forecast.projectedEnd
              ? parseDay(forecast.projectedEnd).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"
          }
          note={
            forecast.projectedEnd
              ? `projected finish at ${goals.dailyWords.toLocaleString()} words a day`
              : "set a daily goal to project a finish"
          }
        />
        <Figure
          label="Required pace"
          value={forecast.requiredPace.toLocaleString()}
          note={
            forecast.daysLeft
              ? `${forecast.remaining.toLocaleString()} words over ${forecast.daysLeft} counted ${
                  forecast.daysLeft === 1 ? "day" : "days"
                }`
              : `${forecast.remaining.toLocaleString()} words, and the deadline has passed`
          }
        />
        <Figure
          label="Deadline"
          value={parseDay(deadline).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          note={
            forecast.slackDays === undefined
              ? ""
              : forecast.slackDays >= 0
                ? `${forecast.slackDays} days of slack`
                : `${Math.abs(forecast.slackDays)} days late at this rate`
          }
        />
      </Stack>
    </Paper>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Box>
      <Typography
        variant="overline"
        sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.1em" }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: "1.45rem", fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
      {note ? (
        <Typography sx={{ color: "text.secondary", fontSize: "0.78rem" }}>{note}</Typography>
      ) : null}
    </Box>
  );
}

/**
 * The calendar's days as text. Every column is a figure the squares encode, so
 * this is the same record read a second way rather than a second record.
 */
function DayTable({
  days,
  goals,
  selected,
  onSelect,
}: {
  days: WritingDay[];
  goals: WritingGoals;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const net = netByDay(days);
  const today = dayKey();
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1, sm: 2 } }}>
      <Typography
        variant="overline"
        sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.1em" }}
      >
        Days
      </Typography>
      <Table size="small" sx={{ mt: 0.5 }}>
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell align="right">Net</TableCell>
            <TableCell align="right" sx={{ display: { xs: "none", sm: "table-cell" } }}>
              Sittings
            </TableCell>
            <TableCell align="right" sx={{ display: { xs: "none", sm: "table-cell" } }}>
              Time
            </TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {recentDays(days, 14).map((day) => (
            <TableRow
              key={day.id}
              hover
              selected={day.date === selected}
              onClick={() => onSelect(day.date)}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{dayLabel(day.date)}</TableCell>
              <TableCell
                align="right"
                sx={{
                  fontVariantNumeric: "tabular-nums",
                  color: day.net < 0 ? "error.main" : "text.primary",
                }}
              >
                {signedWords(day.net)}
              </TableCell>
              <TableCell
                align="right"
                sx={{ fontVariantNumeric: "tabular-nums", display: { xs: "none", sm: "table-cell" } }}
              >
                {day.sessions}
              </TableCell>
              <TableCell
                align="right"
                sx={{ fontVariantNumeric: "tabular-nums", display: { xs: "none", sm: "table-cell" } }}
              >
                {durationLabel(day.minutes)}
              </TableCell>
              <TableCell align="right">
                {day.date === today ? (
                  <Chip size="small" variant="outlined" label="Today" />
                ) : !goals.dailyWords || !isCountedDay(day.date, goals) ? (
                  <Chip size="small" label="Not counted" />
                ) : metGoal(net, day.date, goals) ? (
                  <Chip size="small" color="success" label="Met" />
                ) : (
                  <Chip size="small" color="error" variant="outlined" label="Missed" />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

/**
 * One day's sittings. A sitting is bounded by saves, so its time is "writing
 * time" and says so — the ten minutes spent staring at the wall before giving
 * up are not in it, and claiming otherwise would be the one dishonest number
 * on the page.
 */
function SittingsPanel({
  date,
  net,
  sessions,
  goals,
}: {
  date: string;
  net: number;
  sessions: WritingSession[];
  goals: WritingGoals;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography
        variant="overline"
        sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.1em" }}
      >
        {dayLabel(date)}
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", mb: 1 }}>
        <Typography sx={{ fontSize: "1.45rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {signedWords(net)}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: "0.82rem" }}>
          words net
        </Typography>
      </Stack>
      {sessions.length ? (
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
          {sessions.map((session) => {
            const met = metSessionTarget(session, goals);
            return (
              <Box key={session.id} sx={{ py: 1 }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
                  <Typography sx={{ fontSize: "0.86rem" }}>
                    {clockLabel(session.startedAt)} – {clockLabel(session.lastSaveAt)} ·{" "}
                    {durationLabel(sessionMinutes(session))}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.86rem",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: session.net < 0 ? "error.main" : "text.primary",
                    }}
                  >
                    {signedWords(session.net)}
                  </Typography>
                </Stack>
                {met === undefined ? null : (
                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                    {met ? "Met the sitting target." : "Under the sitting target."}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
      ) : (
        <Typography color="text.secondary" sx={{ fontSize: "0.86rem" }}>
          No writing recorded on this day.
        </Typography>
      )}
    </Paper>
  );
}
