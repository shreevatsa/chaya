# Architecture Documentation

## Code Organization and Key Concepts

### Main Components

#### 1. Unified Application Structure
- **Entry Point**: `index.html` for upload/download interface and tab-based navigation
- **App Orchestration**: `ChayaApp` class in `src/app.ts` manages all application state and coordination
- **Dependencies**: PDF.js, JSZip (both loaded via CDN)
- **Key Concepts**:
  - Single HTML file with three functional tabs
  - Event-driven communication between tabs with custom events
  - Complete .chaya file packaging with ZIP format
  - Centralized state management with progress tracking
  - Fractional coordinate system (0.0-1.0) for resolution independence

#### 2. PDF Rendering System
- **Implementation**: Shared across Mark and Read tabs
- **Key Concepts**:
  - Each PDF page becomes a `<div class="page">` container
  - Canvas element for PDF rendering
  - Annotation overlay layer for interactive elements (Mark tab)
  - AI annotation button per page (Mark tab)
  - Cropped region extraction (Read tab)

#### 2. Annotation Creation Pipeline  
```
Manual: User mouse events → Drawing overlay → Prompt for label → Create annotation object → Update visual + data
AI: User clicks AI button → Prompt dialog → API call → Parse response → Create annotations → Update UI
```

- **Manual Creation**:
  - **Mouse Events**: `mousedown` → `mousemove` → `mouseup` sequence
  - **Visual Feedback**: Real-time box drawing during mouse drag
  - **Data Storage**: Annotation object with fractional coordinates
  - **Auto-selection**: Newly created annotations automatically selected for editing

- **AI-Assisted Creation**:
  - **User Prompt**: Customizable instruction for AI annotation behavior
  - **Few-shot Learning**: AI learns from existing annotations on other pages
  - **API Integration**: Gemini API with structured JSON response format
  - **Batch Creation**: Multiple annotations generated and rendered simultaneously

#### 3. Interactive Editing System
- **Selection State**: Global variables track currently selected annotation
- **Resize Handles**: 8 handles (corners + edges) added to selected annotations  
- **Visual Feedback**: Blue border for selected, red for unselected
- **Coordinate Updates**: Real-time fractional coordinate updates during resize/drag
- **Label Editing**: Double-click to edit annotation labels
- **Bidirectional Highlighting**: Hover effects between PDF and sidebar

#### 4. Tab Management System
- **Tab Navigation**: Three tabs (Mark, Edit, Read) with unified interface
- **Data Flow**: Events coordinate data sharing between tabs
- **State Management**: Each tab maintains its own state while sharing document data
- **Mark Tab**: Annotation creation and editing
- **Edit Tab**: OCR and text correction (coming soon)
- **Read Tab**: Presentation and review of annotated regions

#### 5. Annotation Management
- **Reactive UI**: List automatically rebuilds when annotations change
- **Organization**: Annotations grouped by page number
- **Interactions**: Click to select, hover to highlight, delete buttons
- **Navigation**: Click sidebar items to scroll to annotations
- **Individual Operations**: Delete buttons for removing specific annotations

#### 6. AI Engine Architecture
- **Pluggable Design**: Abstract `AIEngine` interface allows different AI providers
- **Current Implementation**: `GeminiEngine` with Google Gemini API
- **Multi-page Processing**: Handles up to 5 pages simultaneously
- **Request Structure**: Base64 images, enhanced prompts with OCR data, few-shot examples
- **Response Parsing**: Structured JSON with coordinate transformation and fallback parsing
- **Error Handling**: User-friendly error messages and retry logic

#### 7. AI Orchestrator
- **Browser Integration**: Bridges UI interactions with headless AI engine
- **Dual API Integration**: Coordinates Gemini AI with Google Vision OCR
- **Multi-page Coordination**: Processes up to 5 pages with shared context
- **Word-level OCR**: Transforms Vision API data for precise bounding box generation
- **State Management**: API key persistence, prompt dialogs, loading states
- **Few-shot Examples**: Automatically gathers examples from previously annotated pages
- **Coordinate Transformation**: Converts between different coordinate systems (pixels, fractions, normalized)
- **Enhanced Annotations**: Generates semantic types, word indices, and OCR text

#### 8. Read Tab (Viewer System)
- **Cropped Extraction**: `extractAnnotationRegion()` creates canvas crops of annotations
- **Region Display**: Shows only annotated portions with labels and page info
- **Navigation**: Quick-jump buttons with hover highlighting
- **Integration**: Shares data with Mark tab through unified document loading

