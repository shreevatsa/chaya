/**
 * Shared PDF utilities - only complex functionality worth abstracting
 */

// PDF.js is loaded globally via script tag in the HTML
declare const pdfjsLib: any;

export interface Annotation {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    pageNumber: number;
}

// Wait for PDF.js to be available before using it
export function waitForPdfjs(): Promise<any> {
    return new Promise((resolve) => {
        if (typeof pdfjsLib !== 'undefined') {
            resolve(pdfjsLib);
        } else {
            const check = () => {
                if (typeof pdfjsLib !== 'undefined') {
                    resolve(pdfjsLib);
                } else {
                    setTimeout(check, 10);
                }
            };
            check();
        }
    });
}

// Initialize PDF.js when it's ready - complex setup worth sharing
export async function initializePdfjs(): Promise<void> {
    const pdfjs = await waitForPdfjs();
    // Set the worker source for pdf.js. This is required for the library to work.
    if (pdfjs?.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    console.log('PDF.js initialized, worker src set to:', pdfjs.GlobalWorkerOptions?.workerSrc);
}


// Load and parse annotations from JSON data
export function parseAnnotationsFromJson(jsonData: any): Annotation[] {
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
                id: ann.id || ('annotation_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)),
                x: ann.x,
                y: ann.y,
                width: ann.width,
                height: ann.height,
                label: ann.label,
                pageNumber: pageNumber
            };
            annotations.push(annotation);
        });
    });

    console.log('Loaded annotations:', annotations);
    return annotations;
}


