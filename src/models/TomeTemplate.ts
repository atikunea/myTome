import type { FieldKind } from "./ElementType";

/**
 * The shape a new tome starts life in: which element types it knows about,
 * and what those types record.
 *
 * These are **seeds, not schemas**. Everything a template creates is an
 * ordinary row the author can rename, re-field, reorder, or delete the moment
 * the tome exists; nothing here is consulted again after creation. That is why
 * templates live in `models` as plain data rather than as code that the rest of
 * the app branches on — a tome never remembers which template made it.
 */
export interface TemplateField {
  name: string;
  kind: FieldKind;
  /** Required for `select` fields, ignored otherwise. */
  options?: string[];
}
export interface TemplateType {
  name: string;
  description: string;
  /** A key from `elementTypeIconOptions` (see `components/ElementTypeIcon`). */
  icon: string;
  fields?: TemplateField[];
}
export interface TomeTemplate {
  id: string;
  name: string;
  /** One line for the picker — what this template is for. */
  tagline: string;
  /** A key from `elementTypeIconOptions`, shown beside the name in the picker. */
  icon: string;
  types: TemplateType[];
}

const text = (name: string): TemplateField => ({ name, kind: "text" });
const choice = (name: string, options: string[]): TemplateField => ({
  name,
  kind: "select",
  options,
});

/** The shared closer of every genre template: what the book is *about*. */
const theme: TemplateType = {
  name: "Theme",
  description: "The ideas and motifs that shape your story",
  icon: "Star",
};

