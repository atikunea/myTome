import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import type { Element } from "../models/Element";
import type { ElementType, FieldDefinition } from "../models/ElementType";
import type { Relationship } from "../models/Relationship";
import type { ImageSource } from "../models/Tome";
import type { SaveState } from "../hooks/autosave";
import type { CaretPoint } from "../lexical/CaretAtPointPlugin";
import { missingRequiredFields, store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useConfirm } from "../context/ConfirmContext";
import { useProseFace } from "../context/ProseFaceContext";
import { useObservable } from "../hooks/useObservable";
import { ElementTypeIcon } from "../components/ElementTypeIcon";
import { ImagePicker } from "../components/ImagePicker";
import { InlineTextField } from "../components/InlineTextField";
import { ProseField } from "../components/ProseField";
import {
  RelationshipRowEditor,
  type RelationshipRow,
} from "../components/RelationshipRowEditor";
import { SaveStatus } from "../components/SaveStatus";

/** The prose blocks on this page, addressed the way `edits` and `active` name them. */
const DESCRIPTION = "description";
const proseKey = (fieldId: string) => `attr:${fieldId}`;

export function ElementPage() {
  const { typeId, elementId } = useParams<{ typeId: string; elementId: string }>();
  const { tome, types } = useTomeWorkspace();
  const element = useObservable<Element | null>(
    (cb) => store.observeElement(elementId!, cb),
    [elementId],
  );
  const type = types.find((candidate) => candidate.id === typeId);

  if (!tome || element === undefined) return null;
  if (!type || element === null)
    return (
      <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
        That element no longer exists
      </Typography>
    );

  // Keyed by id so moving between two elements builds a fresh page rather than
  // carrying one element's active field and pending edits onto the next.
  return <ElementDetail key={element.id} element={element} type={type} tomeId={tome.id} />;
}

/**
 * An element as a page you read, with every field editable where it sits.
 *
 * This is the app's second screen without a Save button (`WriteEditorPage` is
 * the first), and the reasons are the same: there is no form to submit, so
 * there is nothing for a Cancel to undo, and `SaveStatus` in the header is the
 * only thing that ever says a write happened. Three rules hold it together:
 *
 * - **One prose field is live at a time.** Each mounted editor owns an autosave
 *   machine, so two would mean two machines writing one row, and `SaveStatus`
 *   reporting whichever spoke last. Clicking into another field tears the first
 *   one down, and its unmount flush writes what it was holding.
 * - **Writes are patches, not whole elements.** `store.updateElement` re-reads
 *   the row inside its transaction, so a field saved while a live query's echo
 *   is still in flight cannot revert the field saved a moment before it.
 * - **A deactivated prose field redraws from `edits`, not from the row.** The
 *   write and its echo are not synchronous, and re-reading would flash the
 *   pre-edit text for a frame.
 */
