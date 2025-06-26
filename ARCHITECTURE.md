# Architecture Documentation

## Code Organization and Key Concepts

### Main Components

#### 1. PDF Rendering System
- **Entry Point**: `renderPage()` function
- **Dependencies**: PDF.js (loaded via CDN)
- **Key Concepts**:
  - Each PDF page becomes a `<div class="page">` container
  - Canvas element for PDF rendering
  - Annotation overlay layer for interactive elements
  - Fractional coordinate system (0.0-1.0) for resolution independence

#### 2. Annotation Creation Pipeline  
```
User mouse events → Drawing overlay → Prompt for label → Create annotation object → Update visual + data
```

- **Mouse Events**: `mousedown` → `mousemove` → `mouseup` sequence
- **Visual Feedback**: Real-time box drawing during mouse drag
- **Data Storage**: Annotation object with fractional coordinates
- **Side Effects**: Updates annotation list, adds resize/drag functionality

#### 3. Interactive Editing System
- **Selection State**: Global variables track currently selected annotation
- **Resize Handles**: 8 handles (corners + edges) added to selected annotations  
- **Visual Feedback**: Blue border for selected, red for unselected
- **Coordinate Updates**: Real-time fractional coordinate updates during resize/drag

#### 4. Annotation Management
- **Reactive UI**: List automatically rebuilds when annotations change
- **Organization**: Annotations grouped by page number
- **Interactions**: Click to select, hover to highlight, delete buttons
- **Bulk Operations**: "Clear All" with confirmation dialog

#### 5. Serialization System
- **Save Format**: JSON with metadata + annotations grouped by page
- **Load Process**: Validation → data extraction → visual rendering
- **Filename Convention**: Uses original PDF filename with `.json` extension

### State Management

#### Global State Variables
```typescript
let annotations: Annotation[] = [];           // Master annotation data
let selectedAnnotation: HTMLDivElement | null = null;  // Currently selected DOM element
let selectedAnnotationData: Annotation | null = null;  // Currently selected data
let isResizing: boolean = false;              // Resize operation state
let isDragging: boolean = false;              // Drag operation state
```

#### Data Flow
1. **User Action** → **Event Handler** → **State Update** → **DOM Update** → **List Update**
2. All state changes trigger `updateAnnotationList()` to keep UI in sync
3. Coordinate conversions happen at interaction boundaries (user input → data storage)

### Key Design Patterns

#### Fractional Coordinate System
```typescript
// All stored coordinates are 0.0-1.0 fractions of page dimensions
interface Annotation {
  x: number;      // 0.0 = left edge, 1.0 = right edge  
  y: number;      // 0.0 = top edge, 1.0 = bottom edge
  width: number;  // fraction of page width
  height: number; // fraction of page height
}

// Conversion happens at interaction boundaries:
// User pixels → Fractional (for storage)
// Fractional → User pixels (for display)
```

#### Event-Driven Architecture
- **DOM Events**: Mouse interactions, file uploads, button clicks
- **Custom Events**: Selection changes, annotation updates
- **Side Effects**: Managed through dedicated update functions

#### Separation of Concerns
- **Data Layer**: Annotation objects with fractional coordinates
- **Presentation Layer**: DOM elements with pixel coordinates  
- **Interaction Layer**: Event handlers for user input
- **Persistence Layer**: JSON serialization/deserialization

### Performance Considerations

#### DOM Management
- **Annotation Boxes**: Created once, reused for lifetime of annotation
- **Resize Handles**: Added/removed dynamically based on selection state
- **List Updates**: Full rebuild on changes (acceptable for expected annotation counts)

#### Coordinate Calculations
- **Conversion Math**: Simple multiplication/division operations
- **Caching**: Page dimensions cached during rendering
- **Real-time Updates**: Calculations during mouse move events (optimized for 60fps)

#### Memory Management
- **Event Listeners**: Properly cleaned up when annotations deleted
- **DOM References**: Cleared when annotations removed
- **File Handling**: Large PDF files processed incrementally by PDF.js

### Error Handling Strategy

#### User-Facing Errors
- **File Upload**: Validation with user-friendly messages
- **JSON Loading**: Parse errors caught and displayed
- **PDF Rendering**: PDF.js errors logged and gracefully handled

#### Developer Errors  
- **Type Safety**: TypeScript catches most issues at compile time
- **Console Logging**: Detailed logging for debugging
- **Test Coverage**: Playwright tests catch runtime issues

### Extension Points

#### Adding New Annotation Types
1. Extend `Annotation` interface with new properties
2. Update serialization format (increment version number)
3. Add new interaction handlers in `makeAnnotationInteractive()`
4. Update annotation list display in `updateAnnotationList()`

#### Adding New File Formats
1. Create new serialization functions following existing pattern
2. Add format detection logic
3. Update file input accept attributes
4. Add tests for new format

#### Adding Viewer Functionality
1. Implement `src/viewer.ts` following annotator patterns
2. Focus on read-only display of existing annotations
3. Reuse coordinate conversion and rendering logic
4. Add viewer-specific tests

### Testing Strategy

#### Browser Automation (Playwright)
- **Real Environment**: Tests run in actual browsers against real HTML
- **User Scenarios**: Tests simulate actual user workflows
- **Error Detection**: Tests catch JavaScript console errors
- **Cross-Browser**: Can be configured for multiple browser engines

#### Test Organization
- **Basic Functionality**: PDF loading, annotation creation, UI presence
- **Interactive Features**: Resize/drag functionality, selection
- **Data Integrity**: Save/load workflows, coordinate conversion
- **Error Handling**: Invalid inputs, edge cases

#### Continuous Integration Ready
- **Headless Mode**: Tests run without GUI for CI/CD
- **Fast Execution**: Optimized for quick feedback cycles  
- **Reliable**: Tests designed to minimize flakiness