export const tomeTemplates: TomeTemplate[] = [
  {
    id: "general",
    name: "General",
    tagline: "The default set — themes, characters, places, events, and props.",
    icon: "AutoStories",
    types: [
      theme,
      {
        name: "Character",
        description: "The people who bring this story to life",
        icon: "Person",
      },
      {
        name: "Place",
        description: "Locations, regions, and settings",
        icon: "LocationOn",
      },
      {
        name: "Event",
        description: "Important events and turning points",
        icon: "Event",
      },
      {
        name: "Prop",
        description: "Objects with a story of their own",
        icon: "Inventory2",
      },
    ],
  },
  {
    id: "fantasy",
    name: "Fantasy",
    tagline: "Worlds with their own magic, factions, and long memory.",
    icon: "Castle",
    types: [
      {
        name: "Character",
        description: "The people who carry the story",
        icon: "Person",
        fields: [
          choice("Role", ["Protagonist", "Antagonist", "Ally", "Mentor", "Rival"]),
          text("Origin"),
        ],
      },
      {
        name: "Faction",
        description: "Houses, orders, and powers with something to win",
        icon: "Shield",
        fields: [text("Seat of power"), text("Wants")],
      },
      {
        name: "Place",
        description: "Kingdoms, holds, wilds, and the roads between them",
        icon: "Map",
        fields: [text("Region"), text("Ruled by")],
      },
      {
        name: "Magic",
        description: "How power works here — and what it takes",
        icon: "AutoAwesome",
        fields: [text("Source"), text("Cost"), text("Limit")],
      },
      {
        name: "Creature",
        description: "What lives out there",
        icon: "Pets",
        fields: [text("Habitat"), choice("Danger", ["Harmless", "Wary", "Deadly"])],
      },
      {
        name: "Artifact",
        description: "Objects with a history and a will of their own",
        icon: "Diamond",
        fields: [text("Power"), text("Last seen")],
      },
      {
        name: "Lore",
        description: "Legends, prophecies, and the history everyone half-remembers",
        icon: "MenuBook",
        fields: [text("Era")],
      },
      theme,
    ],
  },
  {
    id: "scifi",
    name: "Science Fiction",
    tagline: "A premise, its technology, and everything that follows from it.",
    icon: "Public",
    types: [
      {
        name: "Character",
        description: "The people living inside the premise",
        icon: "Person",
        fields: [
          choice("Role", ["Protagonist", "Antagonist", "Ally", "Specialist", "Rival"]),
          text("Affiliation"),
        ],
      },
      {
        name: "World",
        description: "Planets, stations, habitats, and ships",
        icon: "Public",
        fields: [
          text("System"),
          choice("Habitability", ["Hostile", "Marginal", "Temperate", "Engineered"]),
        ],
      },
      {
        name: "Technology",
        description: "What it does, and what it will not do",
        icon: "Bolt",
        fields: [
          choice("Maturity", ["Prototype", "Fielded", "Ubiquitous", "Lost"]),
          text("Constraint"),
          text("Who controls it"),
        ],
      },
      {
        name: "Species",
        description: "Who else is out there, and how they think",
        icon: "Pets",
        fields: [text("Origin"), text("Biology")],
      },
      {
        name: "Polity",
        description: "Governments, corporations, and fleets",
        icon: "Flag",
        fields: [text("Governs"), text("Doctrine")],
      },
      {
        name: "Event",
        description: "The dates everyone in this setting knows",
        icon: "History",
        fields: [text("When")],
      },
      theme,
    ],
  },
  {
    id: "horror",
    name: "Horror",
    tagline: "A threat with rules, a place with no exit, and a cast that learns too late.",
    icon: "Warning",
    types: [
      {
        name: "Character",
        description: "Who is here when it starts",
        icon: "Person",
        fields: [
          choice("Role", ["Survivor", "Skeptic", "Harbinger", "First loss"]),
          choice("Fate", ["Survives", "Taken", "Unknown"]),
        ],
      },
      {
        name: "Threat",
        description: "The thing itself — what it is, and what it obeys",
        icon: "LocalFireDepartment",
        fields: [text("Nature"), text("Rules it follows"), text("Weakness")],
      },
      {
        name: "Place",
        description: "Where they cannot simply leave",
        icon: "Cottage",
        fields: [text("Cut off by"), text("What happened here")],
      },
      {
        name: "Rule",
        description: "The local law that keeps people alive, until someone breaks it",
        icon: "Gavel",
        fields: [text("Consequence if broken")],
      },
      {
        name: "Omen",
        description: "The small wrong things, in the order they appear",
        icon: "Warning",
        fields: [text("Noticed by")],
      },
      theme,
    ],
  },
  {
    id: "nonfiction",
    name: "Non-fiction",
    tagline: "An argument, its sources, and the evidence holding it up.",
    icon: "MenuBook",
    types: [
      {
        name: "Concept",
        description: "The ideas the book has to teach",
        icon: "MenuBook",
        fields: [text("In one sentence"), text("Why it matters")],
      },
      {
        name: "Source",
        description: "Everything you will cite, and where you are with it",
        icon: "AutoStories",
        fields: [
          choice("Kind", ["Book", "Paper", "Article", "Interview", "Dataset"]),
          text("Citation"),
          choice("Status", ["To read", "Read", "Cited"]),
        ],
      },
      {
        name: "Person",
        description: "Interviewees, researchers, and the people in your examples",
        icon: "Person",
        fields: [text("Why they matter"), text("Contact")],
      },
      {
        name: "Case study",
        description: "The concrete story that carries an abstract point",
        icon: "Map",
        fields: [text("Where"), text("Outcome")],
      },
      {
        name: "Claim",
        description: "Each thing the book asserts, with what backs it",
        icon: "Gavel",
        fields: [text("Evidence"), choice("Confidence", ["Strong", "Mixed", "Thin"])],
      },
      {
        name: "Term",
        description: "Vocabulary the reader needs defined once and used consistently",
        icon: "Language",
        fields: [text("Short definition")],
      },
    ],
  },
  {
    id: "biography",
    name: "Biography",
    tagline: "A life in periods, with the sources that prove each one.",
    icon: "HourglassTop",
    types: [
      {
        name: "Person",
        description: "The subject, and everyone who shaped or orbited them",
        icon: "Person",
        fields: [text("Relationship to subject"), text("Lived")],
      },
      {
        name: "Period",
        description: "The chapters of a life — childhood, exile, the late work",
        icon: "HourglassTop",
        fields: [text("Years"), text("Where")],
      },
      {
        name: "Milestone",
        description: "The dated events the narrative turns on",
        icon: "Event",
        fields: [text("Date"), text("Why it matters")],
      },
      {
        name: "Place",
        description: "Houses, cities, institutions — the rooms this life happened in",
        icon: "LocationOn",
        fields: [text("Years there")],
      },
      {
        name: "Source",
        description: "Letters, interviews, and archives, with how far you trust them",
        icon: "AutoStories",
        fields: [
          choice("Kind", ["Interview", "Letter", "Archive", "Press", "Photograph"]),
          text("Where it lives"),
          choice("Verified", ["Confirmed", "Single source", "Unverified"]),
        ],
      },
      theme,
    ],
  },
  {
    id: "selfhelp",
    name: "Self-Help",
    tagline: "A principle per chapter, a practice the reader can actually do.",
    icon: "Repeat",
    types: [
      {
        name: "Principle",
        description: "One idea per chapter, stated as a promise to the reader",
        icon: "Star",
        fields: [text("The promise"), text("Why it works")],
      },
      {
        name: "Practice",
        description: "The exercise that turns the idea into a habit",
        icon: "Repeat",
        fields: [
          text("Takes"),
          choice("Difficulty", ["Easy", "Moderate", "Demanding"]),
          text("What you need"),
        ],
      },
      {
        name: "Story",
        description: "The anecdote that makes a principle land",
        icon: "AutoStories",
        fields: [text("Whose story"), text("Point it makes")],
      },
      {
        name: "Reader",
        description: "Who you are writing to — one person, specifically",
        icon: "Person",
        fields: [text("Struggling with"), text("Wants")],
      },
      {
        name: "Obstacle",
        description: "The objection or relapse, and how the book answers it",
        icon: "Warning",
        fields: [text("The reframe")],
      },
      {
        name: "Evidence",
        description: "Research and practitioners you lean on",
        icon: "MenuBook",
        fields: [text("Source"), choice("Strength", ["Strong", "Suggestive", "Anecdotal"])],
      },
    ],
  },
];

export const defaultTomeTemplateId = "general";

export const tomeTemplateById = (id: string) =>
  tomeTemplates.find((template) => template.id === id) ??
  tomeTemplates.find((template) => template.id === defaultTomeTemplateId)!;
