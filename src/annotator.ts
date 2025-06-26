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
const annotationsUpload = document.getElementById('annotations-upload') as HTMLInputElement;
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
let loadedAnnotations: any = null; // Store loaded annotations until PDF is ready
let isDrawing = false;
let startX = 0;
let startY = 0;
let currentAnnotation: HTMLDivElement | null = null;

// Resize/drag state
let isResizing = false;
let isDragging = false;
let resizeHandle: string | null = null;
let dragStartX = 0;
let dragStartY = 0;
let selectedAnnotation: HTMLDivElement | null = null;
let selectedAnnotationData: Annotation | null = null;

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
            
            // Make annotation interactive
            makeAnnotationInteractive(currentAnnotation, annotation, pageDiv);

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

// Load annotations from JSON file
function loadAnnotationsFromJson(jsonData: any): void {
    try {
        // Validate the JSON structure
        if (!jsonData.metadata || !jsonData.annotationsByPage) {
            throw new Error('Invalid annotations JSON format');
        }

        console.log('Loading annotations from JSON:', jsonData);
        
        // Clear existing annotations
        annotations = [];
        
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
        
        // If PDF is already loaded, render the annotations
        if (pdfContainer.children.length > 0) {
            renderLoadedAnnotations();
        } else {
            // Store for when PDF is loaded
            loadedAnnotations = jsonData;
        }
        
    } catch (error) {
        console.error('Error loading annotations:', error);
        alert('Error loading annotations: ' + error);
    }
}

// Render loaded annotations on existing PDF pages
function renderLoadedAnnotations(): void {
    annotations.forEach(annotation => {
        const pageDiv = pdfContainer.querySelector(`[data-page-number="${annotation.pageNumber}"]`) as HTMLDivElement;
        if (pageDiv) {
            const annotationLayer = pageDiv.querySelector('.annotation-layer') as HTMLDivElement;
            if (annotationLayer) {
                createAnnotationBox(annotationLayer, pageDiv, annotation);
            }
        }
    });
}

// Create visual annotation box
function createAnnotationBox(overlay: HTMLDivElement, pageDiv: HTMLDivElement, annotation: Annotation): void {
    const pageWidth = pageDiv.offsetWidth;
    const pageHeight = pageDiv.offsetHeight;
    
    // Convert fractional coordinates back to pixels
    const left = annotation.x * pageWidth;
    const top = annotation.y * pageHeight;
    const width = annotation.width * pageWidth;
    const height = annotation.height * pageHeight;

    const annotationBox = document.createElement('div');
    annotationBox.className = 'annotation-box';
    annotationBox.style.position = 'absolute';
    annotationBox.style.border = '2px solid #ff0000';
    annotationBox.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
    annotationBox.style.left = `${left}px`;
    annotationBox.style.top = `${top}px`;
    annotationBox.style.width = `${width}px`;
    annotationBox.style.height = `${height}px`;
    annotationBox.style.cursor = 'move';
    annotationBox.title = annotation.label;
    
    // Make annotation interactive
    makeAnnotationInteractive(annotationBox, annotation, pageDiv);

    overlay.appendChild(annotationBox);
}

