import type { PlotDotColor } from "./Plot";

/**
 * The named story structures behind the plot-template pickers — Three-Act,
 * Freytag, the Hero's Journey, and the rest — plus the non-fiction outlines
 * that no fiction structure covers.
 *
 * Like `TomeTemplate`, these are **seeds, not schemas**. Applying one writes a
 * `Plot` and a run of ordinary `PlotItem` rows; from that moment the author owns
 * them outright and nothing in the app consults this registry again. A plot
 * never remembers which structure produced it, so there is no "re-apply", and no
 * migration to run when a template here changes.
 */
export interface TemplateBeat {
  /** The beat label shown beside the track, e.g. "Act I". Repeats, to group beats. */
  name: string;
  title: string;
  description: string;
  dotColor?: PlotDotColor;
}

/** Grouping for the picker's subheaders — presentation only. */
export type PlotTemplateCategory = "Story structures" | "Non-fiction outlines";

export interface PlotTemplate {
  id: string;
  /** Also the name of the plot line it creates. */
  name: string;
  /** One line for the picker — what this structure is for. */
  tagline: string;
  /** A key from `elementTypeIconOptions` (see `components/ElementTypeIcon`). */
  icon: string;
  category: PlotTemplateCategory;
  beats: TemplateBeat[];
}

/**
 * The picker's opt-out: start with an empty plot line and write the beats by
 * hand. Deliberately not a `PlotTemplate` with zero beats — it is the absence of
 * one, so `plotTemplateById` returns undefined for it.
 */
export const noPlotTemplateId = "none";

