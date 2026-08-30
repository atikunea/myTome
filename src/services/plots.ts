import { liveQuery } from "dexie";
import { db } from "../models/db";
import type { Plot, PlotItem } from "../models/Plot";
import {
  applyOrder,
  now,
  plotItemRange,
  plotRange,
  plotRowRange,
  readPlotItem,
  uid,
} from "./internal";
import { rowForNewPlotItem, syncPlotSortOrder } from "./spine";
import { validatePlotItem } from "./validate";

/**
 * Plots and their beats. Ordering is not authored here — a beat's place comes
 * from the row it stands on, so anything that would set `sortOrder` from an
 * index goes through `spine.ts` instead.
 */

/**
 * Exported on its own as well as through `plotStore`, because `templates.ts` and
 * `ensureDefaultPlot` call it directly — before the split those were
 * `store.savePlot` calls reaching back into the object being defined.
 */
export const savePlot = async (
  input: Partial<Plot> & Pick<Plot, "tomeId" | "name">,
) => {
  const existing = input.id ? await db.plots.get(input.id) : undefined;
  const time = now();
  const plot: Plot = {
    id: existing?.id ?? uid(),
    tomeId: input.tomeId,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    sortOrder:
      input.sortOrder ??
      existing?.sortOrder ??
      (await db.plots.where("tomeId").equals(input.tomeId).count()),
    createdAt: existing?.createdAt ?? time,
    updatedAt: time,
  };
  if (!plot.name) throw new Error("A plot name is required.");
  await db.plots.put(plot);
  return plot;
};