function ElementDetail({
  element,
  type,
  tomeId,
}: {
  element: Element;
  type: ElementType;
  tomeId: string;
}) {
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const { face } = useProseFace();
  const [save, setSave] = useState<{ state: SaveState; retry: () => void }>({
    state: "clean",
    retry: () => {},
  });
  const [active, setActive] = useState<{ key: string; point: CaretPoint | null } | null>(
    null,
  );
  // What each prose editor last held. See the note above the component.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const flushRef = useRef<Promise<unknown> | null>(null);
  const alive = useRef(true);
  const elementId = element.id;

  const fields = useMemo(
    () => [...type.fieldDefinitions].sort((a, b) => a.sortOrder - b.sortOrder),
    [type.fieldDefinitions],
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Deferred a tick because StrictMode's dev-only remount runs this cleanup
      // on a page that is about to come straight back; sweeping there would
      // delete the draft the author is looking at. The flush is awaited first —
      // it is what turns a draft they typed into from blank-in-the-database
      // into saved. Both halves are `WriteEditorPage`'s, for its reasons.
      window.setTimeout(async () => {
        await flushRef.current;
        if (!alive.current) await store.discardElementIfBlank(elementId);
      }, 0);
    };
  }, [elementId]);

  const handleSaveState = useCallback(
    (state: SaveState, retry: () => void) => setSave({ state, retry }),
    [],
  );

  /**
   * Every write on this page. It reports a rejected one — a cleared name, a
   * select value whose choice was deleted underneath it — as an inline alert
   * rather than letting it surface only in the console, since there is no
   * dialog left to render it in.
   */
  const patch = useCallback(
    async (fields: Parameters<typeof store.updateElement>[1]) => {
      try {
        await store.updateElement(elementId, fields);
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save that change.");
        throw cause;
      }
    },
    [elementId],
  );

  const proseValue = (key: string, stored: string) => edits[key] ?? stored;
  const handleEdit = useCallback(
    (key: string, value: string) => setEdits((current) => ({ ...current, [key]: value })),
    [],
  );

  const missing = missingRequiredFields(element.attributes, fields);
  const goToList = () => navigate(`/tomes/${tomeId}/elements/${type.id}`);

  return (
    // A click anywhere that is not a prose field stands the active one down.
    // `ProseField` stops its own clicks, so the caret can still be moved inside
    // the field being edited; everything else on the page ends the edit, which is
    // what keeps the accent in the gutter honest about where the author is.
    <Box onClick={() => setActive(null)} sx={{ maxWidth: 860 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}
      >
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={goToList}
          sx={{ flexShrink: 0 }}
        >
          {type.name}s
        </Button>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <SaveStatus
            state={save.state}
            savedAt={element.updatedAt}
            onRetry={save.retry}
          />
          <Tooltip title={`Delete this ${type.name.toLowerCase()}`}>
            <IconButton
              aria-label="Delete"
              size="small"
              color="error"
              onClick={() =>
                confirmAction(
                  `Permanently delete "${element.name}"? This cannot be undone.`,
                  async () => {
                    await store.deleteElement(elementId);
                    goToList();
                  },
                )
              }
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      ) : null}

      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 0.5 }}>
        <ElementTypeIcon icon={type.icon} color="primary" sx={{ fontSize: "1.7rem" }} />
        <InlineTextField
          value={element.name}
          placeholder="Name"
          ariaLabel="Name"
          save={(name) => patch({ name })}
          onSaveState={handleSaveState}
          onFocus={() => setActive(null)}
          sx={{ fontSize: "1.7rem", fontWeight: 700, lineHeight: 1.2 }}
        />
      </Stack>
      {missing.length ? (
        <Chip
          size="small"
          variant="outlined"
          color="warning"
          label={`Still to fill in: ${missing.map((field) => field.name).join(", ")}`}
          sx={{ mb: 2 }}
        />
      ) : null}

      <Box sx={{ mt: 3, mb: 4 }}>
        <ProseField
          value={proseValue(DESCRIPTION, element.description)}
          active={active?.key === DESCRIPTION}
          caretPoint={active?.key === DESCRIPTION ? active.point : null}
          face={face}
          placeholder="Click to describe this element…"
          editorKey={`${elementId}:${DESCRIPTION}`}
          save={(description) => patch({ description })}
          onActivate={(point) => setActive({ key: DESCRIPTION, point })}
          onEdit={(value) => handleEdit(DESCRIPTION, value)}
          onSaveState={handleSaveState}
          flushRef={flushRef}
        />
      </Box>

      {fields.length ? (
        <Stack spacing={3} sx={{ mb: 4 }}>
          {fields.map((field) => (
            <FieldSection
              key={field.id}
              field={field}
              element={element}
              face={face}
              active={active}
              value={proseValue(proseKey(field.id), element.attributes[field.id] ?? "")}
              onActivate={(point) => setActive({ key: proseKey(field.id), point })}
              onDeactivate={() => setActive(null)}
              onEdit={(value) => handleEdit(proseKey(field.id), value)}
              onSave={(value) => patch({ attributes: { [field.id]: value } })}
              onSaveState={handleSaveState}
              flushRef={flushRef}
            />
          ))}
        </Stack>
      ) : null}

      <Divider sx={{ mb: 3 }} />
      <RelationshipsSection element={element} type={type} tomeId={tomeId} />

      <Stack spacing={1} sx={{ mt: 4, maxWidth: 320 }}>
        <Typography variant="subtitle2">Image</Typography>
        <ImagePicker
          image={element.image}
          label={element.name || type.name}
          alt={element.name}
          onChange={(image?: ImageSource) => void patch({ image })}
          sx={{ height: 160 }}
        />
      </Stack>
    </Box>
  );
}

/**
 * One custom field, drawn by kind. `prose` gets the same click-to-edit block the
 * description does — which is the whole point of the kind existing — while
 * `text` and `select` stay one-liners.
 */
