import { useLayoutEffect, useMemo, useRef } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { WritingDay, WritingGoals } from "../models/Activity";
import { calendarWeeks, dayKey, parseDay, shiftDay } from "../services/activityStats";

/**
 * The book's writing as a square per day, weeks running down in columns.
 *
 * The top panel of the activity page, and the thing an author opens the app to
 * look at. Two rules make it honest rather than decorative:
 *
 * - **The squares are not the only reading.** Each is a real `<button>` with an
 *   accessible name naming its date and its figure, and the day table below the
 *   calendar shows the same days as text. A colour ramp is a summary, never the
 *   record.
 * - **A day that lost words is not a paler good day.** It takes the error
 *   colour, because a negative day is a different kind of fact from a quiet one
 *   and a single ramp cannot say so.
 *
 * Colour comes from `alpha()` over the theme's primary, so both modes get a
 * ramp that sits on their own paper — there is no palette here to hardcode.
 */
const CELL = 13;
const GAP = 3;

export function ActivityCalendar({
  days,
  goals,
  from,
  to,
  selected,
  onSelect,
}: {
  days: WritingDay[];
  goals: WritingGoals;
  from: string;
  to: string;
  selected?: string;
  onSelect: (date: string) => void;
}) {
  const theme = useTheme();
  const weeks = useMemo(
    () => calendarWeeks(days, goals, from, to),
    [days, goals, from, to],
  );

  /**
   * A year of weeks is wider than any workspace, and the week that matters is
   * the last one — so the strip opens showing today rather than the far side of
   * last autumn. A layout effect, not an effect: scrolled after the first paint
   * the author would see it jump.
   */
  const strip = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = strip.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [from, to, weeks.length]);

  // The ramp: four steps of the brand accent over the page, plus the ground
  // itself for a day with nothing on it.
  const ground = alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.09 : 0.06);
  const fillFor = (level: number) => {
    if (level < 0) return alpha(theme.palette.error.main, 0.45);
    if (level === 0) return ground;
    return alpha(theme.palette.primary.main, [0, 0.25, 0.5, 0.75, 1][level]);
  };

  // A month label sits over the first column that starts a new month.
  const monthLabels = weeks.map((week, index) => {
    const first = week.find((cell) => cell !== null);
    if (!first) return "";
    const previous = weeks[index - 1]?.find((cell) => cell !== null);
    const month = parseDay(first.date).getMonth();
    if (previous && parseDay(previous.date).getMonth() === month) return "";
    return parseDay(first.date).toLocaleDateString(undefined, { month: "short" });
  });

  return (
    <>
      <Stack direction="row" spacing={1}>
        {/* Outside the scroller, because the strip opens at today: labels that
            slid off the left with last autumn would never be seen again.
            Sunday-based rows, labelled on the alternate ones so the strip stays
            readable at 13px without crowding. */}
        <Stack sx={{ mt: `${CELL + GAP + 4}px`, gap: `${GAP}px`, pt: "1px", flex: "0 0 auto" }}>
          {["", "Mon", "", "Wed", "", "Fri", ""].map((label, index) => (
            <Typography
              key={index}
              sx={{
                height: CELL,
                lineHeight: `${CELL}px`,
                fontSize: "0.62rem",
                color: "text.secondary",
                width: 22,
              }}
            >
              {label}
            </Typography>
          ))}
        </Stack>
        <Box ref={strip} sx={{ overflowX: "auto", pb: 0.5, minWidth: 0 }}>
          <Stack direction="row" sx={{ gap: `${GAP}px`, minWidth: "fit-content" }}>
            {weeks.map((week, index) => (
            <Stack key={index} sx={{ gap: `${GAP}px` }}>
              <Typography
                sx={{
                  height: CELL + 4,
                  fontSize: "0.62rem",
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                }}
              >
                {monthLabels[index]}
              </Typography>
              {week.map((cell, row) =>
                cell === null ? (
                  <Box key={row} sx={{ width: CELL, height: CELL }} />
                ) : (
                  <Box
                    key={row}
                    component="button"
                    type="button"
                    onClick={() => onSelect(cell.date)}
                    aria-label={`${parseDay(cell.date).toLocaleDateString(undefined, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })} — ${cell.net === 0 ? "no words" : `${cell.net.toLocaleString()} words`}${
                      cell.met ? ", goal met" : ""
                    }`}
                    title={`${cell.date} · ${cell.net.toLocaleString()} words`}
                    aria-pressed={cell.date === selected}
                    sx={{
                      width: CELL,
                      height: CELL,
                      p: 0,
                      border: 0,
                      borderRadius: "3px",
                      cursor: "pointer",
                      bgcolor: fillFor(cell.level),
                      // The selected day and today are marked by a ring rather
                      // than a fill, so neither can be mistaken for a busier day.
                      outline:
                        cell.date === selected
                          ? `2px solid ${theme.palette.text.primary}`
                          : cell.date === dayKey()
                            ? `2px solid ${theme.palette.primary.main}`
                            : "none",
                      outlineOffset: "1px",
                      "&:hover": { filter: "brightness(1.15)" },
                    }}
                  />
                ),
              )}
              </Stack>
            ))}
          </Stack>
        </Box>
      </Stack>
      {/* Outside the scroller: a key that slid off the side with the weeks it
          explains would be no key at all. */}
      <Stack
        direction="row"
        spacing={0.75}
        sx={{
          alignItems: "center",
          mt: 1.5,
          color: "text.secondary",
          fontSize: "0.72rem",
          flexWrap: "wrap",
          rowGap: 0.75,
        }}
      >
        <Box sx={{ width: CELL, height: CELL, borderRadius: "3px", bgcolor: fillFor(-1) }} />
        <Box component="span" sx={{ mr: 1 }}>
          shorter
        </Box>
        <Box component="span">fewer</Box>
        {[0, 1, 2, 3, 4].map((level) => (
          <Box
            key={level}
            sx={{ width: CELL, height: CELL, borderRadius: "3px", bgcolor: fillFor(level) }}
          />
        ))}
        <Box component="span">more</Box>
      </Stack>
    </>
  );
}

/**
 * The window the calendar draws: the book's first recorded day, or a year back
 * when it has none — never less than that, so an empty calendar still looks
 * like a calendar rather than a single lonely square.
 */
export const calendarRange = (days: WritingDay[], today = dayKey()) => {
  const earliest = days.reduce((min, day) => (min && min < day.date ? min : day.date), "");
  const yearBack = shiftDay(today, -363);
  return { from: earliest && earliest < yearBack ? earliest : yearBack, to: today };
};
