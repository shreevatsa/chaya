# bookchop

`bookchop` is a client-side web tool for annotating regions in PDF documents and viewing them.

## Features

### Annotator (`annotator.html`)
- **PDF Upload & Rendering**: Load any PDF file for annotation using PDF.js
- **Interactive Annotation Creation**: Draw bounding boxes by clicking and dragging
- **AI-Assisted Annotation**: Use Gemini API to automatically generate annotations with customizable prompts
- **Resizable & Movable Annotations**: Select annotations to resize (8 handles) or drag to reposition
- **Annotation Management**: 
  - Sidebar showing all annotations organized by page
  - Click annotations in list to select and scroll to them on PDF
  - Bidirectional hover highlighting between PDF and sidebar
  - Individual delete buttons for each annotation
- **Label Editing**: Double-click annotations to edit labels
- **Save/Load Workflow**: Save annotations as JSON files and reload them for further editing
- **Resolution Independence**: All coordinates stored as fractions for consistent display

### Viewer (`viewer.html`)
- **Cropped Region Display**: Extract and display only the annotated regions from PDFs
- **Navigation**: Quick navigation between annotation regions with hover highlighting
- **Annotation Summary**: Overview of all loaded annotations with click-to-scroll functionality

## Quick Start

1. **Build the project**:
   ```bash
   npm install
   npm run build
   ```

2. **Run tests**:
   ```bash
   npm test
   ```

3. **Open `annotator.html`** in your browser and start annotating!

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

**AI Features:**
- **Few-shot Learning**: AI learns from your existing annotations on other pages
- **Customizable Prompts**: Tailor the AI behavior for different document types
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

### Using the Viewer
1. Open `viewer.html` in your browser
2. Upload both a PDF file and its corresponding annotations JSON file
3. Click "Load and View" to extract annotated regions
4. Use the navigation buttons to jump between regions
5. Hover over navigation buttons to highlight regions

### Annotation List Features
- **Navigation**: Click any annotation in the list to select and scroll to it
- **Bidirectional Highlighting**: Hover over list items to highlight PDF annotations and vice versa
- **Organization**: Annotations grouped by page number
- **Position Info**: Each annotation shows its relative position as percentages
- **Auto-selection**: Newly created annotations are automatically selected for immediate editing

## Core Architecture

**This project is designed with simplicity and maintainability as primary goals.** It follows a client-side-only architecture, meaning it does not require a backend server and can be hosted on any static web hosting service (e.g., GitHub Pages, Cloudflare Pages).

**Design Principles**:
- **Zero Backend Dependencies**: Everything runs in the browser using modern web APIs
- **Static Hosting**: Deploy anywhere that serves static files
- **Self-Contained**: All processing happens client-side using PDF.js

**Technology Stack**:
- **PDF.js** (via CDN): PDF rendering and manipulation
- **TypeScript**: Type-safe development  
- **Tailwind CSS**: Utility-first styling
- **Playwright**: Browser automation testing
- **Gemini API**: AI-powered annotation generation

## Data Format (`annotations.json`)

The "contract" between the annotator and the viewer is the `annotations.json` file. This file stores the user-generated data.

### Structure

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
        "label": "heading: Chapter 1"
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
bookchop/
├── src/
│   ├── annotator.ts      # Main annotation functionality
│   ├── viewer.ts         # Cropped region viewer
│   ├── ai-engine.ts      # Headless AI annotation engine
│   ├── ai-orchestrator.ts # Browser-AI integration layer
│   ├── pdf-utils.ts      # Shared PDF.js utilities
│   ├── pdf.d.ts          # TypeScript declarations
│   └── input.css         # Tailwind CSS input
├── tests/
│   └── basic.spec.ts     # Playwright browser tests
├── dist/                 # Built JavaScript and CSS
├── annotator.html        # Annotation interface
├── viewer.html           # Viewer interface
└── test.pdf              # Sample PDF for testing
```

### Key Scripts
- `npm run build` - Compile TypeScript and build CSS
- `npm test` - Run Playwright tests in headless mode  
- `npm run test:headed` - Run tests with browser UI visible
- `npm run test:ui` - Run tests with Playwright's test runner UI

### Code Organization

#### Core Modules
1. **Annotator** (`src/annotator.ts`): Main annotation interface with PDF rendering, interactive creation, editing, and management
2. **Viewer** (`src/viewer.ts`): Cropped region extraction and display for annotation review
3. **AI Engine** (`src/ai-engine.ts`): Headless AI annotation service with pluggable engine architecture
4. **AI Orchestrator** (`src/ai-orchestrator.ts`): Browser integration layer handling prompts, API keys, and few-shot examples
5. **PDF Utils** (`src/pdf-utils.ts`): Shared utilities for PDF.js initialization and annotation parsing

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
