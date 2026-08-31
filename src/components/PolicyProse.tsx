import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, Container, Divider, Link, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

/**
 * The chrome and the prose primitives shared by the two policy pages
 * (`PrivacyPolicyPage`, `TermsOfUsePage`).
 *
 * They render through this rather than each holding a copy for one reason: the
 * pair is read as a pair, and two pages of legal prose that drift apart
 * visually read as one of them being stale. There is nothing else in the app
 * shaped like this — every other screen is a view of the database, and these
 * two are a document — so the sharing stops here and does not want generalising
 * into a page scaffold.
 */
export function PolicyPage({
  title,
  lede,
  updated,
  sibling,
  children,
}: {
  title: string;
  lede: string;
  updated: string;
  /** The other policy page. Each links to the other, so neither is a dead end. */
  sibling: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 3.5, sm: 6 } }}>
      <Button
        component={RouterLink}
        to="/tomes"
        size="small"
        startIcon={<ArrowBackIcon fontSize="small" />}
        sx={{ color: "text.secondary", fontWeight: 500, px: 0 }}
      >
        Library
      </Button>
      <Typography variant="h1" sx={{ fontSize: { xs: "2rem", sm: "3rem" }, mt: 1 }}>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.25, maxWidth: 620 }}>
        {lede}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        Last updated {updated}.
      </Typography>

      <Stack spacing={2.5} sx={{ mt: 3.5 }}>
        {children}
      </Stack>

      <Divider sx={{ mt: 5 }} />
      <Stack direction="row" spacing={2} sx={{ justifyContent: "center", py: 2.5 }}>
        <Link component={RouterLink} to={sibling.to} variant="body2" color="text.secondary">
          {sibling.label}
        </Link>
      </Stack>
    </Container>
  );
}

export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="h2" sx={{ fontSize: "1.35rem", mb: 1.25 }}>
        {title}
      </Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Card>
  );
}

export function PolicyParagraph({ children }: { children: ReactNode }) {
  return (
    <Typography color="text.secondary" sx={{ lineHeight: 1.65 }}>
      {children}
    </Typography>
  );
}

export function PolicyBullets({ items }: { items: string[] }) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 3, display: "grid", gap: 1 }}>
      {items.map((item) => (
        <Typography key={item} component="li" color="text.secondary" sx={{ lineHeight: 1.65 }}>
          {item}
        </Typography>
      ))}
    </Box>
  );
}