export const plotTemplates: PlotTemplate[] = [
  {
    id: "three-act",
    name: "Three-Act Structure",
    tagline: "Setup, confrontation, resolution — the spine most other structures decorate.",
    icon: "AutoStories",
    category: "Story structures",
    beats: [
      {
        name: "Act I",
        title: "The ordinary world",
        description: "Who they are before any of this — and what they stand to lose.",
        dotColor: "grey",
      },
      {
        name: "Act I",
        title: "Inciting incident",
        description: "The event that makes the old life impossible to keep.",
        dotColor: "info",
      },
      {
        name: "Act I",
        title: "The decision",
        description: "They commit, and the door closes behind them.",
        dotColor: "primary",
      },
      {
        name: "Act II",
        title: "Rising complications",
        description: "Each attempt costs more than the last and settles less.",
        dotColor: "secondary",
      },
      {
        name: "Act II",
        title: "Midpoint reversal",
        description: "What they thought they were doing turns out to be the wrong thing.",
        dotColor: "warning",
      },
      {
        name: "Act II",
        title: "All is lost",
        description: "The plan fails outright, and the cost lands on someone who mattered.",
        dotColor: "error",
      },
      {
        name: "Act III",
        title: "Climax",
        description: "The confrontation they have been avoiding since Act I.",
        dotColor: "primary",
      },
      {
        name: "Act III",
        title: "Resolution",
        description: "The new normal, and what it cost to get here.",
        dotColor: "success",
      },
    ],
  },
  {
    id: "freytag",
    name: "Freytag's Pyramid",
    tagline: "Rise to a single peak, then fall — built for tragedy and the five-act play.",
    icon: "Terrain",
    category: "Story structures",
    beats: [
      {
        name: "Exposition",
        title: "The situation",
        description: "The players, the place, and the tension already in the room.",
        dotColor: "grey",
      },
      {
        name: "Exposition",
        title: "Inciting incident",
        description: "The disturbance that sets the rise in motion.",
        dotColor: "info",
      },
      {
        name: "Rise",
        title: "Rising action",
        description: "Complication stacked on complication, each one narrowing the options.",
        dotColor: "secondary",
      },
      {
        name: "Peak",
        title: "Climax",
        description: "The top of the pyramid — the choice the whole play hinges on.",
        dotColor: "primary",
      },
      {
        name: "Fall",
        title: "Falling action",
        description: "Consequences unspool and the outcome becomes inevitable.",
        dotColor: "warning",
      },
      {
        name: "Fall",
        title: "Catastrophe",
        description: "The final reversal lands. In tragedy, this is the fall itself.",
        dotColor: "error",
      },
      {
        name: "Close",
        title: "Dénouement",
        description: "The knot untied — what is left standing, and who is left to see it.",
        dotColor: "grey",
      },
    ],
  },
  {
    id: "heros-journey",
    name: "The Hero's Journey",
    tagline: "Campbell's monomyth in twelve stages — departure, initiation, return.",
    icon: "Map",
    category: "Story structures",
    beats: [
      {
        name: "Departure",
        title: "The ordinary world",
        description: "The life that is about to become unavailable to them.",
        dotColor: "grey",
      },
      {
        name: "Departure",
        title: "The call to adventure",
        description: "The summons, the theft, the letter — the thing that will not let them stay.",
        dotColor: "info",
      },
      {
        name: "Departure",
        title: "Refusal of the call",
        description: "They say no. Saying no costs something.",
        dotColor: "warning",
      },
      {
        name: "Departure",
        title: "Meeting the mentor",
        description: "Someone who has been out there hands over a tool, a truth, or a warning.",
        dotColor: "secondary",
      },
      {
        name: "Departure",
        title: "Crossing the threshold",
        description: "They commit, and the rules on the other side are not the old rules.",
        dotColor: "primary",
      },
      {
        name: "Initiation",
        title: "Tests, allies, enemies",
        description: "The company assembles. Loyalties get tested early and cheaply.",
        dotColor: "secondary",
      },
      {
        name: "Initiation",
        title: "Approach to the inmost cave",
        description: "The last preparation before the thing they actually came for.",
        dotColor: "warning",
      },
      {
        name: "Initiation",
        title: "The ordeal",
        description: "The lowest point, where the old approach fails outright.",
        dotColor: "error",
      },
      {
        name: "Initiation",
        title: "The reward",
        description: "They take the thing. Holding it changes the price of everything else.",
        dotColor: "success",
      },
      {
        name: "Return",
        title: "The road back",
        description: "Pursuit, and the pull of the world they left behind.",
        dotColor: "primary",
      },
      {
        name: "Return",
        title: "Resurrection",
        description: "A final test at the threshold that asks for the change, not the skill.",
        dotColor: "error",
      },
      {
        name: "Return",
        title: "Return with the elixir",
        description: "Home, seen by someone who cannot be who they were.",
        dotColor: "success",
      },
    ],
  },
  {
    id: "seven-point",
    name: "Seven-Point Structure",
    tagline: "Write the resolution first, then work backwards — Dan Wells's plotting frame.",
    icon: "Bolt",
    category: "Story structures",
    beats: [
      {
        name: "Beginning",
        title: "Hook",
        description:
          "The starting state — the opposite of where they end. Set it against the resolution.",
        dotColor: "grey",
      },
      {
        name: "Beginning",
        title: "Plot turn 1",
        description: "The world changes and the call arrives. The story proper begins here.",
        dotColor: "info",
      },
      {
        name: "Middle",
        title: "Pinch 1",
        description: "Pressure applied from outside. Show the antagonist's reach, early and cheaply.",
        dotColor: "warning",
      },
      {
        name: "Middle",
        title: "Midpoint",
        description: "They stop reacting and start acting, even without knowing enough yet.",
        dotColor: "primary",
      },
      {
        name: "Middle",
        title: "Pinch 2",
        description: "Pressure again, harder — the mentor dies, the plan collapses, the help runs out.",
        dotColor: "error",
      },
      {
        name: "End",
        title: "Plot turn 2",
        description: "They gain the last thing they need to win — usually knowledge, not power.",
        dotColor: "success",
      },
      {
        name: "End",
        title: "Resolution",
        description: "The state the whole structure was aimed at. Write this beat first.",
        dotColor: "success",
      },
    ],
  },
  {
    id: "save-the-cat",
    name: "Save the Cat",
    tagline: "Blake Snyder's fifteen beats, paced to the page — a screenwriter's clock.",
    icon: "Pets",
    category: "Story structures",
    beats: [
      {
        name: "Act I",
        title: "Opening image",
        description: "One image of the 'before'. The final image will answer it.",
        dotColor: "grey",
      },
      {
        name: "Act I",
        title: "Theme stated",
        description: "Someone says what the story is about. The protagonist does not hear it yet.",
        dotColor: "info",
      },
      {
        name: "Act I",
        title: "Set-up",
        description: "The world, the cast, and the things about this life that need fixing.",
        dotColor: "grey",
      },
      {
        name: "Act I",
        title: "Catalyst",
        description: "The knock at the door. Nothing can be un-known after it.",
        dotColor: "info",
      },
      {
        name: "Act I",
        title: "Debate",
        description: "The last stretch of doubt — should they even go?",
        dotColor: "warning",
      },
      {
        name: "Act II",
        title: "Break into two",
        description: "An active choice into the upside-down world. Never an accident.",
        dotColor: "primary",
      },
      {
        name: "Act II",
        title: "B story",
        description: "The relationship that carries the theme while the A story carries the plot.",
        dotColor: "secondary",
      },
      {
        name: "Act II",
        title: "Fun and games",
        description: "The promise of the premise — the reason someone picked this book up.",
        dotColor: "secondary",
      },
      {
        name: "Act II",
        title: "Midpoint",
        description: "A false victory or a false defeat. The stakes go public.",
        dotColor: "primary",
      },
      {
        name: "Act II",
        title: "Bad guys close in",
        description: "External pressure rises while the team comes apart from the inside.",
        dotColor: "warning",
      },
      {
        name: "Act II",
        title: "All is lost",
        description: "The mirror of the midpoint, with a whiff of death somewhere in it.",
        dotColor: "error",
      },
      {
        name: "Act II",
        title: "Dark night of the soul",
        description: "The wallow. They sit in it long enough for the reader to feel it.",
        dotColor: "error",
      },
      {
        name: "Act III",
        title: "Break into three",
        description: "A and B converge: the relationship hands over the answer.",
        dotColor: "primary",
      },
      {
        name: "Act III",
        title: "Finale",
        description: "Storm the castle, dismantle the old order, and prove the change is real.",
        dotColor: "success",
      },
      {
        name: "Act III",
        title: "Final image",
        description: "The opening image, transformed. Show the distance travelled.",
        dotColor: "grey",
      },
    ],
  },
  {
    id: "fichtean-curve",
    name: "Fichtean Curve",
    tagline: "Open in trouble and keep raising it — a staircase of crises, minimal setup.",
    icon: "LocalFireDepartment",
    category: "Story structures",
    beats: [
      {
        name: "Open",
        title: "Straight into trouble",
        description: "Begin late. The protagonist is already in difficulty; backstory can wait.",
        dotColor: "info",
      },
      {
        name: "Rise",
        title: "First crisis",
        description: "A real setback, resolved in a way that creates the next problem.",
        dotColor: "warning",
      },
      {
        name: "Rise",
        title: "No rest",
        description: "Fallout, and the fragment of backstory that now explains something.",
        dotColor: "secondary",
      },
      {
        name: "Rise",
        title: "Second crisis",
        description: "Higher stakes, narrower options, less time.",
        dotColor: "warning",
      },
      {
        name: "Rise",
        title: "Third crisis",
        description: "The worst yet — it takes away the thing they were relying on.",
        dotColor: "error",
      },
      {
        name: "Peak",
        title: "Climax",
        description: "The top of the staircase. Every earlier crisis paid for this one.",
        dotColor: "primary",
      },
      {
        name: "Close",
        title: "Brief falling action",
        description: "Short by design — answer what must be answered, then stop.",
        dotColor: "success",
      },
    ],
  },
  {
    id: "story-circle",
    name: "Story Circle",
    tagline: "Dan Harmon's eight steps — comfort, chaos, and what the trip cost.",
    icon: "Repeat",
    category: "Story structures",
    beats: [
      {
        name: "Order",
        title: "You",
        description: "A character in a zone of comfort, drawn specifically enough to be missed.",
        dotColor: "grey",
      },
      {
        name: "Order",
        title: "Need",
        description: "But they want something. Name it in one sentence.",
        dotColor: "info",
      },
      {
        name: "Chaos",
        title: "Go",
        description: "They enter an unfamiliar situation to get it.",
        dotColor: "primary",
      },
      {
        name: "Chaos",
        title: "Search",
        description: "Adapt to it — the road of trials, and the skills bought along the way.",
        dotColor: "secondary",
      },
      {
        name: "Chaos",
        title: "Find",
        description: "Get what they wanted. This is the midpoint, not the ending.",
        dotColor: "success",
      },
      {
        name: "Chaos",
        title: "Take",
        description: "Pay its price — the heavy cost of having gotten it.",
        dotColor: "error",
      },
      {
        name: "Order",
        title: "Return",
        description: "Back to the familiar situation, carrying what happened.",
        dotColor: "primary",
      },
      {
        name: "Order",
        title: "Change",
        description: "Having changed. The zone of comfort no longer fits the same way.",
        dotColor: "success",
      },
    ],
  },
  {
    id: "kishotenketsu",
    name: "Kishōtenketsu",
    tagline: "Four movements that turn on a twist rather than a conflict.",
    icon: "Language",
    category: "Story structures",
    beats: [
      {
        name: "Ki",
        title: "Introduction",
        description: "Establish the people and the place, plainly and without tension.",
        dotColor: "grey",
      },
      {
        name: "Shō",
        title: "Development",
        description: "Follow that situation forward. Deepen it; do not complicate it.",
        dotColor: "secondary",
      },
      {
        name: "Ten",
        title: "The twist",
        description:
          "An unforeseen element — a new place, time, or point of view. A pivot, not a clash.",
        dotColor: "primary",
      },
      {
        name: "Ketsu",
        title: "Reconciliation",
        description: "The twist and the first two movements read as one thing. Meaning, not victory.",
        dotColor: "success",
      },
    ],
  },
  {
    id: "romance",
    name: "Romance Beat Sheet",
    tagline: "Two people, one obstacle each, and an ending the reader has been promised.",
    icon: "Favorite",
    category: "Story structures",
    beats: [
      {
        name: "Setup",
        title: "Two separate worlds",
        description: "Each of them alone, with the wound that makes this the wrong time.",
        dotColor: "grey",
      },
      {
        name: "Setup",
        title: "The meeting",
        description: "First contact, and the reason it cannot simply work.",
        dotColor: "info",
      },
      {
        name: "Rise",
        title: "Attraction, resisted",
        description: "Pull and pushback, with a good reason on both sides.",
        dotColor: "secondary",
      },
      {
        name: "Rise",
        title: "Thrown together",
        description: "Circumstance keeps them in the same room long enough to be honest.",
        dotColor: "secondary",
      },
      {
        name: "Rise",
        title: "Falling",
        description: "The turn — a kiss, a confession, a night that changes the register.",
        dotColor: "success",
      },
      {
        name: "Crisis",
        title: "The deepening, and the lie",
        description: "Real intimacy, built on something one of them has not said.",
        dotColor: "warning",
      },
      {
        name: "Crisis",
        title: "The dark moment",
        description: "It surfaces. They part, and both partings have to be believable.",
        dotColor: "error",
      },
      {
        name: "Resolution",
        title: "What each has to give up",
        description: "The private reckoning that makes the reunion mean something.",
        dotColor: "primary",
      },
      {
        name: "Resolution",
        title: "The grand gesture",
        description: "An act with a real cost, aimed at the wound rather than the argument.",
        dotColor: "primary",
      },
      {
        name: "Resolution",
        title: "Together",
        description: "The ending the genre promised, shown rather than asserted.",
        dotColor: "success",
      },
    ],
  },
  {
    id: "mystery",
    name: "Mystery / Whodunit",
    tagline: "A crime, a fair set of clues, and a solution the reader could have reached.",
    icon: "Gavel",
    category: "Story structures",
    beats: [
      {
        name: "Setup",
        title: "The world before",
        description: "The place and its people while the surface is still intact.",
        dotColor: "grey",
      },
      {
        name: "Setup",
        title: "The crime",
        description: "What happened, as it first appears. Plant the detail that will matter last.",
        dotColor: "error",
      },
      {
        name: "Investigation",
        title: "Taking the case",
        description: "Who investigates, and what it costs them personally to do it.",
        dotColor: "primary",
      },
      {
        name: "Investigation",
        title: "First round of clues",
        description: "Interviews and evidence. Play fair — the reader sees everything they see.",
        dotColor: "info",
      },
      {
        name: "Investigation",
        title: "The false lead",
        description: "A suspect who fits, and the reason they are cleared.",
        dotColor: "warning",
      },
      {
        name: "Investigation",
        title: "Complication",
        description: "A second crime, a lost witness, or a warning aimed at the investigator.",
        dotColor: "error",
      },
      {
        name: "Investigation",
        title: "The overlooked detail",
        description: "Something from the first chapter, re-read correctly.",
        dotColor: "info",
      },
      {
        name: "Resolution",
        title: "The revelation",
        description: "The solution, and the chain of reasoning that reaches it.",
        dotColor: "primary",
      },
      {
        name: "Resolution",
        title: "Confrontation",
        description: "The accusation made out loud, with the culprit in the room.",
        dotColor: "warning",
      },
      {
        name: "Resolution",
        title: "Aftermath",
        description: "What the truth costs the people who have to keep living there.",
        dotColor: "success",
      },
    ],
  },
  {
    id: "argument",
    name: "Chapter Outline",
    tagline: "A non-fiction argument: the question, the case for it, and the objection.",
    icon: "MenuBook",
    category: "Non-fiction outlines",
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
  {
    id: "life-timeline",
    name: "Life Timeline",
    tagline: "A biography in periods — origins, the turn, the peak, and the legacy.",
    icon: "HourglassTop",
    category: "Non-fiction outlines",
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
  {
    id: "chapter-arc",
    name: "Chapter Arc",
    tagline: "A self-help chapter: name the problem, teach one idea, hand over the practice.",
    icon: "Star",
    category: "Non-fiction outlines",
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
];

export const defaultPlotTemplateId = "three-act";

/** Undefined for `noPlotTemplateId`, and for any id no longer in the registry. */
export const plotTemplateById = (id: string) =>
  plotTemplates.find((template) => template.id === id);

/** The picker's subheaders, in the order the registry declares them. */
export const plotTemplateCategories = [
  ...new Set(plotTemplates.map((template) => template.category)),
];
