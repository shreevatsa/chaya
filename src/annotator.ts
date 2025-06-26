// PDF.js is loaded globally via script tag in the HTML
declare const pdfjsLib: any;

// Wait for PDF.js to be available before using it
function waitForPdfjs(): Promise<any> {
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
waitForPdfjs().then((pdfjsLib) => {
    // Set the worker source for pdf.js. This is required for the library to work.
    if (pdfjsLib?.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    console.log('PDF.js initialized, worker src set to:', pdfjsLib.GlobalWorkerOptions?.workerSrc);
});

const pdfUpload = document.getElementById('pdf-upload') as HTMLInputElement;
const pdfContainer = document.getElementById('pdf-container') as HTMLDivElement;
const saveAnnotationsBtn = document.getElementById('save-annotations') as HTMLButtonElement;

// Store annotations data
interface Annotation {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    pageNumber: number;
}

let annotations: Annotation[] = [];
let isDrawing = false;
let startX = 0;
let startY = 0;
let currentAnnotation: HTMLDivElement | null = null;

// Function to render a single page
async function renderPage(pdf: any, pageNumber: number) {
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
    annotationLayer.style.cursor = 'crosshair';

    pageDiv.style.width = `${viewport.width}px`;
    pageDiv.style.height = `${viewport.height}px`;

    pageDiv.appendChild(canvas);
    pageDiv.appendChild(annotationLayer);
    pdfContainer.appendChild(pageDiv);

    const renderContext = {
        canvasContext: context!,
        viewport: viewport
    };

    await page.render(renderContext).promise;

    // Add mouse event listeners for annotation drawing
    setupAnnotationDrawing(annotationLayer, pageDiv, pageNumber);
}

// Setup annotation drawing functionality
function setupAnnotationDrawing(overlay: HTMLDivElement, pageDiv: HTMLDivElement, pageNumber: number) {
    overlay.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const rect = overlay.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;

        // Create a new annotation box
        currentAnnotation = document.createElement('div');
        currentAnnotation.className = 'annotation-box';
        currentAnnotation.style.position = 'absolute';
        currentAnnotation.style.border = '2px solid #ff0000';
        currentAnnotation.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
        currentAnnotation.style.left = `${startX}px`;
        currentAnnotation.style.top = `${startY}px`;
        currentAnnotation.style.width = '0px';
        currentAnnotation.style.height = '0px';
        currentAnnotation.style.pointerEvents = 'none';
        
        overlay.appendChild(currentAnnotation);
        e.preventDefault();
    });

    overlay.addEventListener('mousemove', (e) => {
        if (!isDrawing || !currentAnnotation) return;

        const rect = overlay.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);

        currentAnnotation.style.left = `${left}px`;
        currentAnnotation.style.top = `${top}px`;
        currentAnnotation.style.width = `${width}px`;
        currentAnnotation.style.height = `${height}px`;
    });

    overlay.addEventListener('mouseup', (e) => {
        if (!isDrawing || !currentAnnotation) return;

        isDrawing = false;
        const rect = overlay.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;

        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        // Only create annotation if it has meaningful size
        if (width > 5 && height > 5) {
            const left = Math.min(startX, endX);
            const top = Math.min(startY, endY);
            
            // Convert to fractional coordinates
            const pageWidth = pageDiv.offsetWidth;
            const pageHeight = pageDiv.offsetHeight;
            
            const annotation: Annotation = {
                id: generateId(),
                x: left / pageWidth,
                y: top / pageHeight,
                width: width / pageWidth,
                height: height / pageHeight,
                label: prompt('Enter label for this annotation:') || 'Unlabeled',
                pageNumber: pageNumber
            };

            annotations.push(annotation);
            
            // Update the visual appearance
            currentAnnotation.style.pointerEvents = 'auto';
            currentAnnotation.style.cursor = 'pointer';
            currentAnnotation.title = annotation.label;
            
            // Add click handler to edit label
            currentAnnotation.addEventListener('click', () => {
                const newLabel = prompt('Edit label:', annotation.label);
                if (newLabel !== null) {
                    annotation.label = newLabel;
                    currentAnnotation!.title = newLabel;
                }
            });

            console.log('Created annotation:', annotation);
        } else {
            // Remove the annotation if it's too small
            overlay.removeChild(currentAnnotation);
        }

        currentAnnotation = null;
    });
}

// Generate unique ID for annotations
function generateId(): string {
    return 'annotation_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Listen for file selection
pdfUpload.addEventListener('change', async (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) {
        return;
    }

    // Clear any previously rendered PDF
    pdfContainer.innerHTML = '';

    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
        console.log('File reader loaded, processing PDF...');
        const typedArray = new Uint8Array(e.target?.result as ArrayBuffer);
        console.log('Created typed array, length:', typedArray.length);
        
        // Wait for PDF.js to be available
        const pdfjs = await waitForPdfjs();
        console.log('PDF.js available, creating document...');
        console.log('PDF.js object:', pdfjs);
        console.log('getDocument function available:', typeof pdfjs.getDocument);
        
        if (!pdfjs.getDocument) {
            console.error('getDocument function not available on pdfjs object');
            return;
        }
        
        const loadingTask = pdfjs.getDocument(typedArray);
        console.log('Loading task created:', loadingTask);
        
        try {
            const pdf = await loadingTask.promise;
            console.log('PDF loaded successfully, pages:', pdf.numPages);
            
            for (let i = 1; i <= pdf.numPages; i++) {
                console.log('Rendering page', i);
                await renderPage(pdf, i);
                console.log('Page', i, 'rendered');
            }
            console.log('All pages rendered successfully');
        } catch (reason) {
            console.error(`Error during PDF loading or rendering: ${reason}`);
        }
    };

    fileReader.readAsArrayBuffer(file);
});

// Save annotations functionality
saveAnnotationsBtn.addEventListener('click', () => {
    if (annotations.length === 0) {
        alert('No annotations to save!');
        return;
    }

    // Get the PDF filename (if available)
    const fileInput = pdfUpload;
    const fileName = fileInput.files?.[0]?.name || 'unknown.pdf';

    // Create annotations JSON structure according to the spec
    const annotationsData = {
        metadata: {
            sourcePdf: fileName,
            annotationVersion: "1.1",
            annotatedAt: new Date().toISOString()
        },
        annotationsByPage: {} as Record<string, Array<{
            id: string;
            x: number;
            y: number;
            width: number;
            height: number;
            label: string;
        }>>
    };

    // Group annotations by page
    annotations.forEach(annotation => {
        const pageKey = annotation.pageNumber.toString();
        if (!annotationsData.annotationsByPage[pageKey]) {
            annotationsData.annotationsByPage[pageKey] = [];
        }
        
        annotationsData.annotationsByPage[pageKey].push({
            id: annotation.id,
            x: annotation.x,
            y: annotation.y,
            width: annotation.width,
            height: annotation.height,
            label: annotation.label
        });
    });

    // Download the JSON file
    const blob = new Blob([JSON.stringify(annotationsData, null, 2)], { 
        type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'annotations.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('Saved annotations:', annotationsData);
});