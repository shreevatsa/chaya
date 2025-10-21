export interface MarkedRegion {
    id: string;
    pageNumber: number;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
}

export namespace MarkedRegion {
    // Load and parse annotations from JSON data as saved to .chaya file.
    export function parseFromJson(jsonData: any): Map<number, MarkedRegion[]> {
        if (!jsonData.metadata || !jsonData.annotationsByPage) {
            throw new Error('Invalid annotations JSON format');
        }

        console.log('Loading annotations from JSON:', jsonData);

        const annotationsMap = new Map<number, MarkedRegion[]>();

        Object.keys(jsonData.annotationsByPage).forEach(pageKey => {
            const pageNumber = parseInt(pageKey);
            const pageAnnotations = jsonData.annotationsByPage[pageKey].map((ann: any) => ({
                id: ann.id || generateRandomId(),
                pageNumber: pageNumber,
                x: ann.x, y: ann.y, width: ann.width, height: ann.height,
                label: ann.label,
            }));
            annotationsMap.set(pageNumber, pageAnnotations);
        });

        return annotationsMap;
    }

    // A string like `annotation_1753194399461_735zr5zix` (via 0.19688771398906768 = 0.735zr5zix73)
    export function generateRandomId(): string {
        return 'annotation_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

export class ChayaDocument {
    public markedRegions: Map<number, MarkedRegion[]> = new Map();

    public static fromRegions(regions: Map<number, MarkedRegion[]>) {
        const doc = new ChayaDocument();
        doc.markedRegions = regions;
        return doc;
    }
}

// Application state.
interface AppState {
    // These two bools are actually three states and could be an enum: NOT_LOADED, LOADED_NO_UNSAVED_CHANGES, LOADED_WITH_UNSAVED_CHANGES
    documentLoaded: boolean;  // Whether the document (PDF or Chaya) has been loaded yet
    hasUnsavedChanges: boolean;
    pdfFile: File | null;
    chayaDocument: ChayaDocument,
    loadedChayaFileName: string | null;
    pdfDocument: any | null; // Actually it is of type `PDFDocumentProxy`
    pageCanvasCache: Map<number, HTMLCanvasElement>;
}

export const appState: AppState = {
    documentLoaded: false,
    hasUnsavedChanges: false,
    pdfFile: null,
    chayaDocument: new ChayaDocument(),
    loadedChayaFileName: null,
    pdfDocument: null,
    pageCanvasCache: new Map(),
};

// Expose app state for debugging and automated tests.
if (typeof window !== 'undefined') {
    (window as unknown as { appState?: AppState }).appState = appState;
}
