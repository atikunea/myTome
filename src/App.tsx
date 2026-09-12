import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ColorModeProvider } from "./context/ColorModeContext";
import { ProseFaceProvider } from "./context/ProseFaceContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import { TomesProvider } from "./context/TomesContext";
import { ColorModeToggle } from "./components/ColorModeToggle";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import { TomeLibraryPage } from "./pages/TomeLibraryPage";
import { TomeDashboardPage } from "./pages/TomeDashboardPage";
import { ElementTypesPage } from "./pages/ElementTypesPage";
import { ElementListPage } from "./pages/ElementListPage";
import { ElementPage } from "./pages/ElementPage";
import { PlotPage } from "./pages/PlotPage";
import { PlotCompareRedirect } from "./pages/PlotCompareRedirect";
import { WriteListPage } from "./pages/WriteListPage";
import { WriteEditorPage } from "./pages/WriteEditorPage";
import { BeatManuscriptPage } from "./pages/BeatManuscriptPage";
import { AuthorPage } from "./pages/AuthorPage";
import { AuthorsPage } from "./pages/AuthorsPage";
import { BackupPage } from "./pages/BackupPage";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage";
import { TermsOfUsePage } from "./pages/TermsOfUsePage";

export default function App() {
  return (
    <ColorModeProvider>
      <ProseFaceProvider>
        <ConfirmProvider>
          <TomesProvider>
            <HashRouter>
              <ColorModeToggle />
              <Routes>
                <Route path="/" element={<Navigate to="/tomes" replace />} />
                <Route path="/tomes" element={<TomeLibraryPage />} />
                <Route path="/tomes/new" element={<TomeLibraryPage creating />} />
                {/*
                  The guide. The library page shows it in full while the shelf is
                  empty, so this route exists for afterwards: it is where the
                  dismissable strip and the footer link point, which is what makes
                  dismissing the strip hide a nudge rather than lose a page — and
                  it makes "how does this work" something an author can send to
                  someone. Same page, boolean prop, exactly like `/tomes/new`.
                */}
                <Route path="/tomes/guide" element={<TomeLibraryPage guide />} />
                {/*
                  Backup is library-level, not per-tome: a whole-library file is
                  the point, and a browser with no tomes still needs somewhere to
                  restore one from.
                */}
                <Route path="/backup" element={<BackupPage />} />
                {/*
                  Privacy and terms are library-level for the same reason, and
                  linked from the library footer: they describe the whole app
                  rather than one tome, and have to stay reachable from the first
                  screen anyone lands on. Each also links to the other.
                */}
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsOfUsePage />} />
                {/*
                  Author profiles are library-level too: a profile is a byline,
                  shared by every tome credited to it, so it belongs to no one
                  tome's workspace. There is no `/authors/new` — like an element,
                  a profile is created at the click site and opened on its id,
                  so a StrictMode double mount cannot leave an orphan.
                */}
                <Route path="/authors" element={<AuthorsPage />} />
                <Route path="/authors/:authorId" element={<AuthorPage />} />
                <Route path="/tomes/:tomeId" element={<WorkspaceLayout />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  {/* The tome itself, edited where it sits. There is no `edit`
                      sibling: the old form over it is gone, exactly as the
                      element form is — `TomeFormDialog` now only creates. */}
                  <Route path="dashboard" element={<TomeDashboardPage />} />
                  <Route path="elements/settings" element={<ElementTypesPage />} />
                  <Route path="elements/settings/new" element={<ElementTypesPage creating />} />
                  <Route path="elements/settings/:configId" element={<ElementTypesPage />} />
                  {/*
                    One plotting route family for one plotting page. `:plotIds` is
                    a comma-joined list of one or more, so a single plot and a
                    comparison are the same address at different lengths and
                    there is no compare mode to enter or leave. The list is
                    canonical — `PlotPage` drops unknown and repeated ids and
                    rewrites the URL.
                  */}
                  <Route path="plots" element={<PlotPage />} />
                  <Route path="plots/:plotIds" element={<PlotPage />} />
                  <Route path="plots/:plotIds/items/:itemId" element={<PlotPage />} />
                  {/*
                    Legacy. A row label is edited in the gutter now, so there is
                    no dialog for this to reopen and `PlotPage` replaces the
                    address with the plot's own. It stays mounted only because
                    the compare redirect below maps `compare/…/rows/:rowId` onto
                    it, and a link that lands nowhere is worse than one that
                    lands on the row it was about.
                  */}
                  <Route path="plots/:plotIds/rows/:rowId" element={<PlotPage />} />
                  {/*
                    The manuscript export. A route rather than a `useState` flag
                    like every other dialog here — and deliberately scoped to one
                    plot: beats on the same spine row are contemporaneous, which
                    is the absence of a reading order, so there is no honest
                    address for "the manuscript of several plots at once". With
                    several columns drawn it exports the primary one, `:plotIds`
                    first, which is the tab the author has selected.
                  */}
                  <Route path="plots/:plotIds/export" element={<PlotPage exporting />} />
                  {/*
                    A beat's composed text, as one manuscript. It takes the beat's
                    own `:plotId`, never the `:plotIds` list it was clicked from,
                    so a beat's writing has one address however many plots were
                    drawn when the author reached it.
                  */}
                  <Route
                    path="plots/:plotId/items/:itemId/write"
                    element={<BeatManuscriptPage />}
                  />
                  {/*
                    Composing text already written into the beat. The index is a
                    position among the beat's sections and is optional: without
                    one the picked texts are appended, the same way the compare
                    view's insert route appends when it names no row.
                  */}
                  <Route
                    path="plots/:plotId/items/:itemId/write/add"
                    element={<BeatManuscriptPage adding />}
                  />
                  <Route
                    path="plots/:plotId/items/:itemId/write/add/:index"
                    element={<BeatManuscriptPage adding />}
                  />
                  {/*
                    Authoring a beat. It always names the plot, because with
                    several columns drawn a position alone does not say which one
                    is being added to — and one column is only the case where
                    that is obvious. The row is optional: an empty cell in the
                    grid knows which cell it is, while "Add item" knows only that
                    the beat goes last and lets `rowForNewPlotItem` choose.
                  */}
                  <Route
                    path="plots/:plotIds/insert/:sidePlotId"
                    element={<PlotPage creating />}
                  />
                  <Route
                    path="plots/:plotIds/insert/:sidePlotId/:rowId"
                    element={<PlotPage creating />}
                  />
                  {/*
                    The old compare addresses, kept working. Comparing was a page
                    of its own until the two plot views became one; every one of
                    its routes maps to the new shape by deleting the `compare`
                    segment, which is what the splat carries. The static segment
                    outranks `:plotIds`, so these win over the routes above.
                  */}
                  <Route path="plots/compare/:plotIds" element={<PlotCompareRedirect />} />
                  <Route path="plots/compare/:plotIds/*" element={<PlotCompareRedirect />} />
                  {/*
                    There is no `write/new` route: a draft row is created at the
                    click site and the editor is opened on its real id, so a
                    refresh or back never lands on a route that would create a
                    second draft.
                  */}
                  <Route path="write" element={<WriteListPage />} />
                  <Route path="write/:writeItemId" element={<WriteEditorPage />} />
                  <Route path="elements/:typeId" element={<ElementListPage />} />
                  {/* An element has an address of its own, and editing happens on
                      it rather than through a form. There is no `new` sibling:
                      the row is created at the click site so a create-on-mount
                      effect cannot double under StrictMode — the same rule
                      `write/:writeItemId` follows. */}
                  <Route path="elements/:typeId/:elementId" element={<ElementPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/tomes" replace />} />
              </Routes>
            </HashRouter>
          </TomesProvider>
        </ConfirmProvider>
      </ProseFaceProvider>
    </ColorModeProvider>
  );
}
