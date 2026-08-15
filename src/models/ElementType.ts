export interface ElementType {
  id: number;
  tomeId: number;
  name: string;
  description: string;
}

export function initialElementTypes(tomeId: number) {
  return [
    { tomeId: tomeId, name: "Theme", description: "Represents a theme or style for map elements" },
    { tomeId: tomeId, name: "Character", description: "Represents a character in the map" },
    { tomeId: tomeId, name: "Place", description: "Represents a location or place on the map" },
    { tomeId: tomeId, name: "Event", description: "Represents an event or occurrence on the map" },
    { tomeId: tomeId, name: "Prop", description: "Represents a prop or object in the map" }
  ];
};
