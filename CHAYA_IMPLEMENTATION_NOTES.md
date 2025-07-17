# .chaya File Implementation - Session Notes

## Overview
Successfully implemented single-file .chaya functionality with a clean two-slot UI interface for uploading/downloading PDF and .chaya files.

## Key Implementation Details

### Two-Slot UI Architecture
```
Upload Mode:    [📦 Upload .chaya] OR [📄 Upload .pdf]
Download Mode:  [📦 Download .chaya]   [📄 Download .pdf]
```

- **Dynamic UI switching** between upload/download modes based on document state
- **File input preservation** when updating slot innerHTML
- **Event listener management** with proper re-attachment after DOM updates

### .chaya File Format
```
document.chaya (ZIP file)
├── manifest.json      # Version, metadata, original filename
├── document.pdf       # Original PDF (raw binary, zero encoding overhead)
└── annotations.json   # Current annotation format
```

### Technical Solutions

#### 1. Module Import Issues
**Problem**: `import JSZip from 'jszip'` failed with module resolution error
**Solution**: Use CDN script tag + global declaration
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
```
```typescript
declare const JSZip: any;
```

#### 2. File Input Click Failures
**Problem**: "Cannot read properties of null (reading 'click')" when clicking slots
**Solution**: 
- Preserve file input elements when updating slot innerHTML
- Use dynamic element lookup in click handlers
- Proper null checks before calling .click()

#### 3. Browser Download Security Warnings
**Problem**: Chrome blocks .chaya downloads from HTTP with "Insecure download blocked"
**Solution**: 
- Development mode detection for localhost
- Use `.chaya.zip` extension in development
- Set proper `application/zip` MIME type
- Accept both `.chaya` and `.zip` in file input

#### 4. Unsaved Changes Flag Synchronization
**Problem**: False "unsaved changes" warnings after downloading .chaya files
**Solution**:
- Separate `syncAnnotations()` method for routine updates
- `updateAnnotations()` only for actual changes
- Event system to notify tabs when document is saved
- Dual flag synchronization (app state + annotator module)

### Code Architecture

#### State Management
```typescript
interface AppState {
    currentTab: 'mark' | 'edit' | 'read';
    documentLoaded: boolean;
    pdfFile: File | null;
    loadedAnnotations: SharedAnnotation[];
    hasUnsavedChanges: boolean;
}
```

#### Key Methods
- `loadChayaFile()` - ZIP extraction and document restoration
- `downloadChayaFile()` - ZIP creation with PDF + annotations + manifest
- `updateSlotUI()` - Dynamic slot content with file input preservation
- `syncAnnotations()` vs `updateAnnotations()` - Proper change tracking

### Testing
Created comprehensive test suite (`tests/unified-ui.spec.ts`) covering:
- File input element preservation
- Slot click functionality
- UI state transitions
- Library loading
- Error handling

All tests passing ✅

## Design Decisions

### 1. Two-Slot Simplicity
Rejected complex multi-input UI in favor of intuitive two-slot design:
- Clear mental model: PDF vs Complete Package
- Progressive enhancement: Start simple, grow to advanced
- Single interaction pattern: click to upload OR download

### 2. Backward Compatibility
Maintained existing PDF+JSON workflow while adding .chaya as enhancement:
- Same annotation data structure
- No breaking changes to existing functionality
- .chaya format is purely additive

### 3. Security-First Approach
- No explicit save step eliminates need for "Save Annotations" button
- Auto-save to memory, explicit export via download slots
- Proper MIME types and file validation
- Development vs production handling for browser security

### 4. Event-Driven Architecture
Used custom events for tab communication:
- `markTabDataReady`, `readTabDataReady` for data flow
- `documentSaved` for state synchronization
- `tabRenderingComplete` for progress tracking

## File Changes Summary

### New Files
- `tests/unified-ui.spec.ts` - Comprehensive test suite

### Modified Files
- `index.html` - Two-slot UI, JSZip script tag, removed save button
- `src/app.ts` - .chaya handling, state management, slot UI logic
- `src/modes/annotator.ts` - Removed save button, event listeners
- `package.json` - Removed JSZip dependency (using CDN)

### Dependencies
- **Added**: JSZip (via CDN)
- **Removed**: JSZip npm package

## Next Steps / Future Enhancements

### Phase 2 Possibilities
1. **Web Launcher** - Standalone page for opening .chaya files
2. **Browser Extension** - Native file association for .chaya files
3. **Application Bundling** - Embed Chaya app inside .chaya files
4. **Enhanced Metadata** - Version tracking, creation timestamps
5. **Edit Tab Implementation** - ProseMirror integration with region references

### Known Limitations
1. HTTP development requires `.chaya.zip` workaround
2. Large PDFs may impact ZIP generation performance
3. No compression optimization for different content types
4. No validation of .chaya file integrity on load

## Key Learnings

1. **DOM Manipulation**: innerHTML updates require careful element preservation
2. **Module Systems**: ES modules + CDN libraries need special handling
3. **Browser Security**: Unknown file extensions trigger security warnings
4. **State Synchronization**: Multiple modules need explicit coordination
5. **Testing Strategy**: UI interactions require end-to-end testing approach

This implementation provides a solid foundation for the single-file .chaya workflow while maintaining clean architecture and user experience.