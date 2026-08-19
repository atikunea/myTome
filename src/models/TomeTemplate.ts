import type { FieldKind } from "./ElementType";
import type { PlotDotColor } from "./Plot";

/**
 * The shape a new tome starts life in: which element types it knows about,
 * what those types record, and an optional plot outline to write against.
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
export interface TemplateBeat {
  /** The spine label beside the beat, e.g. "Act I". */
  name: string;
  title: string;
  description: string;
  dotColor?: PlotDotColor;
}
export interface TemplatePlot {
  name: string;
  beats: TemplateBeat[];
}
export interface TomeTemplate {
  id: string;
  name: string;
  /** One line for the picker — what this template is for. */
  tagline: string;
  /** A key from `elementTypeIconOptions`, shown beside the name in the picker. */
  icon: string;
  types: TemplateType[];
  /** Omitted by "General", which leaves the first plot for the author to make. */
  plot?: TemplatePlot;
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
    plot: {
      name: "The Quest",
      beats: [
        {
          name: "Act I",
          title: "The ordinary world",
          description: "Who they are before any of this — and what they stand to lose.",
          dotColor: "grey",
        },
        {
          name: "Act I",
          title: "The call",
          description: "The thing that will not let them stay.",
          dotColor: "primary",
        },
        {
          name: "Act I",
          title: "The refusal and its price",
          description: "They say no. Saying no costs something.",
          dotColor: "warning",
        },
        {
          name: "Act II",
          title: "Crossing over",
          description: "The threshold, and the rules on the other side of it.",
          dotColor: "info",
        },
        {
          name: "Act II",
          title: "Trials, allies, enemies",
          description: "The company assembles. Loyalties get tested early.",
          dotColor: "secondary",
        },
        {
          name: "Act II",
          title: "The ordeal",
          description: "The lowest point, where the old approach fails outright.",
          dotColor: "error",
        },
        {
          name: "Act III",
          title: "The reward, and what it costs",
          description: "They win the thing. Winning it changes the price of everything else.",
          dotColor: "success",
        },
        {
          name: "Act III",
          title: "The return",
          description: "Home, seen by someone who cannot be who they were.",
          dotColor: "primary",
        },
      ],
    },
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
    plot: {
      name: "Main Sequence",
      beats: [
        {
          name: "Act I",
          title: "The world as it works",
          description: "Show the premise running normally, before anyone questions it.",
          dotColor: "grey",
        },
        {
          name: "Act I",
          title: "The anomaly",
          description: "Something the established rules do not account for.",
          dotColor: "info",
        },
        {
          name: "Act I",
          title: "The wrong explanation",
          description: "The plausible reading everyone accepts first.",
          dotColor: "warning",
        },
        {
          name: "Act II",
          title: "Testing the new rules",
          description: "Deliberate experiment. The reader learns the mechanism with the cast.",
          dotColor: "primary",
        },
        {
          name: "Act II",
          title: "Consequence at scale",
          description: "It stops being one person's problem.",
          dotColor: "secondary",
        },
        {
          name: "Act II",
          title: "The cost surfaces",
          description: "Who pays for this technology, and who decided they would.",
          dotColor: "error",
        },
        {
          name: "Act III",
          title: "The choice",
          description: "The trade the protagonist alone is placed to make.",
          dotColor: "warning",
        },
        {
          name: "Act III",
          title: "The new equilibrium",
          description: "The world that exists afterward — not the one that existed before.",
          dotColor: "success",
        },
      ],
    },
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
    plot: {
      name: "The Descent",
      beats: [
        {
          name: "Act I",
          title: "Ordinary, on purpose",
          description: "Establish what normal looks like so its loss registers.",
          dotColor: "grey",
        },
        {
          name: "Act I",
          title: "The first wrong thing",
          description: "Small, deniable, and witnessed by exactly one person.",
          dotColor: "info",
        },
        {
          name: "Act I",
          title: "Dismissed",
          description: "The rational explanation wins. The delay is what costs them.",
          dotColor: "warning",
        },
        {
          name: "Act II",
          title: "The first loss",
          description: "Denial stops being available.",
          dotColor: "error",
        },
        {
          name: "Act II",
          title: "The rules, learned the hard way",
          description: "They work out what it wants and what it will not do.",
          dotColor: "secondary",
        },
        {
          name: "Act II",
          title: "No way out",
          description: "Every exit they were counting on closes.",
          dotColor: "error",
        },
        {
          name: "Act III",
          title: "The confrontation",
          description: "The plan that uses the rules against it.",
          dotColor: "primary",
        },
        {
          name: "Act III",
          title: "Aftermath",
          description: "Who walks out, carrying what.",
          dotColor: "grey",
        },
      ],
    },
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
    plot: {
      name: "Chapter Outline",
      beats: [
        {
          name: "Front",
          title: "The question",
          description: "What the reader wants answered, in their words.",
          dotColor: "primary",
        },
        {
          name: "Front",
          title: "Why the usual answer fails",
          description: "The conventional account, and where it breaks.",
          dotColor: "warning",
        },
        {
          name: "Part I",
          title: "Background the reader needs",
          description: "The minimum context — no more than the argument requires.",
          dotColor: "grey",
        },
        {
          name: "Part II",
          title: "The core argument",
          description: "The claim this book exists to make.",
          dotColor: "primary",
        },
        {
          name: "Part II",
          title: "The evidence",
          description: "Cases, data, and interviews, strongest first.",
          dotColor: "info",
        },
        {
          name: "Part III",
          title: "The strongest objection",
          description: "Steelman it. Answer it here rather than in a review.",
          dotColor: "error",
        },
        {
          name: "Part III",
          title: "What follows from it",
          description: "Implications and what the reader should do differently.",
          dotColor: "success",
        },
        {
          name: "Back",
          title: "Conclusion",
          description: "Return to the opening question and close it.",
          dotColor: "grey",
        },
      ],
    },
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
    plot: {
      name: "Life Timeline",
      beats: [
        {
          name: "Origins",
          title: "Family and inheritance",
          description: "What they were born into, and what it expected of them.",
          dotColor: "grey",
        },
        {
          name: "Origins",
          title: "Formative years",
          description: "The education, injury, or absence that set the shape.",
          dotColor: "info",
        },
        {
          name: "Rise",
          title: "The turn",
          description: "The decision or accident that made the rest possible.",
          dotColor: "primary",
        },
        {
          name: "Rise",
          title: "The work they are known for",
          description: "Made concrete — how it actually got done, and by whom else.",
          dotColor: "success",
        },
        {
          name: "Peak",
          title: "Public reckoning",
          description: "Fame, controversy, or the verdict of their contemporaries.",
          dotColor: "warning",
        },
        {
          name: "Peak",
          title: "The private cost",
          description: "What the public account leaves out.",
          dotColor: "error",
        },
        {
          name: "Late",
          title: "Later years",
          description: "Decline, reinvention, or a long silence.",
          dotColor: "secondary",
        },
        {
          name: "Late",
          title: "Legacy",
          description: "What outlasted them, and who is still arguing about it.",
          dotColor: "primary",
        },
      ],
    },
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
    plot: {
      name: "Chapter Arc",
      beats: [
        {
          name: "Open",
          title: "The problem they live with",
          description: "Name the reader's Tuesday afternoon, not the abstract problem.",
          dotColor: "grey",
        },
        {
          name: "Open",
          title: "Why trying harder failed",
          description: "Absolve the reader of the last five things they tried.",
          dotColor: "warning",
        },
        {
          name: "Teach",
          title: "The principle",
          description: "The reframe, in one sentence they could repeat to a friend.",
          dotColor: "primary",
        },
        {
          name: "Teach",
          title: "Why it works",
          description: "The mechanism, kept to what a reader needs to believe it.",
          dotColor: "info",
        },
        {
          name: "Do",
          title: "The practice",
          description: "Concrete steps, small enough to start today.",
          dotColor: "success",
        },
        {
          name: "Do",
          title: "When it goes wrong",
          description: "The predictable failure modes and the fix for each.",
          dotColor: "error",
        },
        {
          name: "Prove",
          title: "Someone it worked for",
          description: "One story, told in full, with the messy parts left in.",
          dotColor: "secondary",
        },
        {
          name: "Close",
          title: "Making it stick",
          description: "How the reader keeps this after the book is back on the shelf.",
          dotColor: "primary",
        },
      ],
    },
  },
];

export const defaultTomeTemplateId = "general";

export const tomeTemplateById = (id: string) =>
  tomeTemplates.find((template) => template.id === id) ??
  tomeTemplates.find((template) => template.id === defaultTomeTemplateId)!;
