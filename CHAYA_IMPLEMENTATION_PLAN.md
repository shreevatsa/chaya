# .chaya Format Implementation Plan

## Overview
Implementation plan for creating self-contained `.chaya` files that package the PDF, annotations, and Bookchop application together in a single ZIP-based format (similar to EPUB or Office documents).

## Architecture Goals
- **Single-file portability**: Everything in one `.chaya` file
- **Zero encoding overhead**: PDF stays as raw binary in ZIP
- **Universal access**: Works with or without browser extension
- **Progressive enhancement**: Extension provides native file associations
- **Backwards compatibility**: Existing PDF+JSON workflow unchanged

## Phase 1: Core ZIP Export/Import Infrastructure

### 1.1 Add ZIP Dependencies
```javascript
// Add to package.json
"dependencies": {
  "jszip": "^3.10.1"
}
```

### 1.2 Create Bundling System
```typescript
// New file: src/bundler.ts
export async function bundleApplication(): Promise<{
  indexHtml: string,
  viewerHtml: string, 
  bundledJs: string,
  bundledCss: string
}> {
  // Inline all dependencies into self-contained HTML files
  // Bundle all JS modules into single file
  // Bundle all CSS into single file
}
```

### 1.3 Modify Export System
```typescript
// Update annotator.ts
async function exportAsChayaFile() {
  const zip = new JSZip();
  
  // Bundle application
  const bundle = await bundleApplication();
  zip.file("app/index.html", bundle.indexHtml);
  zip.file("app/viewer.html", bundle.viewerHtml);
  zip.file("app/app.js", bundle.bundledJs);
  zip.file("app/app.css", bundle.bundledCss);
  
  // Add document data
  zip.file("document.pdf", getCurrentPdfBuffer());
  zip.file("annotations.json", JSON.stringify(getCurrentAnnotations()));
  zip.file("manifest.json", createManifest());
  
  downloadFile(`${pdfName}.chaya`, await zip.generateAsync({type: "blob"}));
}
```

## Phase 2: .chaya File Loader

### 2.1 Create Web Launcher Interface
```html
<!-- New file: launcher.html -->
<!DOCTYPE html>
<html>
<head><title>Bookchop Launcher</title></head>
<body>
  <div id="upload-zone">
    <h1>Open .chaya File</h1>
    <input type="file" accept=".chaya" id="chaya-upload">
    <div class="drop-zone">Drop .chaya file here</div>
  </div>
  <div id="app-container" style="display: none;">
    <!-- Dynamic content loaded here -->
  </div>
</body>
</html>
```

### 2.2 Implement .chaya Loader
```typescript
// New file: src/chaya-loader.ts
export async function loadChayaFile(file: File): Promise<void> {
  const zip = await JSZip.loadAsync(file);
  
  // Extract and validate manifest
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  
  // Load application files
  const indexHtml = await zip.file("app/index.html").async("string");
  const appJs = await zip.file("app/app.js").async("string");
  const appCss = await zip.file("app/app.css").async("string");
  
  // Load document data
  const pdfBuffer = await zip.file("document.pdf").async("arraybuffer");
  const annotations = JSON.parse(await zip.file("annotations.json").async("string"));
  
  // Inject into current page
  injectAndRunApplication(indexHtml, appJs, appCss, pdfBuffer, annotations);
}
```

## Phase 3: Application Mode Detection

### 3.1 Detect Runtime Mode
```typescript
// Add to existing files
enum AppMode {
  STANDALONE = 'standalone',  // Normal bookchop.app usage
  EMBEDDED = 'embedded'       // Running from .chaya file
}

function detectAppMode(): AppMode {
  return window.CHAYA_EMBEDDED_DATA ? AppMode.EMBEDDED : AppMode.STANDALONE;
}
```

### 3.2 Modify UI Based on Mode
```typescript
// Update annotator.ts and viewer.ts
function initializeApp() {
  const mode = detectAppMode();
  
  if (mode === AppMode.EMBEDDED) {
    // Hide file upload UI
    hideFileUploadControls();
    // Load embedded data
    loadEmbeddedData();
    // Show "embedded mode" indicator
    showEmbeddedModeUI();
  } else {
    // Normal standalone mode
    showFileUploadControls();
  }
}
```

## Phase 4: Browser Extension

### 4.1 Extension Manifest
```json
// New: extension/manifest.json
{
  "manifest_version": 3,
  "name": "Bookchop File Handler",
  "version": "1.0",
  "permissions": ["activeTab"],
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [{
    "matches": ["file://*.chaya"],
    "js": ["content.js"]
  }]
}
```

