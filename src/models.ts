export interface MarkedRegion {
    id: string;
    pageNumber: number;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    // Optional fields for enhanced AI annotations
    semanticType?: string;
    wordIndices?: number[];
    ocrText?: string;
}

export namespace MarkedRegion {
    // Load and parse annotations from JSON data as saved to .chaya file.
    export function parseFromJson(jsonData: any): MarkedRegion[] {
        // Validate the JSON structure
        if (!jsonData.metadata || !jsonData.annotationsByPage) {
            throw new Error('Invalid annotations JSON format');
        }

        console.log('Loading annotations from JSON:', jsonData);

        const annotations: MarkedRegion[] = [];

        // Convert loaded annotations to our internal format
        Object.keys(jsonData.annotationsByPage).forEach(pageKey => {
            const pageNumber = parseInt(pageKey);
            const pageAnnotations = jsonData.annotationsByPage[pageKey];

            pageAnnotations.forEach((ann: any) => {
                const annotation: MarkedRegion = {
                    id: ann.id || generateRandomId(),
                    pageNumber: pageNumber,
                    x: ann.x,
                    y: ann.y,
                    width: ann.width,
                    height: ann.height,
                    label: ann.label,
                    ocrText: ann.ocrText,
                };
                annotations.push(annotation);
            });
        });

        console.log('Loaded annotations:', annotations);
        return annotations;
    }

    // A string like `annotation_1753194399461_735zr5zix` (via 0.19688771398906768 = 0.735zr5zix73)
    export function generateRandomId(): string {
        return 'annotation_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

export class ChayaDocument {
    public markedRegions: MarkedRegion[] = [];

    public static fromRegions(regions: MarkedRegion[]) {
        const doc = new ChayaDocument();
        doc.markedRegions = regions;
        return doc;
    }
}

// Application state.
interface AppState {
    currentTab: 'mark' | 'edit' | 'read';  // Which tab of the app is active
    documentLoaded: boolean;  // Whether the document (PDF or Chaya) has been loaded yet
    pdfFile: File | null;
    chayaDocument: ChayaDocument,
    loadedChayaFileName: string | null;
    pdfDocument: any | null;
    hasUnsavedChanges: boolean;
}

export const appState: AppState = {
    currentTab: 'mark',
    documentLoaded: false,
    pdfFile: null,
    chayaDocument: new ChayaDocument(),
    loadedChayaFileName: null,
    pdfDocument: null,
    hasUnsavedChanges: false
};