export const plotStore = {
  observePlots(tomeId: string, callback: (v: Plot[]) => void) {
    return liveQuery(() => plotRange(tomeId).toArray()).subscribe({
      next: callback,
      error: console.error,
    });
  },
  observePlot(id: string, callback: (v: Plot | undefined) => void) {
    return liveQuery(() => db.plots.get(id)).subscribe({
      next: callback,
      error: console.error,
    });
  },
  /**
   * One beat, live. Emits `null` for a missing row rather than `undefined`, so
   * the beat manuscript can tell "not loaded yet" from "no such beat" and avoid
   * flashing a not-found message while the first query is still in flight —
   * the same contract `observeWriteItem` keeps.
   */
  observePlotItem(id: string, callback: (v: PlotItem | null) => void) {
    return liveQuery(async () => {
      const row = await db.plotItems.get(id);
      return row ? readPlotItem(row) : null;
    }).subscribe({ next: callback, error: console.error });
  },
  observePlotItems(plotId: string, callback: (v: PlotItem[]) => void) {
    return liveQuery(() =>
      plotItemRange(plotId).toArray().then((rows) => rows.map(readPlotItem)),
    ).subscribe({ next: callback, error: console.error });
  },
  /**
   * Every beat in the tome, across all its plots — the Write list needs them in
   * one pass to resolve story order, rather than one query per write item.
   */
  observeTomePlotItems(tomeId: string, callback: (v: PlotItem[]) => void) {
    return liveQuery(() =>
      db.plotItems
        .where("tomeId")
        .equals(tomeId)
        .toArray()
        .then((rows) => rows.map(readPlotItem)),
    ).subscribe({ next: callback, error: console.error });
  },
  async ensureDefaultPlot(tomeId: string) {
    const existing = await plotRange(tomeId).first();
    if (existing) return existing;
    return savePlot({ tomeId, name: "Main Plot" });
  },
  savePlot,
  async reorderPlots(tomeId: string, orderedIds: string[]) {
    await db.transaction("rw", db.plots, async () => {
      const stored = await plotRange(tomeId).primaryKeys();
      // A mismatch means another tab added or deleted a plot while this drag was
      // in flight — drop the reorder rather than write a stale order.
      if (
        stored.length !== orderedIds.length ||
        !stored.every((id) => orderedIds.includes(id))
      )
        return;
      await applyOrder(db.plots, orderedIds);
    });
  },
  async deletePlot(plot: Pick<Plot, "id" | "tomeId">) {
    await db.transaction("rw", db.plots, db.plotItems, async () => {
      await db.plotItems.where("plotId").equals(plot.id).delete();
      await db.plots.delete(plot.id);
      const remaining = await plotRange(plot.tomeId).primaryKeys();
      await applyOrder(db.plots, remaining);
    });
  },
  async savePlotItem(
    input: Partial<PlotItem> &
      Pick<PlotItem, "tomeId" | "plotId" | "name" | "title" | "description">,
    insertAt?: number,
  ) {
    validatePlotItem(input.title);
    const existing = input.id ? await db.plotItems.get(input.id) : undefined;
    const time = now();
    const item: PlotItem = {
      id: existing?.id ?? uid(),
      tomeId: input.tomeId,
      plotId: input.plotId,
      name: input.name.trim(),
      title: input.title.trim(),
      description: input.description.trim(),
      icon: input.icon,
      dotColor: input.dotColor,
      dotVariant: input.dotVariant,
      attachedElementIds: [
        ...new Set(input.attachedElementIds ?? existing?.attachedElementIds ?? []),
      ],
      writeItemIds: [
        ...new Set(input.writeItemIds ?? existing?.writeItemIds ?? []),
      ],
      // Like `sortOrder`, a new beat's row is settled inside the transaction —
      // choosing one means reading the tome's spine. A caller may name the row
      // itself (the compare grid's empty cells do), and an edit keeps its own.
      plotRowId: input.plotRowId ?? existing?.plotRowId ?? "",
      sortOrder: existing?.sortOrder ?? 0,
      createdAt: existing?.createdAt ?? time,
      updatedAt: time,
    };
    await db.transaction("rw", db.plotRows, db.plotItems, async () => {
      if (existing) {
        await db.plotItems.put(item);
        return;
      }
      // A caller that names the row has already said where the beat goes — the
      // compare grid creates in a specific cell. Only when it does not does the
      // insert position pick a row.
      if (!item.plotRowId) {
        const count = await plotItemRange(item.plotId).count();
        const at = Math.min(Math.max(insertAt ?? count, 0), count);
        item.plotRowId = (await rowForNewPlotItem(item.tomeId, item.plotId, at)).id;
      }
      await db.plotItems.put(item);
      // Settled from row order, never from the insert index. A beat created in a
      // gap partway up the spine belongs at that point in its plot, and numbering
      // it by index would leave the grid and the single-plot timeline disagreeing
      // about where it sits.
      await syncPlotSortOrder(item.tomeId);
    });
    return (await db.plotItems.get(item.id)) ?? item;
  },
  /**
   * Reorders one plot's beats among themselves. Since row order is what ordering
   * means now, this permutes which of the plot's beats stands on each of the rows
   * it already occupies rather than renumbering `sortOrder` directly. The set of
   * occupied rows is unchanged, so every other plot in the tome keeps its
   * alignment and no gap opens or closes anywhere else.
   */
  async reorderPlotItems(plotId: string, orderedIds: string[]) {
    await db.transaction("rw", db.plotRows, db.plotItems, async () => {
      const stored = await plotItemRange(plotId).toArray();
      // A mismatch means another tab inserted or deleted an item while this drag
      // was in flight — drop the reorder rather than write a stale order.
      if (
        stored.length !== orderedIds.length ||
        !stored.every((item) => orderedIds.includes(item.id))
      )
        return;
      if (!stored.length) return;
      const rows = await plotRowRange(stored[0].tomeId).toArray();
      const rank = new Map(rows.map((row, index) => [row.id, index]));
      const held = stored
        .map((item) => item.plotRowId)
        .sort(
          (a, b) =>
            (rank.get(a) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(b) ?? Number.MAX_SAFE_INTEGER),
        );
      // `held` is already in row-rank order, so the index this writes and the
      // rank of the row it writes alongside it agree by construction — this is
      // not `sortOrder` authored from a list position.
      await Promise.all(
        orderedIds.map((id, index) =>
          db.plotItems.update(id, { plotRowId: held[index], sortOrder: index }),
        ),
      );
    });
  },
  async deletePlotItem(item: Pick<PlotItem, "id" | "plotId">) {
    await db.transaction("rw", db.plotItems, async () => {
      await db.plotItems.delete(item.id);
      // No row assignment changed, so compacting what is left of this one plot
      // is equivalent to a full `syncPlotSortOrder` and costs one plot's reads.
      const remaining = await plotItemRange(item.plotId).primaryKeys();
      await applyOrder(db.plotItems, remaining);
    });
  },
};
