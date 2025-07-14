# Three-Mode Document Processing Workflow

## Overview
Evolution of Bookchop from a simple annotation tool into a comprehensive document digitization pipeline with three distinct modes for processing documents from raw PDF to polished HTML presentation.

## Application Modes

### **Mode 1: Region Marking & Classification**
**Purpose**: Spatial layout and semantic meaning  
**Current State**: Enhanced version of `annotator.html`

#### Functionality:
- Upload PDF or existing .chaya file
- Draw regions on PDF pages
- Assign semantic types to regions (verse, chorus, title, annotation, etc.)
- AI-assisted region detection
- Focus purely on "What is this region and where?"

#### UI Layout:
```
┌─ PDF Viewer ─────────┐  ┌─ Regions Sidebar ─────┐
│ [Region boxes with   │  │ ☐ Page 1              │
│  visual indicators   │  │   📝 Title            │
│  for different       │  │   🎵 Verse 1          │
│  semantic types]     │  │   🎵 Chorus           │
│                      │  │   🎵 Verse 2          │
│ AI Annotate Button   │  │   📖 Annotation       │
│                      │  │                       │
└──────────────────────┘  │ ☐ Page 2              │
                          │   🎵 Verse 3          │
                          │   🎵 Chorus           │
                          └───────────────────────┘
```

#### Key Features:
- Visual type indicators (icons/colors for different semantic types)
- Drag-and-drop type assignment
- Region hierarchy (main content vs annotations)
- Progress tracking across pages

### **Mode 2: OCR & Text Correction**
**Purpose**: Text extraction and accuracy  
**Current State**: New functionality to be built

#### Functionality:
- Take classified regions from Mode 1
- Auto-OCR each region individually
- Present text for proof-reading and correction
- Region-by-region workflow
- Focus purely on "What does this region say?"

#### UI Layout:
```
┌─ Current Region: Verse 1 ──────────────────────────┐
│ ┌─ Region Preview ───┐  ┌─ OCR Text ─────────────┐ │
│ │ [Thumbnail of      │  │ When I was young and   │ │
│ │  region from PDF]  │  │ foolish, I thought     │ │
│ │                    │  │ the world was mine...  │ │
│ └────────────────────┘  │                       │ │
│                         │ [Confidence: 94%]     │ │
│ Type: 🎵 Verse 1        │ [Edit] [Re-OCR]       │ │
│                         └───────────────────────┘ │
│                                                   │
│ [← Previous] [Next Region →] [Back to Regions]    │
└───────────────────────────────────────────────────┘
```

#### Key Features:
- Region-by-region navigation
- OCR confidence indicators
- Easy text editing interface
- Re-OCR option for poor results
- Preview of source region
- Progress indicator (Region 3 of 15)

### **Mode 3: Presentation Viewer**
**Purpose**: Final document presentation and export  
**Current State**: Evolution of `viewer.html`

#### Functionality:
- Beautiful HTML rendering of processed document
- Bidirectional linking between text and source regions
- Export as clean HTML/web page
- Navigation between semantic elements
- Focus on "How should this look as a final document?"

#### UI Layout:
```
┌─ Rendered Document ────────────────┐  ┌─ Navigation ────┐
│ Song Title                         │  │ • Title         │
│ ═══════════                        │  │ • Verse 1       │
│                                    │  │ • Chorus        │
│ [Verse 1 - clickable to highlight │  │ • Verse 2       │
│  source region on original PDF]    │  │ • Chorus        │
│                                    │  │ • Verse 3       │
│ When I was young and foolish,      │  │ • Annotations   │
│ I thought the world was mine...    │  │                 │
│                                    │  │ [Export HTML]   │
│ [Chorus - clickable]               │  │ [Export PDF]    │
│                                    │  │ [Back to Edit]  │
│ Oh how he loves us,                │  └─────────────────┘
│ How he cares for every soul...     │
│                                    │
└────────────────────────────────────┘
```

