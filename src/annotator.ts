import { initializePdfjs, waitForPdfjs, parseAnnotationsFromJson, Annotation as SharedAnnotation } from './pdf-utils.js';

// PDF.js is loaded globally via script tag in the HTML
declare const pdfjsLib: any;

// Initialize PDF.js
initializePdfjs();

const pdfUpload = document.getElementById('pdf-upload') as HTMLInputElement;
const annotationsUpload = document.getElementById('annotations-upload') as HTMLInputElement;
const pdfContainer = document.getElementById('pdf-container') as HTMLDivElement;
const saveAnnotationsBtn = document.getElementById('save-annotations') as HTMLButtonElement;
const annotationList = document.getElementById('annotation-list') as HTMLDivElement;
const annotationCount = document.getElementById('annotation-count') as HTMLDivElement;

// Use shared annotation interface
type Annotation = SharedAnnotation;

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

    // Calculate scale to limit maximum width while maintaining aspect ratio
    const baseViewport = page.getViewport({ scale: 1.0 });
    const maxWidth = 1200; // Maximum width in pixels - adjust this to control PDF size
    const scale = baseViewport.width > maxWidth ? maxWidth / baseViewport.width : 1.5;

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

    // Create AI annotate button
    const aiButton = document.createElement('button');
    aiButton.className = 'ai-annotate-btn';
    aiButton.style.position = 'absolute';
    aiButton.style.top = '8px';
    aiButton.style.right = '8px';
    aiButton.style.backgroundColor = '#3b82f6';
    aiButton.style.color = 'white';
    aiButton.style.border = 'none';
    aiButton.style.borderRadius = '6px';
    aiButton.style.padding = '6px 12px';
    aiButton.style.fontSize = '12px';
    aiButton.style.cursor = 'pointer';
    aiButton.style.zIndex = '1000';
    aiButton.style.fontFamily = 'sans-serif';
    aiButton.textContent = '🤖 AI Annotate';
    aiButton.title = 'Use AI to automatically annotate this page';
    
    aiButton.addEventListener('click', () => {
        showAIPromptDialog(pageDiv, pageNumber);
    });

    pageDiv.appendChild(canvas);
    pageDiv.appendChild(annotationLayer);
    pageDiv.appendChild(aiButton);
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
        // Only start drawing on left mouse button (button 0)
        if (e.button !== 0) return;

        isDrawing = true;
        const rect = overlay.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;

        // Create a new temporary annotation box
        currentAnnotation = document.createElement('div');
        currentAnnotation.className = 'annotation-box-tmp';
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

            // Remove the temporary annotation
            overlay.removeChild(currentAnnotation);
            
            // Create proper annotation box using the same path as loaded annotations
            createAnnotationBox(overlay, pageDiv, annotation);
            
            // Auto-select the newly created annotation so user can resize it immediately
            const newAnnotationBox = overlay.querySelector(`[data-annotation-id="${annotation.id}"]`) as HTMLDivElement;
            if (newAnnotationBox) {
                selectAnnotation(newAnnotationBox, annotation);
            }

            // Update the annotation list
            updateAnnotationList();

            console.log('Created annotation:', annotation);
        } else {
            // Remove the annotation if it's too small
            overlay.removeChild(currentAnnotation);
        }

        currentAnnotation = null;
    });

    // // Prevent context menu on right-click to avoid interference
    // overlay.addEventListener('contextmenu', (e) => {
    //     e.preventDefault();
    // });
}

