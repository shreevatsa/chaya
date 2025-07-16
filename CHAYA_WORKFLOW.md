# Chaya Document Processing Workflow

## Overview
Chaya is a comprehensive document digitization pipeline that transforms PDFs into rich, structured digital documents. It uses a three-tab workflow (Mark, Edit, Read) where users progressively enhance documents while maintaining full bidirectional traceability between original and processed content.

## Core Philosophy

### **Progressive Enhancement**
- Start with raw PDF
- Add spatial structure (regions)
- Add textual content (OCR + rich editing)
- Create beautiful presentation layer
- Never lose connection to original source

### **Bidirectional Fidelity**
Every piece of enhanced content maintains a link to its original PDF location, allowing users to toggle between "original" and "enhanced" views at any granularity.

## Three-Tab Workflow

### **Tab 1: Mark** 
**Purpose**: Define spatial regions and semantic structure

**Interface**: PDF viewer with annotation overlay
- Upload PDF or existing .chaya file
- Draw bounding boxes around content regions
- Assign semantic types (title, paragraph, verse, footnote, etc.)
- AI-assisted region detection
- Visual indicators for different content types

**Output**: Spatial layout data with semantic classification

### **Tab 2: Edit**
**Purpose**: Extract and enhance textual content

**Interface**: ProseMirror rich text editor with region references
- Auto-OCR each marked region
- Rich text editing with full ProseMirror capabilities  
- Structured markup (headings, emphasis, links, etc.)
- Region-aware editing where text spans reference original PDF regions
- Document assembly and organization

**Key Innovation**: Text contains embedded `<region>` references:
```html
<h1><region id="region1">Chapter 1</region></h1>
<p><region id="region2">In the beginning</region> <region id="region3">was the word...</region></p>
```

**Output**: Rich structured document with preserved region mappings

### **Tab 3: Read**
**Purpose**: Beautiful presentation with source traceability

**Interface**: Clean reading experience with toggle capabilities
- Rendered document with professional typography
- Each region can toggle between "enhanced" and "original" views
- Export to HTML, PDF, or other formats
- Navigation aids and document outline
- Seamless switching between processed text and source images

**Unique Feature**: Granular original/enhanced toggling - any piece of text can instantly show its original PDF appearance for verification or preference.

## Data Architecture

### **Single JSON Document with Separation of Concerns**
```json
{
  "version": "2.0",
  "metadata": {
    "sourcePdf": "document.pdf",
    "createdAt": "2025-07-16T10:00:00Z",
    "lastEditedAt": "2025-07-16T11:30:00Z"
  },
  
  // Spatial/layout data (Mark tab)
  "regions": [
    {
      "id": "region1",
      "pageNumber": 1,
      "x": 0.1, "y": 0.2, "width": 0.8, "height": 0.1,
      "semanticType": "title",
      "label": "Chapter heading"
    }
  ],
  
  // Textual/content data (Edit tab)
  "content": {
    "prosemirrorDoc": {
      "type": "doc",
      "content": [
        {
          "type": "heading",
          "attrs": { "level": 1 },
          "content": [
            {
              "type": "text",
              "text": "Chapter 1",
              "marks": [{ 
                "type": "region", 
                "attrs": { "regionId": "region1" } 
              }]
            }
          ]
        }
      ]
    }
  }
}
```

### **Data Evolution Through Workflow**
1. **Mark stage**: Only `regions[]` exists
2. **Edit stage**: Add `content.prosemirrorDoc` with region references
3. **Read stage**: Render content with toggle capabilities

## Technical Architecture

### **Single HTML Application**
```html
<!DOCTYPE html>
<html>
<head>
    <title>Chaya - Document Processing</title>
</head>
<body>
    <!-- Tab Navigation -->
    <nav class="tabs">
        <button data-tab="mark">Mark</button>
        <button data-tab="edit">Edit</button>
        <button data-tab="read">Read</button>
    </nav>
    
    <!-- Tab Content Areas -->
    <div id="mark-tab" class="tab-content"><!-- PDF annotation interface --></div>
    <div id="edit-tab" class="tab-content"><!-- ProseMirror editor --></div>
    <div id="read-tab" class="tab-content"><!-- Presentation view --></div>
</body>
</html>
```