#### 9. Serialization System
- **Save Format**: .chaya files (ZIP archives) containing PDF, JSON annotations, and manifest
- **Load Process**: ZIP extraction → validation → data extraction → visual rendering
- **Manifest Structure**: Version info, creation timestamps, original filename
- **Development Support**: Automatic `.chaya.zip` extension for localhost development
- **MIME Type Handling**: Proper `application/zip` content type for browser compatibility
- **Error Recovery**: Comprehensive validation with user-friendly error messages
- **Shared Utilities**: `pdf-utils.ts` provides parsing and validation functions

### State Management

#### Application State
```typescript
// ChayaApp class state (src/app.ts)
interface AppState {
    currentTab: 'mark' | 'edit' | 'read';       // Active tab
    documentLoaded: boolean;                    // Document upload status
    pdfFile: File | null;                      // Uploaded PDF file
    loadedAnnotations: SharedAnnotation[];     // Shared annotation data
    pdfDocument: any | null;                   // PDF.js document object
    hasUnsavedChanges: boolean;                // Change tracking
}

// Mark tab state (src/modes/annotator.ts)
let annotations: Annotation[] = [];                    // Master annotation data
let selectedAnnotation: HTMLDivElement | null = null; // Currently selected DOM element
let selectedAnnotationData: Annotation | null = null; // Currently selected data
let isResizing: boolean = false;                      // Resize operation state
let isDragging: boolean = false;                      // Drag operation state
let hasUnsavedChanges: boolean = false;               // Local change tracking

// Read tab state (src/modes/viewer.ts)
let loadedAnnotations: Annotation[] = [];             // Local copy for display
```

#### Data Flow
1. **User Action** → **Event Handler** → **State Update** → **DOM Update** → **List Update**
2. **Tab Communication**: Custom events (`markTabDataReady`, `readTabDataReady`, `documentSaved`) coordinate data sharing
3. **State Synchronization**: `updateAnnotations()` for changes vs `syncAnnotations()` for routine updates
4. **Progress Tracking**: Detailed loading states with percentage and status messages
5. **Error Handling**: Comprehensive error recovery with user-friendly messages
6. Coordinate conversions happen at interaction boundaries (user input → data storage)

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
- **AI Layer**: Pluggable engine architecture with orchestration
- **Persistence Layer**: JSON serialization/deserialization
- **Utility Layer**: Shared PDF.js and coordinate utilities

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
- **AI Resources**: Base64 images and API responses cleaned up after processing

### Error Handling Strategy

#### User-Facing Errors
- **File Upload**: Validation with user-friendly messages
- **JSON Loading**: Parse errors caught and displayed
- **PDF Rendering**: PDF.js errors logged and gracefully handled
- **AI Failures**: API errors, network issues, and parsing failures handled gracefully
- **API Key Management**: Clear prompts for missing or invalid API keys

#### Developer Errors  
- **Type Safety**: TypeScript catches most issues at compile time
- **Console Logging**: Detailed logging for debugging
- **Test Coverage**: Playwright tests catch runtime issues

#### 10. Two-Slot Interface System
- **Dynamic Mode Switching**: Upload mode ↔ Download mode based on document state
- **File Input Preservation**: Maintains DOM elements during UI updates
- **Event Coordination**: Proper event listener management with re-attachment
- **Visual Feedback**: Clear indication of available actions (upload vs download)
- **Seamless Workflow**: Upload → Annotate → Download complete packages

### Extension Points

#### Adding New Tabs
1. Create new mode file in `src/modes/` directory
2. Add tab UI elements to `index.html`
3. Register tab in `src/app.ts` tab management system
4. Implement data sharing events if needed

#### Adding New File Formats
1. Create new serialization functions following existing pattern
2. Add format detection logic
3. Update file input accept attributes
4. Add tests for new format

#### Adding New AI Engines
1. Implement `AIEngine` interface in new engine class
2. Add engine-specific configuration and error handling
3. Update orchestrator to support engine selection
4. Add tests for new engine integration

#### Adding New AI Features
1. Extend `AIAnnotationRequest` interface for new capabilities
2. Update orchestrator prompt handling and example generation
3. Modify response parsing for new annotation types
4. Add UI controls for new features

### Testing Strategy

#### Browser Automation (Playwright)
- **Real Environment**: Tests run in actual browsers against real HTML
- **User Scenarios**: Tests simulate actual user workflows
- **Error Detection**: Tests catch JavaScript console errors
- **Cross-Browser**: Can be configured for multiple browser engines

#### Test Organization
- **Basic Functionality**: PDF loading, annotation creation, UI presence, tab switching
- **Interactive Features**: Resize/drag functionality, selection, tab navigation
- **Data Integrity**: Save/load workflows, coordinate conversion, .chaya file handling
- **Error Handling**: Invalid inputs, edge cases, tab communication failures

#### Continuous Integration Ready
- **Headless Mode**: Tests run without GUI for CI/CD
- **Fast Execution**: Optimized for quick feedback cycles  
- **Reliable**: Tests designed to minimize flakiness
