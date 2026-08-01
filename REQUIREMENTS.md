# WriteMap - Novel Writing Assistant Application

## Project Overview
WriteMap is a web-based novel writing assistant that helps authors organize and develop their stories through structured character, setting, plot, and writing management. The application supports multiple story projects with local storage persistence, with cloud sync as a future enhancement.

---

## Core Concept: The Element Model (New)
To ensure scalability and allow for user-defined content types, all major modular entities will adhere to a common **Element** base model. This approach allows the system to treat modules like Characters, Places, Scenes, etc., as specialized instances of a generic `Element`.

**Base Element Structure:**
Every element must minimally contain:
1.  **`type`**: (String) The unique identifier for the element's category (e.g., 'character', 'place', 'scene', 'plotArc'). This is crucial for data separation and rendering logic.
2.  **`name`**: (String, Required) A user-facing title or name.
3.  **`description`**: (Text Area, Optional) A general summary of the element.
4.  **`attributes`**: (JSON Object, Optional) A flexible container for type-specific metadata that can be configured via an Element Schema.

**Element Schema Configuration:**
The system must support a configuration mechanism (e.g., `elementSchemas.json`) where users or developers can define the expected structure and validation rules for each element `type`. This schema dictates which fields are available in the UI/API for that specific type, even if the base model remains consistent.

---

## Core Requirements (Revised)

### 1. Story Management
WriteMap allows the user to create any number of stories at a time. Stories have a title, subtitle, and cover image. The user is only able to edit one story at a time and will need to save a story, exit to the main menu, and load another story to edit a different one.

### Dashboard (Story View)
TBD

### Module Definitions (Inheriting from Element Model)

**A. Characters Module**
*   **Element Type**: `character`
*   **Base Attributes**: Inherits `type`, `name`, `description`.
*   **Specific Attributes (Defined in Schema)**: Gender, Age, Personality traits (array/string), Backstory/ Biography (text area), Appearance description, Tags (optional).
*   Operations: Create, Read, Update, Delete characters.

**B. Places Module**
*   **Element Type**: `place`
*   **Base Attributes**: Inherits `type`, `name`, `description`.
*   **Specific Attributes (Defined in Schema)**: Location/Region, Type (city, forest, castle, etc.), Tags (optional).
*   Operations: Create, Read, Update, Delete places.

**C. Events/Scenes Module**
*   **Element Type**: `scene`
*   **Base Attributes**: Inherits `type`, `name`, `description`.
*   **Specific Attributes (Defined in Schema)**: Content (optional initial text), Tags (optional). *Note: Title will be mapped to 'name'.*
*   Operations: Create, Read, Update, Delete scenes.

**D. Chapters Module**
*   **Element Type**: `chapter`
*   **Base Attributes**: Inherits `type`, `name`, `description`.
*   **Specific Attributes (Defined in Schema)**: Tags (optional).
*   Composition: Chapters manage references to other element types (Scenes, Snippets) rather than holding raw content.

**E. Snippets Module**
*   **Element Type**: `snippet`
*   **Base Attributes**: Inherits `type`, `name`, `description`.
*   **Specific Attributes (Defined in Schema)**: Content (text area - the actual writing fragment), Tags (optional).

*(Other modules like Relationships, Plot, Themes should be reviewed similarly to ensure they either use or contribute to this Element structure.)*

---

## Technical Requirements

### Platform
- Web application (HTML/CSS/JavaScript)
- Responsive design for different screen sizes

### Data Persistence
- Initial implementation: Browser IndexedDB via [Dexie library](https://github.com/dexie/Dexie.js). The storage structure must now accommodate the `Element` model, likely using keyed objects like `{ 'storyId': { 'elementType1': [elements], 'elementType2': [...] } }`.
- Future enhancement: Cloud sync support (placeholder in architecture).

### Architecture Notes
- Single-page application (SPA) design.
- **Build Tool:** Vite — For fast development and production optimization.
- **Modular Component Structure**: Components should consume data based on the `Element` interface, rather than being hardcoded for a specific module type.
- **Schema Validation Layer**: A dedicated service layer must read from element schemas to validate incoming/outgoing data and guide UI rendering.
- Clean separation between story data and UI components.

---

## User Flow
TBD
