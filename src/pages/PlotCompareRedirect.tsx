import { Navigate, useParams } from "react-router-dom";

/**
 * Keeps the old `plots/compare/:plotIds` addresses working now that comparing is
 * not a separate page. A comparison was always a link — the whole point of
 * putting the columns in the URL — so someone may have kept one, and a tome's
 * plot ids outlive the route that used to name them.
 *
 * Every compare sub-route maps to the new shape by deleting one segment:
 * `plots/compare/a,b/items/x` becomes `plots/a,b/items/x`, and `rows/:rowId` and
 * `insert/:sidePlotId[/:rowId]` were already spelled the same way on both pages.
 * That is what the splat carries. `replace` so the old address does not sit in
 * the history waiting for a Back to bounce off it.
 *
 * It reads only route params and touches no context on purpose. The address is
 * entirely in the URL, so resolving the tome to rewrite a link would be work
 * this does not need — and a redirect that renders before its provider is ready
 * is a needless way to fail.
 */
export function PlotCompareRedirect() {
  const { tomeId, plotIds, "*": rest } = useParams();
  if (!tomeId || !plotIds) return <Navigate to="/tomes" replace />;
  return <Navigate to={`/tomes/${tomeId}/plots/${plotIds}${rest ? `/${rest}` : ""}`} replace />;
}
