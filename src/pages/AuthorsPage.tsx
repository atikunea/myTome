import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  Container,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { Author } from "../models/Author";
import { authorByline } from "../models/Author";
import { store } from "../services/store";
import { useTomes } from "../context/TomesContext";
import { useObservable } from "../hooks/useObservable";
import { CoverThumbnail } from "../components/CoverThumbnail";
import { EmptyState } from "../components/EmptyState";

/**
 * The library's author profiles — every byline a tome can be credited to.
 *
 * Library-level, like `/backup`, because a profile is not part of any one tome:
 * a series shares one, and one writer can hold several. See `models/Author.ts`
 * for the books that settled that shape. This page finds, opens and creates;
 * editing and deleting happen on `AuthorPage`, the element list's split.
 */
export function AuthorsPage() {
  const navigate = useNavigate();
  const tomes = useTomes();
  const authors = useObservable<Author[]>((cb) => store.observeAuthors(cb), []);

  /**
   * Created here, at the click, and opened on its real id — never by an
   * `/authors/new` route that creates on mount, which `StrictMode` would fire
   * twice. An untouched draft is swept when its page unmounts.
   */
  const create = async () => {
    const draft = await store.createDraftAuthor();
    navigate(`/authors/${draft.id}`);
  };

  const credits = (authorId: string) =>
    tomes.filter((tome) => tome.authorId === authorId).length;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3.5, sm: 6 } }}>
      <Button
        component={RouterLink}
        to="/tomes"
        size="small"
        startIcon={<ArrowBackIcon fontSize="small" />}
        sx={{ color: "text.secondary", fontWeight: 500, px: 0 }}
      >
        Library
      </Button>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          alignItems: { xs: "flex-start", sm: "flex-end" },
          justifyContent: "space-between",
          mt: 1,
          mb: 3.5,
        }}
      >
        <Box>
          <Typography variant="h1" sx={{ fontSize: { xs: "2rem", sm: "3rem" } }}>
            Authors
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1.25, maxWidth: 620 }}>
            The names your books are published under. Most writers need one; add
            another for a pen name you write a different kind of book as. Each
            tome credits one, and its title page carries that name.
          </Typography>
        </Box>
        <Button startIcon={<AddIcon />} onClick={() => void create()} sx={{ flexShrink: 0 }}>
          New author
        </Button>
      </Stack>

      {authors === undefined ? null : authors.length ? (
        <Grid container spacing={2.5}>
          {authors.map((author) => (
            <Grid key={author.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <AuthorCard
                author={author}
                credits={credits(author.id)}
                onOpen={() => navigate(`/authors/${author.id}`)}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <EmptyState
          title="No authors yet"
          body="Add the name you write under, and every tome can carry it on its title page."
        />
      )}
    </Container>
  );
}

/** A way in and nothing else, like every card in the app — delete lives on the page. */
function AuthorCard({
  author,
  credits,
  onOpen,
}: {
  author: Author;
  credits: number;
  onOpen: () => void;
}) {
  const byline = authorByline(author);
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardActionArea onClick={onOpen} sx={{ height: "100%", alignItems: "stretch" }}>
        <CoverThumbnail image={author.image} label={byline} alt={byline} sx={{ height: 160 }} />
        <Box sx={{ p: 2.1 }}>
          <Typography variant="h2" sx={{ fontSize: "1.3rem" }}>
            {byline}
          </Typography>
          {author.pseudonym ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Pen name of {author.name}
            </Typography>
          ) : null}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {credits
              ? `Credited on ${credits === 1 ? "1 tome" : `${credits} tomes`}`
              : "Not credited on any tome yet"}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}
