# Freeboard UI

## Overview

The Freeboard UI is a Vue 3 SPA built with Vite. It uses:

- Apollo Client for GraphQL queries, mutations and SSE subscriptions
- Pinia for state management
- Vue Router for navigation
- Unhead for dynamic `<head>` management
- oh-vue-icons for SVG icons
- Monaco editor for code fields

It supports a plugin architecture for datasources, widgets and auth providers.

## Project Structure

- **Root**  
  `.editorconfig`, `Dockerfile`, `eslint.config.js`, `index.html`, `nginx.conf`, `package.json`, `README.md`, `vite.config.js`
- **public/**  
  Static assets
- **src/**
  - **Entry & config**: `main.js`, `App.vue`, `gql.js`, `merge.js`
  - **Utilities**: `fuzzy.js`, `monaco.js`, `proxy.js`, `render.js`, `settings.js`, `sse.js`, `validators.js`
  - **Auth providers**: `auth/HeaderAuthProvider.js`, `OAuth2PasswordGrantProvider.js`
  - **Datasources**: `datasources/ClockDatasource.js`, `JSONDatasource.js`
  - **i18n**: `i18n/en.js`
  - **Models**: `models/AuthProvider.js`, `Dashboard.js`, `Datasource.js`, `Pane.js`, `Widget.js`
  - **Router**: `router/index.js`
  - **Store**: `stores/freeboard.js`
  - **Widgets**: `widgets/BaseWidget.js`, `TextWidget.js`, `IndicatorWidget.js`, `GaugeWidget.js`, `PointerWidget.js`, `PictureWidget.js`, `HtmlWidget.js`, `SparklineWidget.js`, `MapWidget.js`
  - **Components**: `components/*.vue`

## Key Configuration

- **Vite** (`vite.config.js`):
  - Path alias `~`
  - Base path `'/freeboard/'` when `__FREEBOARD_STATIC__`
  - Dev proxy for `/graphql` → `http://localhost:4001` and `/proxy` → `http://localhost:8001`
- **ESLint** (`eslint.config.js`):
  - JS recommended rules and Vue essential rules
- **Nginx** (`nginx.conf`):
  - Serves SPA, proxies `/graphql` to `freeboard-api:4001`, `/proxy` to `freeboard-proxy:8001`
- **Docker** (`Dockerfile`):
  - Multi-stage build: Node 18 Alpine → build → Nginx serve

## App Initialization (`src/main.js`)

- Creates Vue app and provides `DefaultApolloClient`
- Configures `ApolloClient` with `HttpLink`, `SSELink`, error handling and `InMemoryCache`
- Installs Pinia, Router, i18n, head manager, Monaco plugin
- Registers global component `v-icon`

## GraphQL Operations (`src/gql.js`)

Defines:

- `DASHBOARD_CREATE_MUTATION`
- `DASHBOARD_UPDATE_MUTATION`
- `DASHBOARD_READ_QUERY`
- `DASHBOARD_UPDATE_SUBSCRIPTION`
- `USER_AUTH_MUTATION`

## Utilities

- **`merge.js`**: deep merge two objects
- **`fuzzy.js`**: `levenshteinDistance` for fuzzy matching
- **`monaco.js`**: Monaco editor worker setup
- **`proxy.js`**: builds `/proxy/?url=…` URLs
- **`render.js`**: programmatically render Vue components
- **`settings.js`**: generate dashboard settings schema
- **`sse.js`**: `SSELink` for GraphQL SSE subscriptions
- **`validators.js`**: form validators (`validateRequired`, `validateInteger`, `validateNumber`)

## Plugin Architecture

- **Auth Providers**: classes with `typeName`, `label`, `fields`, and `createRequest`
- **Datasources**: classes with `typeName`, `label`, `fields`, and lifecycle methods (`onSettingsChanged`, `updateNow`, `onDispose`)
- **Widgets**: plugin classes validated at registration and typically implemented on `ReactiveWidget`; support binding resolution via snapshot context and lifecycle methods (`render`, `onSettingsChanged`, `processDatasourceUpdate`, `onResize`, `onDispose`)

## Models & Store

- **Models**: `AuthProvider`, `Dashboard`, `Datasource`, `Pane`, `Widget` implement serialization, deserialization and instance management
- **Store**: `useFreeboardStore` (Pinia) manages:
  - Dashboard data and plugins
  - Persistence of `token` in `localStorage`
  - Dashboard save/load/export actions
  - Theme and asset injection

## Routing (`src/router/index.js`)

- **Static** mode (`__FREEBOARD_STATIC__`): only `/` → `Freeboard`
- **Dynamic** mode: `/login`, `/`, `/:id`
- Global guard redirects between `Home` and `Login` based on authentication

## Running & Development

```bash
npm install
npm run dev --workspace=packages/ui
npm run build
docker build -t freeboard-ui .
docker run -p 80:80 freeboard-ui
```

## Component Summary: `packages/ui/src/components`

### ActionButton.vue

**Purpose:** Simple button styled for board actions.  
**Slots:**

- default: button content

### ArrayFormElement.vue

**Purpose:** Editable table of key/value entries.  
**Props:**

- `modelValue` (Array)
- `options` (Array of field definitions)  
  **Emits:**
- `update:modelValue`

### AuthProviderDialogBox.vue

**Purpose:** Configure an auth provider via tabs.  
**Props:**

- `header` (String)
- `onClose` (Function)
- `onOk` (Function)
- `authProvider` (Object)

### AuthProvidersDialogBox.vue

**Purpose:** Wrapper dialog showing `AuthProvidersList`.  
**Props:**

- `onClose` (Function)

### AuthProvidersList.vue

**Purpose:** List, add, edit, delete auth providers.  
**Uses:** `AuthProviderDialogBox`, `ConfirmDialogBox`

### Board.vue

**Purpose:** Render the grid of panes using `vue-grid-layout-v3`.  
**Uses:** `Pane.vue`

### CodeEditorFormElement.vue

**Purpose:** Embed Monaco editor for code inputs.  
**Props:**

- `modelValue` (String)
- `language` (String|Function)

### ColumnToolbar.vue

**Purpose:** Controls to increase/decrease dashboard width.

### ConfirmDialogBox.vue

**Purpose:** Yes/No confirmation modal.  
**Props:**

- `title` (String)
- `onClose` (Function)
- `onOk` (Function)

### DashboardControl.vue

**Purpose:** Inline form + dialogs for dashboard title/columns/publish.  
**Uses:** `SettingsDialogBox`, `DatasourcesDialogBox`, `AuthProvidersDialogBox`

### DatasourceDialogBox.vue

**Purpose:** Configure a single datasource plugin.  
**Props:**

- `header`, `onClose`, `onOk`, `datasource`

### DatasourcesDialogBox.vue

**Purpose:** Wrapper dialog showing `DatasourcesList`.  
**Props:**

- `onClose` (Function)

### DatasourcesList.vue

**Purpose:** List, refresh, edit, delete datasources.

### DialogBox.vue

**Purpose:** Generic modal with header, slots, OK/Cancel buttons.  
**Props:**

- `header`, `ok`, `cancel`, `okDisabled`  
  **Emits:**
- `ok`, `cancel`, `close`

### Form.vue

**Purpose:** Renders dynamic forms from a `fields` schema.  
**Props:**

- `fields` (Array), `settings` (Object), `hideLabels`, `skipTranslate`  
  **Emits:**
- `change`

### Header.vue

**Purpose:** Top header with `DashboardControl`, `FreeboardControl`, and toggle.

### InputFormElement.vue

**Purpose:** Simple text/password input.  
**Props:**

- `modelValue`, `secret`, `disabled`  
  **Emits:**
- `update:modelValue`

### ListFormElement.vue

**Purpose:** Fuzzy-search dropdown list.  
**Props:**

- `modelValue`, `options`, `disabled`  
  **Emits:**
- `update:modelValue`

### Login.vue

**Purpose:** Login modal with email/password form.

### Pane.vue

**Purpose:** Render a single pane, its widgets, and edit toolbar.  
**Props:**

- `pane` (Object)

### PaneDialogBox.vue

**Purpose:** Edit a pane’s name.  
**Props:**

- `header`, `onClose`, `onOk`, `settings`

### Preloader.vue

**Purpose:** Loading indicator animation.

### SelectFormElement.vue

**Purpose:** Styled `<select>` dropdown.  
**Props:**

- `modelValue`, `options`, `placeholder`, `disabled`, `placeholderDisabled`  
  **Emits:**
- `update:modelValue`

### SettingsDialogBox.vue

**Purpose:** Configure all dashboard settings via `TabNavigator`.  
**Props:**

- `onClose`, `onOk`

### Freeboard.vue

**Purpose:** Root component, fetches/subscribes to dashboard, initializes plugins.  
**Props:**

- `id` (optional)

### FreeboardControl.vue

**Purpose:** Toolbar to save/import/export the board.

### SwitchFormElement.vue

**Purpose:** Toggle switch for boolean fields.  
**Props:**

- `modelValue`, `disabled`  
  **Emits:**
- `update:modelValue`

### TabNavigator.vue

**Purpose:** Tabbed interface for grouping form sections.  
**Props:**

- `fields` (Array of tab definitions with `name`, `icon`, `label`)

### TextButton.vue

**Purpose:** Text-style button for inline actions.

### ToggleHeaderButton.vue

**Purpose:** Toggle between edit mode on/off.

### TypeSelect.vue

**Purpose:** Labeled dropdown for selecting a type.  
**Props:**

- `modelValue`, `options`  
  **Emits:**
- `update:modelValue`

### Widget.vue

**Purpose:** Render a widget instance, with edit/delete/move controls.  
**Props:**

- `widget` (Object)

### WidgetDialogBox.vue

**Purpose:** Configure a widget’s type, general and plugin-specific settings.  
**Props:**

- `header`, `onClose`, `onOk`, `widget`
