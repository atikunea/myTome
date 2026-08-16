# WriteMap Architecture Design

## Overview
This document outlines the proposed architecture for WriteMap, a web-based novel writing assistant. The application will leverage modern web standards for performance and maintainability.

**Technology Stack:**
*   **Language:** TypeScript
*   **UI Framework:** React 19, with MUI (mui.com) for components and theming
*   **Routing:** react-router-dom (`HashRouter`)
*   **State Management:** React Context (see `src/context/`) for shared/global state; local component state for page-local UI concerns
*   **Build Tool:** Vite ([https://vite.dev](https://vite.dev)) — For fast module bundling, HMR, and production builds
*   **Data Persistence:** Dexie library ([https://github.com/dexie/Dexie.js](https://github.com/dexie/Dexie.js)) — A modern wrapper for IndexedDB with Promise-based API

## Core Architectural Principles
1.  **Single Source of Truth**: All application state must flow through a centralized data management layer to ensure consistency across all components.
2.  **Decoupling**: UI components (Lit components) should only consume state and emit events; they must not directly interact with the database or global state store.
3.  **Element-Centric Data Model**: All domain entities adhere to the common `Element` model, as defined in `REQUIREMENTS.md`.

## Proposed Structure Breakdown

### 1. Build Configuration (Vite)
*   **Goal:** To provide a fast development experience with hot-module replacement and efficient production builds.
*   **Implementation**: Vite configuration (`vite.config.ts`) will handle TypeScript compilation, asset processing, and output optimization. The build toolchain should support modular bundling per Lit component module for tree-shaking benefits.

### 2. State Management (The Store)
*   **Goal**: To manage application state and abstract database interactions.
*   **Implementation**: A dedicated TypeScript class/module (e.g., `StoreService`) will wrap the IndexedDB operations via Dexie. It should expose observable streams or reactive getters that Lit components can subscribe to.
*   **Interaction**: Components call methods on this service (e.g., `storeService.getStory(storyId)`) which handles fetching data from IndexedDB and transforming it into a usable state object for the UI.

### 3. Data Persistence Layer (Dexie Wrapper)
*   **Goal**: To provide reliable, structured, offline-first storage with a modern Promise-based API.
*   **Implementation**: A dedicated `DatabaseService` module responsible solely for CRUD operations using Dexie. It will handle versioning and migrations of the database structure when necessary.
*   **Schema Mapping**: This service must map the application's logical data model (the Element Model) into Dexie object stores, defining IndexedDB tables per element type (e.g., `characters`, `places`, `scenes`).

### 4. UI Layer (React + MUI Components)
*   **Goal**: To render views based on state changes reactively.
*   **Implementation**: Each major module (CharacterView, PlaceView, etc.) is a self-contained React function component, built primarily from MUI components.
*   **Data Flow**: A component either reads shared state from a React Context (`TomesContext`, `TomeWorkspaceContext`, `ConfirmContext`, `ColorModeContext`) or subscribes directly to `StoreService` via the `useObservable` hook for page-local data. User actions call `StoreService` mutation methods directly, or `useConfirm()` for anything destructive.

### 5. Element Schema Registry
*   **Goal**: To define and enforce data structure rules programmatically.
*   **Implementation**: A configuration file (e.g., `elementSchemas.ts`) that defines the shape of attributes for each `type` ('character', 'place', etc.). This informs both validation logic *and* UI rendering/forms generation.

## Next Steps & Questions for Clarification
To finalize this architecture, I need more details on the following points:

1.  **State Reactivity**: When components subscribe to state changes, is a simple observable pattern (like RxJS or custom event emitters) sufficient, or do you anticipate needing a full-blown state management library like Redux/Zustand?
2.  **Story Context**: How should the application manage the *currently active* story ID? Is this stored in the global state, or does it belong to the initial page load context?
3.  **Component Composition**: For complex modules like 'Plot' or 'Dashboard', are we looking for a parent component that aggregates many child Lit components, or is there a specific pattern for handling such compositions?