// Make annotation box interactive with resize handles and drag functionality
function makeAnnotationInteractive(annotationBox: HTMLDivElement, annotation: Annotation, pageDiv: HTMLDivElement): void {
    // Add resize handles
    const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    handles.forEach(handle => {
        const handleElement = document.createElement('div');
        handleElement.className = `resize-handle resize-${handle}`;
        handleElement.style.position = 'absolute';
        handleElement.style.backgroundColor = '#fff';
        handleElement.style.border = '1px solid #000';
        handleElement.style.width = '8px';
        handleElement.style.height = '8px';
        handleElement.style.zIndex = '1000';
        
        // Position handles
        switch (handle) {
            case 'nw':
                handleElement.style.top = '-4px';
                handleElement.style.left = '-4px';
                handleElement.style.cursor = 'nw-resize';
                break;
            case 'ne':
                handleElement.style.top = '-4px';
                handleElement.style.right = '-4px';
                handleElement.style.cursor = 'ne-resize';
                break;
            case 'sw':
                handleElement.style.bottom = '-4px';
                handleElement.style.left = '-4px';
                handleElement.style.cursor = 'sw-resize';
                break;
            case 'se':
                handleElement.style.bottom = '-4px';
                handleElement.style.right = '-4px';
                handleElement.style.cursor = 'se-resize';
                break;
            case 'n':
                handleElement.style.top = '-4px';
                handleElement.style.left = '50%';
                handleElement.style.transform = 'translateX(-50%)';
                handleElement.style.cursor = 'n-resize';
                break;
            case 's':
                handleElement.style.bottom = '-4px';
                handleElement.style.left = '50%';
                handleElement.style.transform = 'translateX(-50%)';
                handleElement.style.cursor = 's-resize';
                break;
            case 'e':
                handleElement.style.right = '-4px';
                handleElement.style.top = '50%';
                handleElement.style.transform = 'translateY(-50%)';
                handleElement.style.cursor = 'e-resize';
                break;
            case 'w':
                handleElement.style.left = '-4px';
                handleElement.style.top = '50%';
                handleElement.style.transform = 'translateY(-50%)';
                handleElement.style.cursor = 'w-resize';
                break;
        }
        
        // Initially hide handles
        handleElement.style.display = 'none';
        
        // Add resize functionality
        handleElement.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            startResize(e, handle, annotationBox, annotation, pageDiv);
        });
        
        annotationBox.appendChild(handleElement);
    });
    
    // Add selection and drag functionality
    annotationBox.addEventListener('mousedown', (e) => {
        selectAnnotation(annotationBox, annotation);
        if (e.detail === 2) { // Double click to edit label
            const newLabel = prompt('Edit label:', annotation.label);
            if (newLabel !== null) {
                annotation.label = newLabel;
                annotationBox.title = newLabel;
            }
        } else {
            startDrag(e, annotationBox, annotation, pageDiv);
        }
    });
    
    // Show/hide handles on hover
    annotationBox.addEventListener('mouseenter', () => {
        if (selectedAnnotation === annotationBox) {
            showResizeHandles(annotationBox);
        }
    });
}

// Select annotation and show resize handles
function selectAnnotation(annotationBox: HTMLDivElement, annotation: Annotation): void {
    // Hide handles from previously selected annotation
    if (selectedAnnotation && selectedAnnotation !== annotationBox) {
        hideResizeHandles(selectedAnnotation);
        selectedAnnotation.style.border = '2px solid #ff0000';
    }
    
    // Select new annotation
    selectedAnnotation = annotationBox;
    selectedAnnotationData = annotation;
    annotationBox.style.border = '2px solid #0066ff';
    showResizeHandles(annotationBox);
}

// Show resize handles
function showResizeHandles(annotationBox: HTMLDivElement): void {
    const handles = annotationBox.querySelectorAll('.resize-handle');
    handles.forEach(handle => {
        (handle as HTMLElement).style.display = 'block';
    });
}

// Hide resize handles
function hideResizeHandles(annotationBox: HTMLDivElement): void {
    const handles = annotationBox.querySelectorAll('.resize-handle');
    handles.forEach(handle => {
        (handle as HTMLElement).style.display = 'none';
    });
}

