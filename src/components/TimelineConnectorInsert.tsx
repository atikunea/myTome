import { Box, IconButton, Tooltip } from "@mui/material";
import TimelineConnector from "@mui/lab/TimelineConnector";
import AddIcon from "@mui/icons-material/Add";

/**
 * A timeline stem that doubles as an insert point. The gap between two cards is
 * physically two stacked connectors — the upper card's bottom one and the lower
 * card's top one — and both are given the same insert index by `TimelineCard`, so
 * the whole visual gap behaves as a single target.
 */
export function TimelineConnectorInsert({
  label,
  onInsert,
}: {
  label: string;
  onInsert: () => void;
}) {
  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignSelf: "stretch",
        alignItems: "center",
        flexGrow: 1,
        minHeight: 34,
        "&:hover .insert-affordance, & .insert-affordance:focus-visible": {
          opacity: 1,
          transform: "scale(1)",
        },
      }}
    >
      <TimelineConnector />
      <Tooltip title={label} placement="right">
        <IconButton
          className="insert-affordance"
          aria-label={label}
          size="small"
          onClick={(event) => {
            event.stopPropagation();
            onInsert();
          }}
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            translate: "-50% -50%",
            opacity: 0,
            transform: "scale(0.6)",
            transition: "opacity 120ms ease, transform 120ms ease",
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            p: 0.25,
            "&:hover": { bgcolor: "background.paper", borderColor: "primary.main" },
          }}
        >
          <AddIcon sx={{ fontSize: "1rem" }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
