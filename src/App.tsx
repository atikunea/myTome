import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ColorModeProvider } from "./context/ColorModeContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import { TomesProvider } from "./context/TomesContext";
import { ColorModeToggle } from "./components/ColorModeToggle";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import { TomeLibraryPage } from "./pages/TomeLibraryPage";
import { TomeDashboardPage } from "./pages/TomeDashboardPage";
import { ElementTypesPage } from "./pages/ElementTypesPage";
import { ElementListPage } from "./pages/ElementListPage";
import { PlotPage } from "./pages/PlotPage";

export default function App() {
  return (
    <ColorModeProvider>
      <ConfirmProvider>
        <TomesProvider>
          <HashRouter>
            <ColorModeToggle />
            <Routes>
              <Route path="/" element={<Navigate to="/tomes" replace />} />
              <Route path="/tomes" element={<TomeLibraryPage />} />
              <Route path="/tomes/new" element={<TomeLibraryPage creating />} />
              <Route path="/tomes/:tomeId" element={<WorkspaceLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<TomeDashboardPage />} />
                <Route path="edit" element={<TomeDashboardPage editing />} />
                <Route path="elements/settings" element={<ElementTypesPage />} />
                <Route path="elements/settings/new" element={<ElementTypesPage creating />} />
                <Route path="elements/settings/:configId" element={<ElementTypesPage />} />
                <Route path="plots" element={<PlotPage />} />
                <Route path="plots/:plotId" element={<PlotPage />} />
                <Route path="plots/:plotId/items/:itemId" element={<PlotPage />} />
                <Route path="plots/:plotId/insert/:index" element={<PlotPage creating />} />
                <Route path="elements/:typeId" element={<ElementListPage />} />
                <Route path="elements/:typeId/new" element={<ElementListPage creating />} />
                <Route path="elements/:typeId/:elementId/edit" element={<ElementListPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/tomes" replace />} />
            </Routes>
          </HashRouter>
        </TomesProvider>
      </ConfirmProvider>
    </ColorModeProvider>
  );
}
