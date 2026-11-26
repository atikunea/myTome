import { Autocomplete, Box, Chip, TextField } from "@mui/material";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import { ElementTypeIcon } from "./ElementTypeIcon";

/**
 * Picks the elements a beat is attached to, grouped by type. Shared by the
 * create dialog and the "+" on a beat card, so the two lists cannot disagree
 * about order or grouping. An attachment is only an association — no label,
 * which is the whole difference from a `Relationship`.
 */
export function ElementAttachPicker({
  elements,
  types,
  value,
  onChange,
  label,
  helperText,
  autoFocus = false,
}: {
  elements: Element[];
  types: ElementType[];
  value: Element[];
  onChange: (value: Element[]) => void;
  label: string;
  helperText?: string;
  autoFocus?: boolean;
}) {
  const typeOf = (element: Element) => types.find((t) => t.id === element.elementTypeId);
  return (
    <Autocomplete
      multiple
      disableCloseOnSelect
      openOnFocus={autoFocus}
      options={[...elements].sort(
        (a, b) => a.elementTypeId.localeCompare(b.elementTypeId) || a.name.localeCompare(b.name),
      )}
      value={value}
      onChange={(_, next) => onChange(next)}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, other) => option.id === other.id}
      groupBy={(option) => typeOf(option)?.name ?? "Other"}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.id}>
          <ElementTypeIcon
            icon={typeOf(option)?.icon}
            fontSize="small"
            sx={{ mr: 1, color: "text.secondary" }}
          />
          {option.name}
        </Box>
      )}
      renderValue={(selected, getItemProps) =>
        selected.map((option, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return (
            <Chip
              key={key}
              size="small"
              variant="outlined"
              icon={<ElementTypeIcon icon={typeOf(option)?.icon} fontSize="small" />}
              label={option.name}
              {...itemProps}
            />
          );
        })
      }
      renderInput={(params) => (
        <TextField {...params} label={label} helperText={helperText} autoFocus={autoFocus} />
      )}
    />
  );
}
