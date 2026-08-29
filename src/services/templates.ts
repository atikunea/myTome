import { db } from "../models/db";
import { plotTemplateById } from "../models/PlotTemplate";
import { tomeTemplateById } from "../models/TomeTemplate";
import { now, plotRowRange, slugify, uid } from "./internal";
import { savePlot } from "./plots";
import { appendPlotRows } from "./spine";

/**
 * Seeding from the two template registries. Both of these only ever *add* rows,
 * which makes them create-time operations — see the notes on each.
 */
export const templateStore = {
  /**
   * Seeds a brand-new tome from a template: its element types (with their field
   * definitions) and, for every template but "General", a starter plot outline.
   * Only ever called on a tome that has just been created — it adds rows and
   * never reconciles, so applying a second template would stack the two.
   */
  async applyTomeTemplate(tomeId: string, templateId: string) {
    const template = tomeTemplateById(templateId);
    const time = now();
    await db.transaction("rw", db.elementTypes, async () => {
      await db.elementTypes.bulkAdd(
        template.types.map((type, i) => ({
          id: uid(),
          tomeId,
          name: type.name,
          description: type.description,
          icon: type.icon,
          slug: slugify(type.name),
          sortOrder: i,
          fieldDefinitions: (type.fields ?? []).map((field, position) => ({
            id: uid(),
            name: field.name,
            kind: field.kind,
            options: field.options,
            // A template never demands a value: an author sketching a character
            // should not be blocked by a field the template chose for them.
            required: false,
            sortOrder: position,
          })),
          createdAt: time,
          updatedAt: time,
        })),
      );
    });
  },
  /**
   * Creates a plot line from a named story structure, beats and all.
   *
   * Like `applyTomeTemplate` this only ever adds rows, so it is a create-time
   * operation: call it for a plot that does not exist yet, never to re-apply a
   * structure over one the author has already written into. An unknown id (or
   * `noPlotTemplateId`) creates a plain empty plot, which is what the picker's
   * "No plot line" option relies on.
   */
  async createPlotFromTemplate(
    tomeId: string,
    plotTemplateId: string,
    overrides?: { name?: string; description?: string },
  ) {
    const template = plotTemplateById(plotTemplateId);
    const name = overrides?.name?.trim() || template?.name || "Main Plot";
    const time = now();
    return db.transaction("rw", db.plots, db.plotRows, db.plotItems, async () => {
      const plot = await savePlot({
        tomeId,
        name,
        description: overrides?.description,
      });
      if (!template) return plot;
      // The template's beats fill the spine from the top rather than queueing
      // after it, so a subplot added to a tome that already has an outline lines
      // up with its opening. Only a template deeper than the spine extends it.
      const rows = await plotRowRange(tomeId).toArray();
      if (template.beats.length > rows.length)
        rows.push(...(await appendPlotRows(tomeId, template.beats.length - rows.length)));
      await db.plotItems.bulkAdd(
        template.beats.map((beat, i) => ({
          id: uid(),
          tomeId,
          plotId: plot.id,
          name: beat.name,
          title: beat.title,
          description: beat.description,
          dotColor: beat.dotColor ?? "grey",
          dotVariant: "outlined" as const,
          attachedElementIds: [],
          writeItemIds: [],
          plotRowId: rows[i].id,
          sortOrder: i,
          createdAt: time,
          updatedAt: time,
        })),
      );
      return plot;
    });
  },
};
