# Design Principles

## Deep Modules (Ousterhout)

### What Makes a Deep Module
A deep module has a **small interface** but **encapsulates significant complexity**. The key insight is that the interface should be much simpler than the implementation.

**Good Examples in this Codebase:**
- **PDF Page Management**: A simple `loadPDF(file) → rendered pages` interface that hides all the PDF.js complexity (worker setup, viewport calculations, canvas rendering, error handling)
- **Annotation Serialization**: A single `exportAnnotations() → download` function that handles JSON structure, metadata generation, filename logic, validation, and file download mechanics

### What NOT to Extract (Anti-Patterns)
**Shallow Modules** - These hurt more than they help:
- **Simple Math Operations**: `x / width` doesn't need a `CoordinateSystem.toFractional()` wrapper
- **Direct DOM Operations**: `element.style.left = x` doesn't need abstraction
- **One-Line Utilities**: If the "module" is just renaming existing operations, it's adding complexity

### The Test: Interface vs Implementation
Ask: "Is the interface significantly simpler than what it replaces?"

**Bad Example (what I did wrong):**
```typescript
// Before: Direct and clear
annotation.x = left / pageWidth;

// After: More code, same complexity
const fractionalRect = CoordinateSystem.rectToFractional(pixelRect, pageDimensions);
annotation.x = fractionalRect.x;
```
The interface is actually MORE complex than the implementation.

**Good Example (hypothetical):**
```typescript
// Before: Complex PDF.js setup scattered throughout code
const pdfjs = await waitForPdfjs();
pdfjs.GlobalWorkerOptions.workerSrc = '...';
const loadingTask = pdfjs.getDocument(typedArray);
const pdf = await loadingTask.promise;
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const viewport = page.getViewport({ scale: 1.5 });
  // ... more complexity
}

// After: Simple interface hiding all that complexity
const pages = await PDFManager.load(file);
```

### When to Modularize
Only extract when:
1. **The interface is simpler than the implementation**
2. **Significant complexity is being hidden**
3. **The abstraction feels natural and inevitable**
4. **It reduces total cognitive load**

### When NOT to Modularize
Don't extract when:
1. **The "abstraction" is just renaming**
2. **The interface is as complex as the implementation**
3. **It increases total lines of code without hiding complexity**
4. **You have to think harder to understand what's happening**

## Key Takeaway
Abstraction should make things **genuinely simpler**, not just **different**. If you're not hiding significant complexity behind a simple interface, you're probably making things worse.