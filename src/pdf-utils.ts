/**
 * Shared PDF utilities - only complex functionality worth abstracting
 */

// TODO: Rename `Annotation` to `Region`
export interface Annotation {
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

export namespace Annotation {
    // Load and parse annotations from JSON data
    export function parseFromJson(jsonData: any): Annotation[] {
        // Validate the JSON structure
        if (!jsonData.metadata || !jsonData.annotationsByPage) {
            throw new Error('Invalid annotations JSON format');
        }

        console.log('Loading annotations from JSON:', jsonData);

        const annotations: Annotation[] = [];

        // Convert loaded annotations to our internal format
        Object.keys(jsonData.annotationsByPage).forEach(pageKey => {
            const pageNumber = parseInt(pageKey);
            const pageAnnotations = jsonData.annotationsByPage[pageKey];

            pageAnnotations.forEach((ann: any) => {
                const annotation: Annotation = {
                    id: ann.id || generateId(),
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
}

// A string like `pk0n4cu0z` (using 0.7098903088646241 = 0.pk0n4cu0zoe)
export function generateId(): string {
    return 'annotation_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