#### Key Features:
- Clean, readable presentation
- Click any element → highlight source region
- Export options (HTML, PDF, etc.)
- Semantic navigation
- Back-links to editing modes

## Application Structure

### **File Organization:**
```
bookchop.app/
├── /                    # Mode 1: Region marking & classification
├── /ocr                 # Mode 2: OCR & text correction
├── /view               # Mode 3: Presentation viewer
└── /launcher           # .chaya file opener
```

### **Navigation Flow:**
```
Upload PDF/Chaya → Mark Regions → OCR Text → View Result
       ↓              ↓             ↓          ↓
   Raw Input    →  .chaya v1   →  .chaya v2  → HTML Export
                  (regions)     (+ OCR text) (presentation)
```

### **Data Evolution in .chaya Format:**

#### Stage 1 (After Mode 1):
```json
{
  "metadata": {...},
  "annotationsByPage": {
    "1": [
      {
        "id": "...",
        "x": 0.1, "y": 0.2, "width": 0.8, "height": 0.1,
        "label": "title",
        "semanticType": "title"
      },
      {
        "id": "...",
        "x": 0.1, "y": 0.3, "width": 0.8, "height": 0.2,
        "label": "verse-1", 
        "semanticType": "verse"
      }
    ]
  }
}
```

#### Stage 2 (After Mode 2):
```json
{
  "metadata": {...},
  "annotationsByPage": {
    "1": [
      {
        "id": "...",
        "x": 0.1, "y": 0.2, "width": 0.8, "height": 0.1,
        "label": "title",
        "semanticType": "title",
        "ocrText": "Song of Solomon",
        "ocrConfidence": 0.98,
        "correctedText": "Song of Solomon"
      }
    ]
  }
}
```

## Workflow Benefits

### **Cognitive Load Management:**
- **Mode 1**: Focus only on layout and meaning
- **Mode 2**: Focus only on text accuracy  
- **Mode 3**: Focus only on presentation

### **Natural Progression:**
1. **Spatial understanding**: "Where are the regions?"
2. **Semantic understanding**: "What type of content is this?"
3. **Textual understanding**: "What does it say?"
4. **Presentation**: "How should it look?"

### **User Experience:**
- ✅ **Clear progression**: Each mode has a distinct purpose
- ✅ **Non-destructive**: Can always go back to previous modes
- ✅ **Incremental**: Save progress at each stage
- ✅ **Flexible**: Skip ahead or revisit any mode
- ✅ **Contextual**: Each UI optimized for its specific task

## Semantic Types

### **Content Types:**
- `title` - Document/section titles
- `verse` - Verse content (poetry, lyrics, scripture)
- `chorus` - Repeated refrains
- `paragraph` - Regular prose
- `heading` - Section headings
- `caption` - Image/figure captions

### **Metadata Types:**
- `annotation` - Commentary or notes
- `footnote` - Bottom-page references
- `page_number` - Page numbering
- `author` - Author attribution
- `date` - Date information

### **Visual Indicators:**
- 📝 Title (large, bold regions)
- 🎵 Verse/Chorus (content blocks)
- 📖 Annotations (smaller, secondary text)
- 🔢 Page numbers (small, corner regions)
- 📅 Dates (temporal information)

## Implementation Priority

### **Phase 1**: Enhance current annotator with semantic types
- Add type selection to annotation creation
- Update sidebar to show types with icons
- Modify .chaya format to include semanticType field

### **Phase 2**: Build OCR workflow page
- Create new `/ocr` route
- Implement region-by-region OCR interface
- Add text correction capabilities

### **Phase 3**: Enhance viewer for presentation
- Transform current viewer into presentation mode
- Add bidirectional linking
- Implement export functionality

This three-mode approach transforms Bookchop into a complete document digitization pipeline while maintaining clear separation of concerns and optimal user experience for each task.