// Start resizing
function startResize(e: MouseEvent, handle: string, annotationBox: HTMLDivElement, annotation: Annotation, pageDiv: HTMLDivElement): void {
    isResizing = true;
    resizeHandle = handle;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = annotationBox.getBoundingClientRect();
    const startWidth = rect.width;
    const startHeight = rect.height;
    const startLeft = parseFloat(annotationBox.style.left);
    const startTop = parseFloat(annotationBox.style.top);
    
    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        let newLeft = startLeft;
        let newTop = startTop;
        let newWidth = startWidth;
        let newHeight = startHeight;
        
        switch (resizeHandle) {
            case 'nw':
                newLeft = startLeft + deltaX;
                newTop = startTop + deltaY;
                newWidth = startWidth - deltaX;
                newHeight = startHeight - deltaY;
                break;
            case 'ne':
                newTop = startTop + deltaY;
                newWidth = startWidth + deltaX;
                newHeight = startHeight - deltaY;
                break;
            case 'sw':
                newLeft = startLeft + deltaX;
                newWidth = startWidth - deltaX;
                newHeight = startHeight + deltaY;
                break;
            case 'se':
                newWidth = startWidth + deltaX;
                newHeight = startHeight + deltaY;
                break;
            case 'n':
                newTop = startTop + deltaY;
                newHeight = startHeight - deltaY;
                break;
            case 's':
                newHeight = startHeight + deltaY;
                break;
            case 'e':
                newWidth = startWidth + deltaX;
                break;
            case 'w':
                newLeft = startLeft + deltaX;
                newWidth = startWidth - deltaX;
                break;
        }
        
        // Ensure minimum size
        if (newWidth < 10) newWidth = 10;
        if (newHeight < 10) newHeight = 10;
        
        // Apply changes
        annotationBox.style.left = `${newLeft}px`;
        annotationBox.style.top = `${newTop}px`;
        annotationBox.style.width = `${newWidth}px`;
        annotationBox.style.height = `${newHeight}px`;
        
        // Update annotation data with fractional coordinates
        const pageWidth = pageDiv.offsetWidth;
        const pageHeight = pageDiv.offsetHeight;
        
        annotation.x = newLeft / pageWidth;
        annotation.y = newTop / pageHeight;
        annotation.width = newWidth / pageWidth;
        annotation.height = newHeight / pageHeight;
    };
    
    const handleMouseUp = () => {
        isResizing = false;
        resizeHandle = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
}

// Start dragging
function startDrag(e: MouseEvent, annotationBox: HTMLDivElement, annotation: Annotation, pageDiv: HTMLDivElement): void {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    
    const startLeft = parseFloat(annotationBox.style.left);
    const startTop = parseFloat(annotationBox.style.top);
    
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        
        const newLeft = startLeft + deltaX;
        const newTop = startTop + deltaY;
        
        // Keep annotation within page bounds
        const pageWidth = pageDiv.offsetWidth;
        const pageHeight = pageDiv.offsetHeight;
        const boxWidth = parseFloat(annotationBox.style.width);
        const boxHeight = parseFloat(annotationBox.style.height);
        
        const clampedLeft = Math.max(0, Math.min(newLeft, pageWidth - boxWidth));
        const clampedTop = Math.max(0, Math.min(newTop, pageHeight - boxHeight));
        
        annotationBox.style.left = `${clampedLeft}px`;
        annotationBox.style.top = `${clampedTop}px`;
        
        // Update annotation data with fractional coordinates
        annotation.x = clampedLeft / pageWidth;
        annotation.y = clampedTop / pageHeight;
    };
    
    const handleMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
}

// Click outside to deselect
document.addEventListener('click', (e) => {
    if (selectedAnnotation && !selectedAnnotation.contains(e.target as Node)) {
        hideResizeHandles(selectedAnnotation);
        selectedAnnotation.style.border = '2px solid #ff0000';
        selectedAnnotation = null;
        selectedAnnotationData = null;
    }
});

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
            
            // If we have loaded annotations waiting, render them now
            if (loadedAnnotations || annotations.length > 0) {
                console.log('Rendering loaded annotations...');
                renderLoadedAnnotations();
                loadedAnnotations = null; // Clear the loaded data
            }
        } catch (reason) {
            console.error(`Error during PDF loading or rendering: ${reason}`);
        }
    };

    fileReader.readAsArrayBuffer(file);
});

// Listen for annotations file selection
annotationsUpload.addEventListener('change', async (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) {
        return;
    }

    console.log('Loading annotations file:', file.name);

    const fileReader = new FileReader();
    fileReader.onload = (e) => {
        try {
            const jsonText = e.target?.result as string;
            const jsonData = JSON.parse(jsonText);
            loadAnnotationsFromJson(jsonData);
        } catch (error) {
            console.error('Error parsing annotations JSON:', error);
            alert('Error parsing annotations file: ' + error);
        }
    };

    fileReader.readAsText(file);
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

    // Generate filename based on PDF name
    const baseFileName = fileName.replace(/\.pdf$/i, '');
    const downloadFileName = `${baseFileName}.json`;

    // Download the JSON file
    const blob = new Blob([JSON.stringify(annotationsData, null, 2)], { 
        type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('Saved annotations:', annotationsData);
});