function FieldSection({
  field,
  element,
  face,
  active,
  value,
  onActivate,
  onDeactivate,
  onEdit,
  onSave,
  onSaveState,
  flushRef,
}: {
  field: FieldDefinition;
  element: Element;
  face: Parameters<typeof ProseField>[0]["face"];
  active: { key: string; point: CaretPoint | null } | null;
  value: string;
  onActivate: (point: CaretPoint) => void;
  onDeactivate: () => void;
  onEdit: (value: string) => void;
  onSave: (value: string) => Promise<void>;
  onSaveState: (state: SaveState, retry: () => void) => void;
  flushRef: React.MutableRefObject<Promise<unknown> | null>;
}) {
  const key = proseKey(field.id);
  const stored = element.attributes[field.id] ?? "";

  const label = (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline", mb: 0.5 }}>
      <Typography variant="subtitle2">{field.name}</Typography>
      {field.required ? (
        <Typography variant="caption" color="text.secondary">
          Required
        </Typography>
      ) : null}
    </Stack>
  );

  if (field.kind === "prose")
    return (
      <Box>
        {label}
        <ProseField
          value={value}
          active={active?.key === key}
          caretPoint={active?.key === key ? active.point : null}
          face={face}
          placeholder={`Click to write ${field.name.toLowerCase()}…`}
          editorKey={`${element.id}:${key}`}
          save={onSave}
          onActivate={onActivate}
          onEdit={onEdit}
          onSaveState={onSaveState}
          flushRef={flushRef}
        />
      </Box>
    );

  if (field.kind === "select")
    return (
      <Box>
        {label}
        <TextField
          select
          size="small"
          value={(field.options ?? []).includes(stored) ? stored : ""}
          onChange={(event) => void onSave(event.target.value)}
          slotProps={{ htmlInput: { "aria-label": field.name } }}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">Not set</MenuItem>
          {(field.options ?? []).map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
      </Box>
    );

  return (
    <Box>
      {label}
      <InlineTextField
        value={stored}
        placeholder={`Add ${field.name.toLowerCase()}…`}
        ariaLabel={field.name}
        save={onSave}
        onSaveState={onSaveState}
        onFocus={onDeactivate}
      />
    </Box>
  );
}

/**
 * Relationships, saved as they are completed rather than staged.
 *
 * `saveElementRelationships` replaces the element's whole set from the rows it
 * is given, which suits this page: a row is committed once it has both a target
 * and a label — the pair `validateRelationship` insists on — and an incomplete
 * one simply waits, exactly as it did in the form this replaced.
 */
function RelationshipsSection({
  element,
  type,
  tomeId,
}: {
  element: Element;
  type: ElementType;
  tomeId: string;
}) {
  const { types } = useTomeWorkspace();
  const [rows, setRows] = useState<RelationshipRow[]>([]);
  const [error, setError] = useState("");
  const stored = useObservable<Relationship[]>(
    (cb) => store.observeElementRelationships(tomeId, element.id, cb),
    [tomeId, element.id],
  );
  const tomeElements =
    useObservable<Element[]>((cb) => store.observeTomeElements(tomeId, cb), [tomeId]) ?? [];

  // Rows the author is still filling in have no stored counterpart, so they are
  // kept across a re-read rather than being wiped by the live query that lands
  // when the previous one was saved.
  useEffect(() => {
    if (!stored) return;
    setRows((current) => [
      ...stored.map((relationship) => {
        const direction: "from" | "to" =
          relationship.fromElementId === element.id ? "from" : "to";
        return {
          key: relationship.id,
          id: relationship.id,
          direction,
          otherElementId:
            direction === "from" ? relationship.toElementId : relationship.fromElementId,
          otherElementTypeId:
            direction === "from"
              ? relationship.toElementTypeId
              : relationship.fromElementTypeId,
          label: relationship.label,
        };
      }),
      ...current.filter((row) => !row.id && !isComplete(row)),
    ]);
  }, [stored, element.id]);

  const targetOptions = tomeElements
    .filter((candidate) => candidate.id !== element.id)
    .map((candidate) => {
      const candidateType = types.find((t) => t.id === candidate.elementTypeId);
      return {
        id: candidate.id,
        name: candidate.name,
        elementTypeId: candidate.elementTypeId,
        typeName: candidateType?.name ?? "",
        typeIcon: candidateType?.icon,
      };
    });

  const commit = async (next: RelationshipRow[]) => {
    setRows(next);
    try {
      await store.saveElementRelationships(element, next.filter(isComplete));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save that link.");
    }
  };

  return (
    <Stack spacing={1.25}>
      <Typography variant="subtitle2">Relationships</Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No relationships yet.
        </Typography>
      ) : null}
      {rows.map((row) => (
        <RelationshipRowEditor
          key={row.key}
          row={row}
          tomeId={tomeId}
          selfTypeId={type.id}
          selfLabel={`This ${type.name.toLowerCase()}`}
          selfIcon={type.icon}
          targetOptions={targetOptions}
          onChange={(next) =>
            void commit(rows.map((candidate) => (candidate.key === row.key ? next : candidate)))
          }
          onRemove={() =>
            void commit(rows.filter((candidate) => candidate.key !== row.key))
          }
        />
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() =>
          setRows((current) => [
            ...current,
            {
              key: crypto.randomUUID(),
              direction: "from",
              otherElementId: "",
              otherElementTypeId: "",
              label: "",
            },
          ])
        }
        sx={{ alignSelf: "flex-start" }}
      >
        Add relationship
      </Button>
    </Stack>
  );
}

/** A relationship worth storing: both ends named, the way `validateRelationship` asks. */
const isComplete = (row: RelationshipRow) => !!row.otherElementId && !!row.label.trim();