### 4.2 Extension Logic
```javascript
// New: extension/content.js
// Detect .chaya file access
if (location.href.endsWith('.chaya')) {
  // Redirect to web launcher
  const launcherUrl = `https://bookchop.app/launcher?fileUrl=${encodeURIComponent(location.href)}`;
  location.replace(launcherUrl);
}
```

## Phase 5: Build System Updates

### 5.1 Update Build Scripts
```json
// Update package.json
{
  "scripts": {
    "build": "npm run build:app && npm run build:launcher && npm run build:extension",
    "build:app": "tsc && postcss ./src/input.css -o ./dist/output.css",
    "build:launcher": "webpack --config launcher.webpack.js",
    "build:extension": "cp -r extension/ dist/extension/"
  }
}
```

### 5.2 Add Bundling Configuration
```javascript
// New: launcher.webpack.js
module.exports = {
  entry: './src/launcher.ts',
  output: {
    filename: 'launcher.js',
    path: path.resolve(__dirname, 'dist')
  },
  // Bundle everything into single file for embedding
};
```

## Phase 6: File Structure Changes

```
bookchop/
├── src/
│   ├── annotator.ts          # Modified: add export functionality
│   ├── viewer.ts             # Modified: add embedded mode
│   ├── bundler.ts            # New: application bundling
│   ├── chaya-loader.ts       # New: .chaya file handling
│   └── launcher.ts           # New: web launcher entry point
├── extension/                # New: browser extension
│   ├── manifest.json
│   ├── content.js
│   └── popup.html
├── launcher.html             # New: web launcher interface
├── launcher.webpack.js       # New: bundling config
└── dist/
    ├── app/                  # Existing app files
    ├── launcher.html         # Built launcher
    ├── launcher.js           # Bundled launcher
    └── extension/            # Built extension
```

## Phase 7: Deployment Strategy

### 7.1 Website Structure
```
bookchop.app/
├── /                         # Existing annotator
├── /viewer                   # Existing viewer  
├── /launcher                 # New: .chaya file opener
└── /extension               # New: extension download
```

### 7.2 Extension Distribution
- Chrome Web Store listing
- Firefox Add-ons listing
- Manual installation instructions

## .chaya File Format

### Internal Structure
```
document.chaya  (ZIP file)
├── manifest.json     # Metadata, version info
├── app/
│   ├── index.html    # Bookchop annotator
│   ├── viewer.html   # Bookchop viewer  
│   ├── app.js        # All JavaScript bundled
│   └── app.css       # All styles bundled
├── document.pdf      # Original PDF (no encoding overhead!)
└── annotations.json  # Annotation data
```

### manifest.json Structure
```json
{
  "version": "1.0",
  "created": "2025-07-14T16:00:00Z",
  "originalFilename": "document.pdf",
  "chayaFormatVersion": "1.0",
  "application": {
    "name": "Bookchop",
    "version": "1.0.0"
  }
}
```

## User Experience Flows

### Flow 1: With Extension (Seamless)
1. User double-clicks `document.chaya`
2. Extension captures the file
3. Extension opens `bookchop.app/launcher` with file reference
4. Web app loads the file directly
5. **Result**: Native file association experience

### Flow 2: Without Extension (Still Works)
1. User visits `bookchop.app/launcher`
2. User drags/uploads `document.chaya` file
3. Web app unzips and loads embedded app
4. **Result**: Universal access, no installation required

### Flow 3: Sharing (Best of Both)
1. User shares `.chaya` file via email/cloud
2. Recipient can either:
   - Double-click (if they have extension)
   - Or upload to web launcher (if they don't)
3. **Result**: Works for everyone regardless of setup

## Key Implementation Decisions

1. **Backwards Compatibility**: Keep existing PDF+JSON workflow intact
2. **Progressive Enhancement**: .chaya format is additive feature
3. **Self-Contained Bundling**: Each .chaya file contains full application
4. **Universal Fallback**: Web launcher works without extension
5. **Single Codebase**: Same app code for standalone and embedded modes
6. **ZIP Format**: Industry standard, zero encoding overhead
7. **Hybrid Extension**: Extension redirects to web launcher rather than standalone app

## Benefits

- ✅ **True portability**: Single file contains everything
- ✅ **Zero overhead**: PDF stays as raw binary
- ✅ **Version control friendly**: Can track changes to .chaya files
- ✅ **Universal access**: Works with or without extension
- ✅ **Native feel**: Extension users get OS-level file associations
- ✅ **Industry standard**: Uses proven ZIP-based format
- ✅ **Extensible**: Easy to add more files/features later
- ✅ **Tool ecosystem**: Can open with ZIP tools for debugging
- ✅ **Offline capable**: No external dependencies once loaded

## Technical Notes

- Similar to EPUB and Office document formats (ZIP-based)
- JSZip library handles cross-browser ZIP operations
- Application bundling inlines all dependencies
- Extension provides convenience layer over web launcher
- Web launcher ensures universal compatibility
- Same codebase serves both standalone and embedded modes