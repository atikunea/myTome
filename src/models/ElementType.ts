export interface ElementType {
  id: number;
  name: string;
  description: string;
}

export const initialElementTypes: ElementType[] = [
  { id: 1, name: "Theme", description: "Represents a theme or style for map elements" },
  { id: 2, name: "Character", description: "Represents a character in the map" },
  { id: 3, name: "Place", description: "Represents a location or place on the map" },
  { id: 4, name: "Event", description: "Represents an event or occurrence on the map" },
  { id: 5, name: "Prop", description: "Represents a prop or object in the map" }
];
