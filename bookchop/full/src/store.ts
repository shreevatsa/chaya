import { reactive, watch } from '@vue/reactivity';
import { MarkedRegion, ChayaDocument } from './models.js';

// Define the shape of our application state

// --- Non-Reactive Cache ---
// This is a simple map for storing DOM elements. It is not reactive.
export const pageCanvasCache = new Map<number, HTMLCanvasElement>();
export let pdfDocument: any = null;


// --- Reactive State ---
export interface AppState {
    // These two bools are actually three states and could be an enum: NOT_LOADED, LOADED_NO_UNSAVED_CHANGES, LOADED_WITH_UNSAVED_CHANGES
    documentLoaded: boolean;  // Whether the document (PDF or Chaya) has been loaded yet
    hasUnsavedChanges: boolean;
    pdfFile: File | null;
    chayaDocument: ChayaDocument,
    // loadedChayaFileName: string | null;
}


// Create a single reactive state object using Vue's `reactive()`
export const $appState = reactive<AppState>({
    documentLoaded: false,
    hasUnsavedChanges: false,
    pdfFile: null,
    // chayaDocument: new ChayaDocument(),
    chayaDocument: null!, // Will be initialized on document load
    // loadedChayaFileName: null,
});

/**
 * A simple subscribe function that uses Vue's `watch` to run a
 * listener function whenever the state changes.
 */
export function subscribe(listener: () => void) {
    // The `deep: true` option makes it watch for changes inside objects and arrays.
    watch($appState, listener, { deep: true });
}

// --- ACTIONS ---
// These functions are the only way to modify the state.

export function loadPdf(pdfFile: File) {
    $appState.pdfFile = pdfFile;
    $appState.documentLoaded = true;
    $appState.chayaDocument = new ChayaDocument(); // Start with empty annotations
    $appState.hasUnsavedChanges = false;
    pageCanvasCache.clear();
}

export function setPdfDocumentInstance(doc: any) {
    pdfDocument = doc;
}

// export function loadAnnotations(chayaDoc: ChayaDocument) {
//     $appState.chayaDocument = chayaDoc;
//     $appState.hasUnsavedChanges = false;
// }
export function addAnnotationsForPage(pageNum: number, regions: MarkedRegion[]) {
    $appState.chayaDocument.markedRegions.set(pageNum, regions);
}

export function addPageCanvas(pageNum: number, canvas: HTMLCanvasElement) {
    pageCanvasCache.set(pageNum, canvas);
}

export function addAnnotation(annotation: MarkedRegion) {
    const regions = $appState.chayaDocument.markedRegions.get(annotation.pageNumber) || [];
    regions.push(annotation);
    $appState.chayaDocument.markedRegions.set(annotation.pageNumber, regions);
    $appState.hasUnsavedChanges = true;
}

export function deleteAnnotation(annotationId: string) {
    for (const regions of $appState.chayaDocument.markedRegions.values()) {
        const index = regions.findIndex(a => a.id === annotationId);
        if (index !== -1) {
            regions.splice(index, 1);
            $appState.hasUnsavedChanges = true;
            return;
        }
    }
}

export function updateAnnotationLabel(annotationId: string, newLabel: string) {
    for (const regions of $appState.chayaDocument.markedRegions.values()) {
        const annotation = regions.find(a => a.id === annotationId);
        if (annotation) {
            annotation.label = newLabel;
            $appState.hasUnsavedChanges = true;
            return;
        }
    }
}

export function setUnsavedChanges(value: boolean) {
    $appState.hasUnsavedChanges = value;
}

export function updateAnnotationRect(
    annotationId: string,
    newRect: { x: number; y: number; width: number; height: number; }
) {
    for (const regions of $appState.chayaDocument.markedRegions.values()) {
        const annotation = regions.find(a => a.id === annotationId);
        if (annotation) {
            annotation.x = newRect.x;
            annotation.y = newRect.y;
            annotation.width = newRect.width;
            annotation.height = newRect.height;
            $appState.hasUnsavedChanges = true;
            return; // No need to call _publish(), the mutation is automatically detected.
        }
    }
}
