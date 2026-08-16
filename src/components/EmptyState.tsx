import { Box, Typography } from "@mui/material";

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Box
      sx={{
        mt: 2.25,
        p: 5.5,
        textAlign: "center",
        border: 1,
        borderStyle: "dashed",
        borderColor: "divider",
        borderRadius: "14px",
        color: "text.secondary",
      }}
    >
      <Typography variant="h2" sx={{ fontSize: "1.35rem", mb: 1 }}>
        {title}
      </Typography>
      <Typography color="text.secondary">{body}</Typography>
    </Box>
  );
}
