import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { WritingDay, WritingGoals } from "../models/Activity";
import {
  calendarMonthLabels,
  calendarStart,
  calendarWeeks,
  dayKey,
  parseDay,
  weeksThatFit,
} from "../services/activityStats";

/**
 * The book's writing as a square per day, weeks running down in columns.
 *
 * The top panel of the activity page, and the thing an author opens the app to
 * look at. Three rules make it honest rather than decorative:
 *
 * - **The squares are not the only reading.** Each is a real `<button>` with an
 *   accessible name naming its date and its figure, and the day table below the
 *   calendar shows the same days as text. A colour ramp is a summary, never the
 *   record.
 * - **A day that lost words is not a paler good day.** It takes the error
 *   colour, because a negative day is a different kind of fact from a quiet one
 *   and a single ramp cannot say so.
 * - **It draws as many weeks as fit, and never scrolls.** The week that matters
 *   is the last one, so the calendar ends at today and reaches back only as far
 *   as its width allows — a few months on a phone, a year or more on a wide
 *   screen. A scrollbar would open on the far side of last autumn, or hide the
 *   weekday labels once scrolled; measuring the space and filling it exactly
 *   avoids both. The width is read in a layout effect and again whenever it
 *   changes, so the first paint is already the right size and a resize redraws
 *   rather than overflowing.
 *
 * Colour comes from `alpha()` over the theme's primary, so both modes get a
 * ramp that sits on their own paper — there is no palette here to hardcode.
 */
const CELL = 13;
const GAP = 3;

export function ActivityCalendar({
  days,
  goals,
  to = dayKey(),
  selected,
  onSelect,
}: {
  days: WritingDay[];
  goals: WritingGoals;
  /** The last day drawn — today, unless a caller has reason otherwise. */
  to?: string;
  selected?: string;
  onSelect: (date: string) => void;
}) {
  const theme = useTheme();
  const strip = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = strip.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const count = weeksThatFit(width, CELL, GAP);
  const from = calendarStart(to, count);
  const weeks = useMemo(
    () => calendarWeeks(days, goals, from, to),
    [days, goals, from, to],
  );
  const monthLabels = calendarMonthLabels(weeks);

  // The ramp: four steps of the brand accent over the page, plus the ground
  // itself for a day with nothing on it.
  const ground = alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.09 : 0.06);
  const fillFor = (level: number) => {
    if (level < 0) return alpha(theme.palette.error.main, 0.45);
    if (level === 0) return ground;
    return alpha(theme.palette.primary.main, [0, 0.25, 0.5, 0.75, 1][level]);
  };

  return (
    <>
      <Stack direction="row" spacing={1}>
        {/* Sunday-based rows, labelled on the alternate ones so the strip stays
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
        {/* The measured box. It takes whatever the row leaves, and `hidden` is
            only a guard: the weeks inside are counted to fit, so nothing should
            ever reach the edge to be clipped. */}
        <Box ref={strip} sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <Stack direction="row" sx={{ gap: `${GAP}px` }}>
            {weeks.map((week, index) => (
              // Fixed at one cell wide, so a month label wider than its column
              // spills over the next rather than widening this one — which
              // would break the count the fit was made on.
              <Stack key={week.find((cell) => cell)?.date ?? index} sx={{ gap: `${GAP}px`, width: CELL, flex: "0 0 auto" }}>
                <Typography
                  sx={{
                    height: CELL + 4,
                    fontSize: "0.62rem",
                    color: "text.secondary",
                    whiteSpace: "nowrap",
                    overflow: "visible",
                  }}
                >
                  {monthLabels[index] === null
                    ? ""
                    : new Date(2000, monthLabels[index]!, 1).toLocaleDateString(undefined, {
                        month: "short",
                      })}
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
                            : cell.date === to
                              ? `2px solid ${theme.palette.primary.main}`
                              : "none",
                        // Inset rather than outside the square: the calendar
                        // clips at its edge, and a ring drawn outward around the
                        // last column or the top row would be cut in half.
                        outlineOffset: "-2px",
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
