/**
 * Shared PDF utilities for both annotator and viewer
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

// Initialize PDF.js when it's ready
export async function initializePdfjs(): Promise<void> {
    const pdfjs = await waitForPdfjs();
    // Set the worker source for pdf.js. This is required for the library to work.
    if (pdfjs?.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    console.log('PDF.js initialized, worker src set to:', pdfjs.GlobalWorkerOptions?.workerSrc);
}

// Function to render a single page
export async function renderPage(pdf: any, pageNumber: number, container: HTMLElement): Promise<HTMLDivElement> {
    const page = await pdf.getPage(pageNumber);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    // Create a div to hold the canvas and the annotation layer
    const pageDiv = document.createElement('div');
    pageDiv.className = 'page';
    pageDiv.style.position = 'relative';
    pageDiv.style.marginBottom = '1rem';
    pageDiv.dataset.pageNumber = pageNumber.toString();

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    canvas.style.border = '1px solid black';
    canvas.style.display = 'block';

    // Create annotation overlay
    const annotationLayer = document.createElement('div');
    annotationLayer.className = 'annotation-layer';
    annotationLayer.style.position = 'absolute';
    annotationLayer.style.top = '0';
    annotationLayer.style.left = '0';
    annotationLayer.style.width = '100%';
    annotationLayer.style.height = '100%';
    annotationLayer.style.pointerEvents = 'auto';

    pageDiv.style.width = `${viewport.width}px`;
    pageDiv.style.height = `${viewport.height}px`;

    pageDiv.appendChild(canvas);
    pageDiv.appendChild(annotationLayer);
    container.appendChild(pageDiv);

    const renderContext = {
        canvasContext: context!,
        viewport: viewport
    };

    await page.render(renderContext).promise;
    
    return pageDiv;
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
                id: ann.id || generateId(),
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

// Generate unique ID for annotations
export function generateId(): string {
    return 'annotation_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Extract a cropped region from a page canvas for a specific annotation
export async function extractAnnotationRegion(pdf: any, annotation: Annotation): Promise<HTMLDivElement> {
    const page = await pdf.getPage(annotation.pageNumber);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    // Create a canvas to render the full page
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Render the page
    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };
    await page.render(renderContext).promise;

    // Calculate the annotation region in pixels
    const left = annotation.x * viewport.width;
    const top = annotation.y * viewport.height;
    const width = annotation.width * viewport.width;
    const height = annotation.height * viewport.height;

    // Create a new canvas for the cropped region
    const croppedCanvas = document.createElement('canvas');
    const croppedContext = croppedCanvas.getContext('2d')!;
    croppedCanvas.width = width;
    croppedCanvas.height = height;

    // Draw the cropped region
    croppedContext.drawImage(
        canvas,
        left, top, width, height,  // source rectangle
        0, 0, width, height        // destination rectangle
    );

    // Create a container div with the cropped image and label
    const regionDiv = document.createElement('div');
    regionDiv.className = 'annotation-region';
    regionDiv.style.marginBottom = '1rem';
    regionDiv.style.padding = '1rem';
    regionDiv.style.backgroundColor = 'white';
    regionDiv.style.border = '1px solid #e5e7eb';
    regionDiv.style.borderRadius = '0.5rem';
    regionDiv.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';

    // Add label
    const labelDiv = document.createElement('div');
    labelDiv.className = 'annotation-label';
    labelDiv.style.marginBottom = '0.5rem';
    labelDiv.style.fontSize = '14px';
    labelDiv.style.fontWeight = 'bold';
    labelDiv.style.color = '#1f2937';
    labelDiv.textContent = annotation.label;

    // Add page info
    const pageInfo = document.createElement('div');
    pageInfo.className = 'page-info';
    pageInfo.style.fontSize = '12px';
    pageInfo.style.color = '#6b7280';
    pageInfo.style.marginBottom = '0.5rem';
    pageInfo.textContent = `Page ${annotation.pageNumber}`;

    // Add the cropped canvas
    croppedCanvas.style.maxWidth = '100%';
    croppedCanvas.style.height = 'auto';
    croppedCanvas.style.border = '1px solid #d1d5db';

    regionDiv.appendChild(labelDiv);
    regionDiv.appendChild(pageInfo);
    regionDiv.appendChild(croppedCanvas);

    return regionDiv;
}