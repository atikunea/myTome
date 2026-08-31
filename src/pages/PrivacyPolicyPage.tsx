import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, Container, Link, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

/**
 * The privacy policy, reachable from the library page.
 *
 * It is static prose rather than data, but it is a route for the same reason
 * every other screen is: it has to be linkable, and a privacy page is exactly
 * the sort of URL someone expects to be able to send to someone else.
 *
 * Everything here is a claim about the code, so it has to be re-read whenever
 * the code moves: the storage list mirrors `models/db.ts` plus the two
 * `localStorage` keys in `context/` and the sync mark in `services/drive.ts`,
 * and the network list mirrors the CSP in `vite.config.ts` — which is the
 * exhaustive answer to "where can this app talk to", and is what this page
 * should be checked against.
 */
export function PrivacyPolicyPage() {
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
        Privacy
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.25, maxWidth: 620 }}>
        myTome has no server, no accounts, and no analytics. Your writing stays in
        this browser unless you deliberately move it somewhere else.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        Last updated 30 August 2026.
      </Typography>

      <Stack spacing={2.5} sx={{ mt: 3.5 }}>
        <Section title="The short version">
          <Paragraph>
            Everything you write — tomes, element types, elements, relationships,
            plots, beats and prose — is saved by your own browser, on your own
            machine. None of it is sent to us, because there is nowhere to send it:
            myTome is a static site with no backend, nothing for you to sign up for,
            and no database of yours that anyone else holds.
          </Paragraph>
          <Paragraph>
            The two exceptions are things you start yourself: a backup file you
            download, and the optional Google Drive sync. Both are described below.
          </Paragraph>
        </Section>

        <Section title="What is stored, and where">
          <Paragraph>All of it lives in this browser, for this site only:</Paragraph>
          <Bullets
            items={[
              "Your work — tomes, element types and their fields, elements, relationships, plots, plot rows, beats and prose — in the browser's IndexedDB.",
              "Cover and element images you choose from your machine, kept in that same database as files. An image you supply as a web address is stored as the address, and your browser fetches it from that host each time it is shown.",
              "Two small preferences: light or dark mode, and your prose typeface. If you connect Google Drive, the time of your last sync is remembered the same way.",
            ]}
          />
          <Paragraph>
            There are no cookies, no tracking pixels, no advertising, and no
            analytics or telemetry of any kind. Nothing profiles you, and nothing
            about how you use the app is measured or reported.
          </Paragraph>
        </Section>

        <Section title="What leaves your browser">
          <Paragraph>
            In ordinary use, only what any website needs in order to load.
            Concretely, the app is allowed to talk to exactly these places:
          </Paragraph>
          <Bullets
            items={[
              "The host serving the app. The published site runs on GitHub Pages, so opening it makes an ordinary web request to GitHub, which may log it — including your IP address and browser — under GitHub's own privacy statement. That happens when you load the page, not while you write.",
              "Any host you point an image at yourself, by giving a web address as a cover or element image.",
              "Google's sign-in and Drive APIs — only if you connect Drive, and only while you are using it.",
            ]}
          />
          <Paragraph>
            That list is enforced rather than merely promised: the published build
            ships a content security policy naming those hosts, so a request
            anywhere else is blocked by the browser itself.
          </Paragraph>
        </Section>

        <Section title="Google Drive sync (optional)">
          <Paragraph>
            If you connect Google Drive, myTome keeps one backup file per tome in a
            myTome folder in your own Drive, so a second browser signed in as you
            finds the same books. The sync runs entirely in this tab, between you
            and Google. It stays off until you click Connect, and a build without a
            configured Google client id cannot do it at all.
          </Paragraph>
          <Bullets
            items={[
              "What is sent: the contents of the tomes being synced, as the same backup files you could download by hand. Nothing else about you or your machine is included.",
              "Who receives it: Google, into your own Drive account. What happens to it there is governed by Google's privacy policy and your Drive settings; we never see it and have no access to it.",
              "What access is asked for: per-file access to files this app created itself. It cannot see, list, or touch anything else in your Drive.",
              "The sign-in token is held in memory, in this tab only. It is never written to disk, expires after about an hour, and closing the tab ends it.",
              "Google's sign-in script is loaded the first time you connect — never on an ordinary page load — so ignoring Drive means never running Google's code.",
              "Sync never deletes anything from Drive. A tome you delete here stays in your Drive until you delete that file yourself, and will come back on the next sync.",
            ]}
          />
        </Section>

        <Section title="Backup files">
          <Paragraph>
            A backup you download is a plain file containing your work, saved
            wherever you tell your browser to put it. From that moment it is yours
            to look after: it is not encrypted, and anyone who can read the file can
            read your writing. Keep it somewhere you are comfortable with, and treat
            sending one to someone as sending them the manuscript.
          </Paragraph>
        </Section>

        <Section title="Deleting your data">
          <Paragraph>
            Deleting a tome in the app removes it and everything in it from this
            browser immediately. To remove everything at once, clear this site's
            data in your browser settings — that erases the database and the
            preferences with it, and there is no copy elsewhere for anyone to hold.
          </Paragraph>
          <Paragraph>
            Copies you made deliberately are not covered by that: backup files you
            downloaded, and any files in Google Drive, have to be deleted where they
            live.
          </Paragraph>
        </Section>

        <Section title="Children">
          <Paragraph>
            myTome collects nothing from anyone, of any age. There is no account to
            create and no information to submit.
          </Paragraph>
        </Section>

        <Section title="Changes, and getting in touch">
          <Paragraph>
            If this policy changes, the date at the top changes with it. myTome is
            an open source project — the code behind every claim on this page can be
            read, and questions are welcome, at{" "}
            <Link href="https://github.com/atikunea/myTome" target="_blank" rel="noreferrer">
              github.com/atikunea/myTome
            </Link>
            .
          </Paragraph>
        </Section>
      </Stack>
    </Container>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="h2" sx={{ fontSize: "1.35rem", mb: 1.25 }}>
        {title}
      </Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Card>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Typography color="text.secondary" sx={{ lineHeight: 1.65 }}>
      {children}
    </Typography>
  );
}

function Bullets({ items }: { items: string[] }) {
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
