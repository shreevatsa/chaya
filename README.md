# Chaya

**Chaya** is an application for digitizing scanned books, i.e. to “transcribe” a PDF file into paragraphs (etc.) that remain associated with regions of the original pages. I think of it as "OCR without OCR", or "OCR for people who don't trust OCR" ("verifiable OCR").

It is designed for (scanned) PDFs that are mostly lines of text (paragraphs, headings, verses, footnotes: not illustrations, math, tables, forms).

The workflow is to upload a PDF, mark regions on each page (optionally assisted by AI), then name and re-order these regions, optionally running OCR on them. The result can be saved to a `.chaya` file, which can at any time be opened again in the application for reading or editing. (TODO #23: or exported to other formats)

Chaya is a client-side web application, with no backend dependencies (except the optional API providers for OCR and AI assistance).

## Data format

A `.chaya` file is a package (a ZIP file) containing (the original PDF) + (marked regions) + metadata.

All coordinates are stored as fractions (numbers between 0.0 and 1.0) of the PDF page's width and height, for consistent display.

## UI details

- Upload and download happens via the same two buttons (one for `.chaya` files and one for `.pdf` files): click one of them to upload, work on the doc, then click one of them to download. So this can be used in various ways:
  - Upload a PDF file, to start a new project.
  - Download a `.chaya` package.
  - Upload a `.chaya` file, to continue or edit an existing project.
  - Upload a `.chaya` file and download the `.pdf` file from it.

### Mark workspace

- Interactively draw bounding boxes by clicking and dragging on PDF pages. 
  - Double click on a bounding box to give it a name (label).
  - Handles to drag (reposition) or resize these regions.

- Sidebar showing all marked regions, organized by page
  - Bidirectional hover highlighting between PDF and sidebar
  - Click on a region to select and scroll to it
  - Click on a delete symbol to delete a marked region

- AI-assisted regions:
  - Optionally can use OCR+LLM (Google Cloud Vision + Gemini) to automatically draw bounding boxes on up to 5 pages at once. (The OCR is used to get precise word-level bounding boxes; seems to make a big difference in quality.)
  - Few-shot learning from previously marked pages.
  - Can also get types and OCR text here (TODO #29).

### Future work
- Rich text editing to structure and order marked regions.
- OCR and text correction workflows integrated with the saved regions.
- Presentation-oriented views for reading the annotated document.

-------

**(Text below this line is not yet human-verified.)**

-------

## Quick Start

1. **Build the project**:
   ```sh
   npm install
   npm run build
   ```

2. **Run tests**:
   ```sh
   npm test
   ```

3. **Open `index.html`** in your browser and start using Chaya!

## Usage Guide

### Creating Annotations

#### Manual Annotation
1. Upload a PDF file using the file input
2. Click and drag on the PDF to create annotation boxes
3. Enter a label when prompted
4. Use the annotation management sidebar to review, select, and organize annotations

#### AI-Assisted Annotation
1. Upload a PDF file and optionally load existing annotations
2. Click the "🤖 AI Annotate" button on any page
3. Enter a custom prompt (or use the default) describing what to annotate
4. Provide your Gemini API key when prompted (stored locally for session)
5. AI will analyze the page and generate annotations automatically
6. Review and edit the generated annotations as needed

**Advanced AI Features**
- **Multi-page Processing**: Annotate up to 5 pages simultaneously
- **Dual API Integration**: Combines Gemini AI with Google Vision OCR
- **Word-level Precision**: Uses OCR data to generate pixel-accurate bounding boxes
- **Few-shot Learning**: AI learns from your existing annotations on other pages
- **Semantic Understanding**: Generates semantic types and descriptive labels
- **Smart Integration**: New AI annotations appear in sidebar and are fully interactive

### Editing Annotations  
- **Select**: Click an annotation to show resize handles and highlight it
- **Resize**: Drag any of the 8 resize handles (corners and edges)
- **Move**: Click and drag the annotation box itself
- **Edit Label**: Double-click an annotation to change its label
- **Delete**: Use the red 'X' button in the annotation list to remove individual annotations

### Saving & Loading
- **Save**: Click "Save Annotations" to download a JSON file named after your PDF
- **Load**: Use "Load Existing Annotations" to continue editing previously saved work

### Complete Workflow
1. Open `index.html` in your browser
2. Upload a PDF file or .chaya package
3. Use the Mark workspace to mark regions manually or with AI assistance
4. **Review**: Reopen the saved `.chaya` package at any time to continue marking or export data
5. **Download**: Use the two-slot interface to download complete `.chaya` packages or original PDFs

### Annotation List Features
- **Navigation**: Click any annotation in the list to select and scroll to it
- **Bidirectional Highlighting**: Hover over list items to highlight PDF annotations and vice versa
- **Organization**: Annotations grouped by page number
- **Position Info**: Each annotation shows its relative position as percentages
- **Auto-selection**: Newly created annotations are automatically selected for immediate editing

## Architecture

**This project is designed with simplicity and maintainability as primary goals.** It follows a client-side-only architecture, meaning it does not require a backend server and can be hosted on any static web hosting service (e.g., GitHub Pages, Cloudflare Pages).

**Core Principles**:
- **Zero Backend Dependencies**: Everything runs in the browser using modern web APIs
- **Static Hosting Ready**: Deploy anywhere that serves static files
- **Self-Contained Packages**: .chaya files contain everything needed to view documents
- **Production-Ready**: Comprehensive error handling, loading states, and user feedback

**Technology Stack**:
- **PDF.js** (via CDN): PDF rendering and manipulation
- **JSZip** (via CDN): .chaya file packaging and extraction
- **TypeScript**: Type-safe development with comprehensive interfaces
- **Tailwind CSS**: Utility-first styling for responsive design
- **Playwright**: Browser automation testing
- **Gemini API**: Advanced AI-powered annotation generation
- **Google Vision API**: Precise OCR and word-level text detection

**Key Features**:
- **Event-Driven Architecture**: Custom events coordinate annotation updates within the workspace
- **Centralized State Management**: `ChayaApp` class manages application state
- **Progressive Loading**: Detailed progress indicators with status updates
- **Error Recovery**: Comprehensive error handling throughout the application

## Data Format (`.chaya` files)

Chaya uses `.chaya` files (ZIP archives) as complete document packages containing:
- **Original PDF**: Raw binary data with zero encoding overhead
- **Annotations**: JSON data with fractional coordinates and metadata
- **Manifest**: Version info, creation timestamps, and format metadata

### .chaya Package Structure
```
document.chaya (ZIP file)
├── manifest.json      # Metadata and version info
├── document.pdf       # Original PDF (raw binary)
└── annotations.json   # Annotation data with enhanced features
```

### Enhanced Annotation Data Structure

```json
{
  "metadata": {
    "sourcePdf": "my-book.pdf",
    "annotationVersion": "1.1",
    "annotatedAt": "2025-06-25T10:30:00Z"
  },
  "annotationsByPage": {
    "1": [
      {
        "id": "c7b7f8a0-8e7e-4b9a-8e1a-6a2b3c4d5e6f",
        "x": 0.105,
        "y": 0.152,
        "width": 0.800,
        "height": 0.085,
        "label": "heading: Chapter 1",
        "semanticType": "title",
        "wordIndices": [0, 1, 2],
        "ocrText": "Chapter 1 Introduction"
      }
    ]
  }
}
```

### Design Decisions

*   **Coordinates as Fractions**: All positional and dimensional values (`x`, `y`, `width`, `height`) are fractions of the page's dimensions (i.e., numbers between 0.0 and 1.0). This makes the annotations resolution-independent.
*   **Simple String Labels**: The `label` is an unopinionated string. Any logic for parsing its meaning (e.g., `"p:1"` for "paragraph 1") resides within the application, not the data format.
*   **Spanning Regions**: Logical regions that span multiple pages (e.g., a paragraph that breaks across a page boundary) are represented by multiple annotation boxes that share the **exact same `label`**.
*   **Associated Regions**: Relationships between different regions (e.g., a paragraph and its endnote) are handled by a consistent labeling convention (e.g., `p:12` and `endnote:12`).

## Development

### Project Structure
```
chaya/
├── src/
│   ├── app.ts            # Main application entry point
│   ├── modes/
│   │   ├── annotator.ts  # Mark tab functionality
│   │   └── viewer.ts     # Read tab functionality
│   ├── ai-engine.ts      # Headless AI annotation engine
│   ├── ai-orchestrator.ts # Browser-AI integration layer
│   ├── pdf-utils.ts      # Shared PDF.js utilities
│   ├── pdf.d.ts          # TypeScript declarations
│   └── input.css         # Tailwind CSS input
├── tests/
│   └── basic.spec.ts     # Playwright browser tests
├── dist/                 # Built JavaScript and CSS
├── index.html            # Main application interface
└── test.pdf              # Sample PDF for testing
```

### Key Scripts
- `npm run build` - Compile TypeScript and build CSS
- `npm test` - Run Playwright tests in headless mode  
- `npm run test:headed` - Run tests with browser UI visible
- `npm run test:ui` - Run tests with Playwright's test runner UI

### Implementation Status
- ✅ **Two-slot upload/download interface** with dynamic mode switching
- ✅ **Complete .chaya file format** with ZIP packaging and manifest
- ✅ **Advanced AI annotation** with multi-page processing and dual APIs
- ✅ **Interactive annotation tools** with 8-handle resize and drag
- ✅ **Bidirectional highlighting system** between PDF and sidebar
- ✅ **Production-ready features** including error handling and loading states
- ✅ **Event-driven tab communication** with centralized state management
- ✅ **Word-level OCR integration** for precise bounding box generation

### Code Organization

#### Core Modules
1. **App** (`src/app.ts`): 
   - Centralized application state management
   - Two-slot upload/download interface
   - Tab switching and data coordination
   - .chaya file packaging and extraction
   - Progress tracking and error handling

2. **Annotator** (`src/modes/annotator.ts`): 
   - Interactive PDF annotation creation
   - 8-handle resize and drag functionality
   - Bidirectional highlighting system
   - AI-assisted annotation integration
   - Auto-selection and visual feedback

3. **Viewer** (`src/modes/viewer.ts`): 
   - Cropped region extraction and display
   - Navigation with hover highlighting
   - Annotation summary interface

4. **AI Engine** (`src/ai-engine.ts`): 
   - Headless AI annotation service
   - Pluggable engine architecture
   - JSON response parsing with fallbacks
   - Multi-round annotation processing

5. **AI Orchestrator** (`src/ai-orchestrator.ts`): 
   - Multi-page processing coordination
   - Dual API integration (Gemini + Google Vision)
   - Word-level OCR data transformation
   - Few-shot example generation
   - Precise bounding box calculation

6. **PDF Utils** (`src/pdf-utils.ts`): 
   - PDF.js initialization and worker setup
   - Annotation parsing with enhanced features
   - Shared type definitions and utilities

#### Key Systems
- **PDF Rendering**: Canvas-based rendering with annotation overlay layers
- **Coordinate System**: Fractional coordinates (0.0-1.0) for resolution independence
- **Interactive Editing**: Resize handles, drag functionality, selection management
- **AI Integration**: Pluggable engine architecture with few-shot learning
- **Data Persistence**: JSON serialization with metadata and validation

### Testing
Tests use Playwright for browser automation and cover:
- PDF loading and rendering
- Annotation creation and interaction  
- Error handling and edge cases
- UI component functionality

All tests run against the actual HTML files to ensure real-world compatibility.

### Future Refactoring Opportunities
Following Ousterhout's "deep modules" philosophy, potential areas for clean separation:
- **Coordinate System**: Pure math functions for coordinate conversion
- **Annotation Serialization**: JSON import/export with validation  
- **PDF Page Management**: Abstraction over PDF.js complexity