### **ProseMirror Integration**
Custom schema with region marks:
```typescript
const regionMark = {
  attrs: { regionId: { default: null } },
  parseDOM: [{ 
    tag: "region", 
    getAttrs: (node) => ({ regionId: node.getAttribute("id") }) 
  }],
  toDOM: (mark) => ["region", { id: mark.attrs.regionId }, 0]
};
```

### **Shared State Management**
```typescript
class ChayaDocument {
  private regions: Region[] = [];
  private content: ProseMirrorDoc | null = null;
  
  // Coordinate between tabs
  switchToTab(tab: string) {
    this.saveCurrentState();
    this.loadTabData(tab);
    this.updateUI(tab);
  }
  
  // Bidirectional region mapping
  highlightRegion(regionId: string) {
    this.markTab.highlightPDFRegion(regionId);
    this.editTab.focusRegionInEditor(regionId);
    this.readTab.scrollToRegion(regionId);
  }
}
```

## .chaya File Format

### **Self-Contained ZIP Package**
```
document.chaya (ZIP file)
├── manifest.json      # Metadata and version info
├── document.pdf       # Original PDF (raw binary)
├── content.json       # Regions + ProseMirror content
└── app/               # Bundled application (future)
    ├── index.html
    ├── app.js
    └── app.css
```

### **Benefits**
- **Portability**: Single file contains everything
- **Shareability**: Email/cloud sharing preserves full document
- **Offline capability**: Self-contained with embedded app
- **Version control**: Track document evolution
- **Tool interoperability**: ZIP format works with existing tools

## User Experience Flows

### **Primary Workflow**
```
Upload PDF → Mark regions → Edit content → Read result
     ↓            ↓             ↓           ↓
Raw input → Spatial data → Rich content → Presentation
```

### **Flexible Navigation**
- Users can switch tabs at any time
- Progress persists across tab switches
- Can skip Edit tab for quick mark→read workflow
- Can return to Mark tab to add more regions

### **Toggle Feature in Read Tab**
```
[Enhanced View]              [Original View]
Chapter One                  [PDF crop image]
============                 showing original
                            scanned text
When I was young...         [PDF crop image]
                            of handwritten
[📷 Show Original]          [✨ Show Enhanced]
```

## Semantic Types

### **Content Categories**
- **title** - Document/section titles
- **heading** - Section headings  
- **paragraph** - Regular prose
- **verse** - Poetry, lyrics, scripture
- **chorus** - Repeated refrains
- **quote** - Quoted material

### **Metadata Categories**
- **annotation** - Commentary or notes
- **footnote** - Reference material
- **page_number** - Page numbering
- **author** - Attribution
- **date** - Temporal information
- **caption** - Image/figure descriptions

### **Visual Indicators**
- 📝 Titles (prominent styling)
- 📄 Paragraphs (body text styling)
- 🎵 Verses (poetic formatting)
- 📖 Annotations (secondary text)
- 🔢 Page numbers (minimal styling)

## Implementation Phases

### **Phase 1: Basic Tab Structure**
- Create unified HTML with three tabs
- Basic tab switching with state persistence
- Mark tab: Current annotator functionality
- Edit tab: Placeholder ("Coming soon")
- Read tab: Enhanced viewer functionality

### **Phase 2: Semantic Types**
- Add semantic type selection to Mark tab
- Visual indicators for different types
- Enhanced data format with semanticType field

### **Phase 3: ProseMirror Integration**
- Build Edit tab with rich text editor
- Implement region mark system
- Auto-populate from OCR
- Bidirectional region highlighting

### **Phase 4: Enhanced Read Experience**
- Original/enhanced toggle functionality
- Export capabilities
- Professional presentation styling

### **Phase 5: .chaya Format**
- ZIP-based file format
- Self-contained document packages
- Application bundling and embedding

## Key Innovations

### **Living Documents**
Documents exist in multiple states simultaneously - users can see original scan, intermediate processing, and final enhanced version of any content piece.

### **Granular Traceability**
Unlike traditional OCR tools that lose source connection, Chaya maintains pixel-perfect bidirectional mapping between enhanced content and original source.

### **Progressive Workflow**
Three-stage process matches natural document digitization workflow while allowing flexible navigation and iterative refinement.

### **Rich Structure Preservation**
ProseMirror integration allows full semantic markup (headings, emphasis, links, etc.) while maintaining source region references.

This architecture creates a sophisticated document digitization platform that bridges the gap between raw scanned material and rich digital content while preserving complete provenance and user control.