// Generate unique ID for annotations
function generateId(): string {
    return 'annotation_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Load annotations from JSON file
function loadAnnotationsFromJson(jsonData: any): void {
    try {
        // Use shared parsing function
        const parsedAnnotations = parseAnnotationsFromJson(jsonData);

        // Clear existing annotations and use parsed ones
        annotations = parsedAnnotations;

        console.log('Loaded annotations:', annotations);

        // If PDF is already loaded, render the annotations
        if (pdfContainer.children.length > 0) {
            renderLoadedAnnotations();
        } else {
            // Store for when PDF is loaded
            loadedAnnotations = jsonData;
        }

        // Update the annotation list
        updateAnnotationList();

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
    annotationBox.dataset.annotationId = annotation.id;

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
            e.stopPropagation(); // Prevent triggering the drawing behavior on the overlay
            startResize(e, handle, annotationBox, annotation, pageDiv);
        });

        annotationBox.appendChild(handleElement);
    });

    // Add selection and drag functionality
    annotationBox.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // Prevent triggering the drawing behavior on the overlay
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

    // Add click handler to scroll to annotation in sidebar
    annotationBox.addEventListener('click', (e) => {
        e.stopPropagation();
        scrollToSidebarAnnotation(annotation.id);
    });

    // Show/hide handles on hover + highlight sidebar annotation
    annotationBox.addEventListener('mouseenter', () => {
        if (selectedAnnotation === annotationBox) {
            showResizeHandles(annotationBox);
        }
        // Highlight corresponding annotation in sidebar
        highlightSidebarAnnotation(annotation.id, true);
    });

    // Remove sidebar highlight on mouse leave
    annotationBox.addEventListener('mouseleave', () => {
        highlightSidebarAnnotation(annotation.id, false);
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

// Clean up temporary annotations on any click and handle deselection
document.addEventListener('click', (e) => {
    // Remove all temporary annotation rectangles
    const tempAnnotations = document.querySelectorAll('.annotation-box-tmp');
    tempAnnotations.forEach(temp => temp.remove());

    // Reset drawing state if interrupted
    isDrawing = false;
    currentAnnotation = null;

    // Handle deselection
    if (selectedAnnotation && !selectedAnnotation.contains(e.target as Node)) {
        hideResizeHandles(selectedAnnotation);
        selectedAnnotation.style.border = '2px solid #ff0000';
        selectedAnnotation = null;
        selectedAnnotationData = null;
    }
});

// Annotation Management Functions
function updateAnnotationList(): void {
    // Update count
    const count = annotations.length;
    annotationCount.textContent = count === 0 ? 'No annotations' :
        count === 1 ? '1 annotation' : `${count} annotations`;

    // Clear existing list
    annotationList.innerHTML = '';

    // Group annotations by page
    const annotationsByPage: { [key: number]: Annotation[] } = {};
    annotations.forEach(annotation => {
        if (!annotationsByPage[annotation.pageNumber]) {
            annotationsByPage[annotation.pageNumber] = [];
        }
        annotationsByPage[annotation.pageNumber].push(annotation);
    });

    // Create list items grouped by page
    Object.keys(annotationsByPage).sort((a, b) => parseInt(a) - parseInt(b)).forEach(pageKey => {
        const pageNumber = parseInt(pageKey);
        const pageAnnotations = annotationsByPage[pageNumber];

        // Page header
        const pageHeader = document.createElement('div');
        pageHeader.className = 'text-xs font-medium text-gray-500 uppercase tracking-wide mb-1';
        pageHeader.textContent = `Page ${pageNumber}`;
        annotationList.appendChild(pageHeader);

        // Annotations for this page
        pageAnnotations.forEach(annotation => {
            const listItem = document.createElement('div');
            listItem.className = 'bg-gray-50 border border-gray-200 rounded-lg p-3 hover:bg-gray-100 cursor-pointer transition-colors';
            listItem.dataset.annotationId = annotation.id;

            listItem.innerHTML = `
                <div class="flex items-start justify-between">
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium text-gray-900 truncate">
                            ${annotation.label}
                        </div>
                        <div class="text-xs text-gray-500 mt-1">
                            Position: ${Math.round(annotation.x * 100)}%, ${Math.round(annotation.y * 100)}%
                        </div>
                    </div>
                    <div class="ml-2 flex-shrink-0">
                        <button class="delete-annotation-btn text-red-500 hover:text-red-700 p-1" 
                                data-annotation-id="${annotation.id}" 
                                title="Delete annotation">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            // Add click handler to select annotation
            listItem.addEventListener('click', (e) => {
                if (!(e.target as Element).closest('.delete-annotation-btn')) {
                    selectAnnotationById(annotation.id);
                }
            });

            // Add hover effect for annotation highlighting
            listItem.addEventListener('mouseenter', () => {
                highlightAnnotationById(annotation.id, true);
            });

            listItem.addEventListener('mouseleave', () => {
                highlightAnnotationById(annotation.id, false);
            });

            annotationList.appendChild(listItem);
        });

        // Add some space between pages
        if (Object.keys(annotationsByPage).length > 1) {
            const spacer = document.createElement('div');
            spacer.className = 'h-2';
            annotationList.appendChild(spacer);
        }
    });
}

function selectAnnotationById(annotationId: string): void {
    const annotation = annotations.find(a => a.id === annotationId);
    if (!annotation) return;

    const annotationBox = document.querySelector(`.annotation-box[data-annotation-id="${annotationId}"]`) as HTMLDivElement;
    if (annotationBox) {
        selectAnnotation(annotationBox, annotation);

        // Scroll annotation into view
        annotationBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function highlightAnnotationById(annotationId: string, highlight: boolean): void {
    const annotationBox = document.querySelector(`.annotation-box[data-annotation-id="${annotationId}"]`) as HTMLDivElement;
    if (annotationBox) {
        if (highlight) {
            annotationBox.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.5)';
        } else {
            annotationBox.style.boxShadow = '';
        }
    }
}

// Highlight annotation in sidebar (bidirectional functionality)
function highlightSidebarAnnotation(annotationId: string, highlight: boolean): void {
    const sidebarItem = document.querySelector(`#annotation-list [data-annotation-id="${annotationId}"]`) as HTMLDivElement;
    if (sidebarItem) {
        if (highlight) {
            sidebarItem.style.backgroundColor = '#dbeafe'; // bg-blue-100
            sidebarItem.style.transform = 'scale(1.02)';
            sidebarItem.style.transition = 'all 0.2s ease';
        } else {
            sidebarItem.style.backgroundColor = '';
            sidebarItem.style.transform = '';
        }
    }
}

// Scroll to annotation in sidebar (bidirectional functionality)
function scrollToSidebarAnnotation(annotationId: string): void {
    const sidebarItem = document.querySelector(`#annotation-list [data-annotation-id="${annotationId}"]`) as HTMLDivElement;
    if (sidebarItem) {
        sidebarItem.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Temporarily highlight the sidebar item
        highlightSidebarAnnotation(annotationId, true);
        setTimeout(() => highlightSidebarAnnotation(annotationId, false), 2000);
    }
}

function deleteAnnotationById(annotationId: string): void {
    // Remove from annotations array
    const index = annotations.findIndex(a => a.id === annotationId);
    if (index === -1) return;

    annotations.splice(index, 1);

    // Remove visual annotation box from DOM
    const annotationBoxes = document.querySelectorAll(`.annotation-box[data-annotation-id="${annotationId}"]`);
    annotationBoxes.forEach(box => {
        box.remove();
    });

    // Update the annotation list
    updateAnnotationList();

    // If this was the selected annotation, clear selection
    if (selectedAnnotationData && selectedAnnotationData.id === annotationId) {
        selectedAnnotation = null;
        selectedAnnotationData = null;
    }
}


// Add event listeners for annotation management
document.addEventListener('click', (e) => {
    const deleteBtn = (e.target as Element).closest('.delete-annotation-btn') as HTMLElement;
    if (deleteBtn) {
        e.stopPropagation();
        const annotationId = deleteBtn.dataset.annotationId;
        if (annotationId) {
            deleteAnnotationById(annotationId);
        }
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

                // Update the annotation list
                updateAnnotationList();
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

// AI Annotation Functions
function showAIPromptDialog(pageDiv: HTMLDivElement, pageNumber: number): void {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '2000';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    // Create dialog
    const dialog = document.createElement('div');
    dialog.style.backgroundColor = 'white';
    dialog.style.borderRadius = '8px';
    dialog.style.padding = '24px';
    dialog.style.maxWidth = '500px';
    dialog.style.width = '90%';
    dialog.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.2)';

    dialog.innerHTML = `
        <h3 style="margin: 0 0 16px 0; font-family: sans-serif; color: #1f2937;">AI Annotate Page ${pageNumber}</h3>
        <label style="display: block; margin-bottom: 8px; font-family: sans-serif; font-size: 14px; color: #374151;">
            Prompt for AI:
        </label>
        <textarea id="ai-prompt" style="width: 100%; height: 120px; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; font-family: sans-serif; font-size: 14px; resize: vertical; box-sizing: border-box;">Break this document page into "regions" (paragraphs etc), and for each region, provide coordinates (as percentages of page width/height) and a descriptive label.

Return response as an array in JSON, with each array element having fields (x, y, width, height, label) — the first four are numbers between 0 and 1, and the last one is a string.</textarea>
        <div style="margin-top: 16px; display: flex; gap: 12px; justify-content: flex-end;">
            <button id="ai-cancel" style="padding: 8px 16px; border: 1px solid #d1d5db; background: white; color: #374151; border-radius: 6px; cursor: pointer; font-family: sans-serif;">Cancel</button>
            <button id="ai-submit" style="padding: 8px 16px; border: none; background: #3b82f6; color: white; border-radius: 6px; cursor: pointer; font-family: sans-serif;">🤖 Annotate with AI</button>
        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Focus the textarea
    const textarea = dialog.querySelector('#ai-prompt') as HTMLTextAreaElement;
    textarea.focus();

    // Handle cancel
    const cancelBtn = dialog.querySelector('#ai-cancel') as HTMLButtonElement;
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });

    // Handle submit
    const submitBtn = dialog.querySelector('#ai-submit') as HTMLButtonElement;
    submitBtn.addEventListener('click', async () => {
        const prompt = textarea.value.trim();
        if (!prompt) {
            alert('Please enter a prompt for the AI');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '🔄 Round 1/2...';
        
        try {
            await processPageWithAI(pageDiv, pageNumber, prompt, submitBtn);
            document.body.removeChild(overlay);
        } catch (error) {
            console.error('AI processing failed:', error);
            alert('AI processing failed: ' + error);
            submitBtn.disabled = false;
            submitBtn.textContent = '🤖 Annotate with AI';
        }
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    });
}

// Create an image with annotation rectangles overlaid on top
function createPageImageWithAnnotations(sourceCanvas: HTMLCanvasElement, annotations: Annotation[]): string {
    // Create a new canvas with the same dimensions
    const overlayCanvas = document.createElement('canvas');
    const ctx = overlayCanvas.getContext('2d')!;
    overlayCanvas.width = sourceCanvas.width;
    overlayCanvas.height = sourceCanvas.height;
    
    // Draw the original page image
    ctx.drawImage(sourceCanvas, 0, 0);
    
    // Draw annotation rectangles on top
    annotations.forEach(annotation => {
        const x = annotation.x * sourceCanvas.width;
        const y = annotation.y * sourceCanvas.height;
        const width = annotation.width * sourceCanvas.width;
        const height = annotation.height * sourceCanvas.height;
        
        // Draw rectangle border
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
        
        // Draw semi-transparent fill
        ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
        ctx.fillRect(x, y, width, height);
        
        // Draw label if there's space
        if (width > 50 && height > 20) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y - 20, Math.min(width, ctx.measureText(annotation.label).width + 8), 20);
            ctx.fillStyle = '#000000';
            ctx.font = '12px sans-serif';
            ctx.fillText(annotation.label, x + 4, y - 6);
        }
    });
    
    // Return as base64
    return overlayCanvas.toDataURL('image/png').split(',')[1];
}

// Get examples from up to 2 most recent pages that have annotations
function getExamplesFromRecentPages(currentPageNumber: number): Array<{pageNumber: number, annotations: Annotation[], imageWithAnnotations?: string}> {
    const examples: Array<{pageNumber: number, annotations: Annotation[], imageWithAnnotations?: string}> = [];
    
    // Get unique page numbers with annotations, excluding current page
    const annotatedPages = [...new Set(
        annotations
            .filter(ann => ann.pageNumber !== currentPageNumber)
            .map(ann => ann.pageNumber)
    )].sort((a, b) => b - a); // Sort descending to get most recent first
    
    // Take up to 2 most recent pages
    for (const pageNum of annotatedPages.slice(0, 2)) {
        const pageAnnotations = annotations.filter(ann => ann.pageNumber === pageNum);
        if (pageAnnotations.length > 0) {
            // Find the canvas for this page
            const pageDiv = pdfContainer.querySelector(`[data-page-number="${pageNum}"]`) as HTMLDivElement;
            let imageWithAnnotations: string | undefined;
            
            if (pageDiv) {
                const canvas = pageDiv.querySelector('canvas') as HTMLCanvasElement;
                if (canvas) {
                    imageWithAnnotations = createPageImageWithAnnotations(canvas, pageAnnotations);
                }
            }
            
            examples.push({
                pageNumber: pageNum,
                annotations: pageAnnotations,
                imageWithAnnotations
            });
        }
    }
    
    return examples;
}

// Round 1: Call AI with examples from previous pages
async function callGeminiAPIWithExamples(
    base64Image: string, 
    prompt: string, 
    examples: Array<{pageNumber: number, annotations: Annotation[], imageWithAnnotations?: string}>, 
    apiKey: string
): Promise<string> {
    let enhancedPrompt = prompt;
    
    // Add information about examples if available
    if (examples.length > 0) {
        enhancedPrompt += `\n\nI'm providing ${examples.length} example${examples.length === 1 ? '' : 's'} from OTHER pages that I have already annotated, to help you understand the annotation style and quality expected. These are NOT for the current page you're annotating - they're just examples to show you what good annotations look like. Each example includes both the visual representation (page with red rectangles overlaid) and the corresponding JSON coordinates.`;
    }
    
    const imageParts: any[] = [{ text: enhancedPrompt }];
    
    // Add the current page image first
    imageParts.push({
        inline_data: {
            mime_type: "image/png",
            data: base64Image
        }
    });
    
    // Add examples if available
    if (examples.length > 0) {
        let exampleText = '\n\nEXAMPLES FROM OTHER PAGES (for style reference only):\n';
        
        for (const example of examples) {
            exampleText += `\n--- Example: Page ${example.pageNumber} ---\n`;
            exampleText += 'Annotations (JSON coordinates):\n';
            exampleText += JSON.stringify(example.annotations.map(ann => ({
                x: ann.x,
                y: ann.y,
                width: ann.width,
                height: ann.height,
                label: ann.label
            })), null, 2);
            exampleText += '\n\nVisual representation (see image below with red rectangles overlaid):\n';
            
            // Add the example image with annotations overlaid if available
            if (example.imageWithAnnotations) {
                imageParts.push({
                    inline_data: {
                        mime_type: "image/png",
                        data: example.imageWithAnnotations
                    }
                });
            }
            exampleText += '\n';
        }
        
        exampleText += '\nPlease follow a similar annotation style, level of detail, and coordinate precision for the current page (first image above). Remember: these examples are from OTHER pages - do NOT copy these exact annotations, but use them as a guide for the style and quality of annotations to create for the current page.';
        
        // Update the first text part with the enhanced prompt
        imageParts[0] = { text: enhancedPrompt + exampleText };
    }
    
    return callGeminiAPIAdvanced(imageParts, apiKey);
}

// Advanced API call that can handle multiple images
async function callGeminiAPIAdvanced(imageParts: any[], apiKey: string): Promise<string> {
    const requestBody = {
        contents: [{
            parts: imageParts
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
        }
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response from Gemini API');
    }

    return data.candidates[0].content.parts[0].text;
}

// Round 2: Ask AI to review and refine its own annotations
async function callGeminiAPIForReview(
    pageCanvas: HTMLCanvasElement,
    originalPrompt: string,
    examples: Array<{pageNumber: number, annotations: Annotation[], imageWithAnnotations?: string}>,
    initialAnnotations: Annotation[], 
    apiKey: string
): Promise<string> {
    // Create image with initial annotations overlaid
    const imageWithAnnotations = createPageImageWithAnnotations(pageCanvas, initialAnnotations);
    
    let reviewPrompt = `ROUND 2: REVIEW AND REFINEMENT

This is the second round of a two-round annotation process. In Round 1, I asked you to annotate this page based on the prompt: "${originalPrompt}"`;
    
    // Add examples context if available
    if (examples.length > 0) {
        reviewPrompt += ` I also provided ${examples.length} example${examples.length === 1 ? '' : 's'} from OTHER previously annotated pages as style guides.`;
    }
    
    reviewPrompt += `\n\nYour Round 1 annotations were:\n${JSON.stringify(initialAnnotations.map(ann => ({
        x: ann.x,
        y: ann.y, 
        width: ann.width,
        height: ann.height,
        label: ann.label
    })), null, 2)}`;
    
    reviewPrompt += `\n\nNow I'm providing you with ALL the same context from Round 1 (original page, examples, and prompt), PLUS an image showing your Round 1 annotations overlaid as red rectangles.\n\nPlease review and refine your annotations. Consider:
- Are there any regions you missed?
- Are the coordinates accurate and well-positioned?
- Are the labels descriptive and consistent with the examples?
- Should any regions be split or merged?
- Do the rectangles properly capture the content boundaries?
- How do your annotations compare to the quality and style of the examples?

Return your final, improved annotations as a JSON array with the same format (x, y, width, height, label).`;
    
    const imageParts: any[] = [{ text: reviewPrompt }];
    
    // Add the original page image first
    const originalImage = pageCanvas.toDataURL('image/png').split(',')[1];
    imageParts.push({
        inline_data: {
            mime_type: "image/png",
            data: originalImage
        }
    });
    
    // Add all the examples from Round 1
    if (examples.length > 0) {
        let exampleText = '\n\nSAME EXAMPLES FROM ROUND 1 (from OTHER pages, for style reference):\n';
        
        for (const example of examples) {
            exampleText += `\n--- Example: Page ${example.pageNumber} ---\n`;
            exampleText += 'Annotations (JSON coordinates):\n';
            exampleText += JSON.stringify(example.annotations.map(ann => ({
                x: ann.x,
                y: ann.y,
                width: ann.width,
                height: ann.height,
                label: ann.label
            })), null, 2);
            exampleText += '\n\nVisual representation (see image below):\n';
            
            // Add the example image with annotations overlaid if available
            if (example.imageWithAnnotations) {
                imageParts.push({
                    inline_data: {
                        mime_type: "image/png",
                        data: example.imageWithAnnotations
                    }
                });
            }
        }
        
        // Update the first text part to include examples
        imageParts[0] = { text: reviewPrompt + exampleText };
    }
    
    // Add the current page with Round 1 annotations overlaid
    imageParts.push({
        inline_data: {
            mime_type: "image/png",
            data: imageWithAnnotations
        }
    });
    
    // Add final instruction
    const finalText = '\n\nABOVE: Current page with your Round 1 annotations shown as red rectangles. Please provide your final, refined annotations.';
    if (examples.length > 0) {
        imageParts[0] = { text: imageParts[0].text + finalText };
    } else {
        imageParts[0] = { text: reviewPrompt + finalText };
    }
    
    return callGeminiAPIAdvanced(imageParts, apiKey);
}

async function processPageWithAI(pageDiv: HTMLDivElement, pageNumber: number, prompt: string, submitBtn?: HTMLButtonElement): Promise<void> {
    // Get the canvas from the page
    const canvas = pageDiv.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) {
        throw new Error('Could not find canvas for page');
    }

    // Convert canvas to base64 image
    const imageDataUrl = canvas.toDataURL('image/png');
    const base64Image = imageDataUrl.split(',')[1]; // Remove data:image/png;base64, prefix

    // Get Gemini API key from environment or prompt user
    let apiKey = localStorage.getItem('gemini-api-key');
    if (!apiKey) {
        apiKey = window.prompt('Please enter your Gemini API key (will be saved for this session):');
        if (!apiKey) {
            throw new Error('API key is required');
        }
        localStorage.setItem('gemini-api-key', apiKey);
    }

    // Get examples from up to 2 most recent annotated pages
    const examples = getExamplesFromRecentPages(pageNumber);
    
    // Round 1: Initial annotation with examples
    console.log('AI Round 1: Initial annotation with examples');
    const round1Response = await callGeminiAPIWithExamples(base64Image, prompt, examples, apiKey);
    const initialAnnotations = parseAIResponse(round1Response, pageNumber);
    
    // Round 2: Self-review and refinement
    if (submitBtn) {
        submitBtn.textContent = '🔄 Round 2/2...';
    }
    console.log('AI Round 2: Self-review and refinement');
    const round2Response = await callGeminiAPIForReview(canvas, prompt, examples, initialAnnotations, apiKey);
    const finalAnnotations = parseAIResponse(round2Response, pageNumber);
    
    // Create annotation boxes using our existing system
    const annotationLayer = pageDiv.querySelector('.annotation-layer') as HTMLDivElement;
    for (const annotation of finalAnnotations) {
        annotations.push(annotation);
        createAnnotationBox(annotationLayer, pageDiv, annotation);
    }
    
    // Update the annotation list
    updateAnnotationList();
    
    console.log(`Created ${finalAnnotations.length} AI annotations for page ${pageNumber} after 2 rounds`);
}

async function callGeminiAPI(base64Image: string, prompt: string, apiKey: string): Promise<string> {
    const enhancedPrompt = `${prompt}

Please respond with a JSON array of annotations. Each annotation should have this exact format:
{
  "x": 0.1,        // X position as percentage (0.0 to 1.0)
  "y": 0.2,        // Y position as percentage (0.0 to 1.0) 
  "width": 0.3,    // Width as percentage (0.0 to 1.0)
  "height": 0.1,   // Height as percentage (0.0 to 1.0)
  "label": "Table showing sales data"  // Descriptive label
}

Only return the JSON array, nothing else.`;

    const requestBody = {
        contents: [{
            parts: [
                { text: enhancedPrompt },
                {
                    inline_data: {
                        mime_type: "image/png",
                        data: base64Image
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
        }
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response from Gemini API');
    }

    return data.candidates[0].content.parts[0].text;
}

function parseAIResponse(response: string, pageNumber: number): Annotation[] {
    try {
        // Extract JSON from response (in case there's extra text)
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('No JSON array found in AI response');
        }

        const aiRegions = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(aiRegions)) {
            throw new Error('AI response is not an array');
        }

        return aiRegions.map((region: any, index: number) => {
            // Validate the region format
            if (typeof region.x !== 'number' || typeof region.y !== 'number' ||
                typeof region.width !== 'number' || typeof region.height !== 'number' ||
                typeof region.label !== 'string') {
                console.warn('Invalid region format from AI:', region);
                return null;
            }

            // Clamp values to valid ranges
            const annotation: Annotation = {
                id: generateId(),
                x: Math.max(0, Math.min(1, region.x)),
                y: Math.max(0, Math.min(1, region.y)),
                width: Math.max(0.01, Math.min(1 - region.x, region.width)),
                height: Math.max(0.01, Math.min(1 - region.y, region.height)),
                label: region.label || `AI Region ${index + 1}`,
                pageNumber: pageNumber
            };

            return annotation;
        }).filter(Boolean) as Annotation[];

    } catch (error) {
        console.error('Failed to parse AI response:', error);
        console.log('Raw AI response:', response);
        throw new Error('Failed to parse AI response. Please check the console for details.');
    }
}
