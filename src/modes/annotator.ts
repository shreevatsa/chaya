// Mark tab functionality - region annotation on PDF
// This is essentially the existing annotator.ts functionality adapted for the unified app

import { initializePdfjs, waitForPdfjs, parseAnnotationsFromJson, Annotation as SharedAnnotation, generateId } from '../pdf-utils.js';
import { runAIAssistedAnnotation } from '../ai-orchestrator.js';

// Use shared annotation interface
type Annotation = SharedAnnotation;

let annotations: Annotation[] = [];
let loadedAnnotations: any = null; // Store loaded annotations until PDF is ready
let loadedAnnotationsFileName: string | null = null; // Track filename of loaded annotations
let isDrawing = false;
let startX = 0;
let startY = 0;
let currentAnnotation: HTMLDivElement | null = null;
let hasUnsavedChanges = false;

// Resize/drag state
let isResizing = false;
let isDragging = false;
let resizeHandle: string | null = null;
let dragStartX = 0;
let dragStartY = 0;
let selectedAnnotation: HTMLDivElement | null = null;
let selectedAnnotationData: Annotation | null = null;

export function initializeAnnotator(): void {
    console.log('Initializing Mark tab (annotator)');
    
    // Get DOM elements
    const pdfContainer = document.getElementById('pdf-container') as HTMLDivElement;
    const annotationList = document.getElementById('annotation-list') as HTMLDivElement;
    const annotationCount = document.getElementById('annotation-count') as HTMLDivElement;

    if (!pdfContainer || !annotationList || !annotationCount) {
        console.error('Required DOM elements not found for Mark tab');
        return;
    }

    // Listen for mark tab specific data ready event
    document.addEventListener('markTabDataReady', (event: Event) => {
        const customEvent = event as CustomEvent;
        const { pdfDocument, annotations: loadedAnnotations, annotationsFileName, pdfFileName } = customEvent.detail;
        handleDataReady(pdfDocument, loadedAnnotations, annotationsFileName, pdfFileName);
    });

    // Set up event listeners
    setupEventListeners();
    
    function handleDataReady(pdfDocument: any, loadedAnnotations: Annotation[], annotationsFileName: string | null, pdfFileName: string | null): void {
        console.log('Mark tab: Data ready', { pdfDocument, loadedAnnotations, annotationsFileName, pdfFileName });
        
        // Update global state
        annotations = loadedAnnotations || [];
        loadedAnnotationsFileName = annotationsFileName;
        hasUnsavedChanges = false;
        
        // Clear container and render PDF
        const pdfContainer = document.getElementById('pdf-container') as HTMLDivElement;
        pdfContainer.innerHTML = '';
        
        // Render PDF pages
        renderPdfPages(pdfDocument, pdfContainer);
        
        // Update annotation list
        updateAnnotationList();
    }
    
    async function renderPdfPages(pdfDocument: any, container: HTMLDivElement): Promise<void> {
        const containerWidth = container.offsetWidth;
        const totalPages = pdfDocument.numPages;
        
        console.log(`Starting to render ${totalPages} pages...`);
        
        try {
            for (let i = 1; i <= totalPages; i++) {
                // Update progress during rendering (30% to 100% = 70% of the progress bar)
                const progress = 30 + (70 * i / totalPages);
                const isLastPage = i === totalPages;
                const statusText = isLastPage ? 'Complete!' : `Rendering page ${i} of ${totalPages}...`;
                const detailText = isLastPage ? 'PDF ready for annotation' : `Processing page ${i}`;
                
                console.log(`Rendering page ${i}/${totalPages}, progress: ${progress.toFixed(1)}%`);
                updateAppProgress(progress, statusText, detailText);
                
                await renderPage(pdfDocument, i, containerWidth);
                console.log(`Page ${i} rendered successfully`);
            }
            
            console.log(`All ${totalPages} pages rendered successfully`);
            
            // Render loaded annotations if any
            if (annotations.length > 0) {
                console.log('Rendering loaded annotations...');
                renderLoadedAnnotations();
            }
            
            // Notify app that rendering is complete (but don't update progress since we already did)
            console.log('Dispatching rendering complete event');
            const renderingCompleteEvent = new CustomEvent('tabRenderingComplete', {
                detail: {
                    tabName: 'mark',
                    totalPages: totalPages
                }
            });
            document.dispatchEvent(renderingCompleteEvent);
            
        } catch (error) {
            console.error('Error during PDF page rendering:', error);
            updateAppProgress(0, 'Error rendering pages', `Failed at page: ${error}`);
            
            // Still notify completion even on error
            const errorEvent = new CustomEvent('tabRenderingComplete', {
                detail: {
                    tabName: 'mark',
                    totalPages: totalPages,
                    error: error
                }
            });
            document.dispatchEvent(errorEvent);
        }
    }
    
    function setupEventListeners(): void {
        // Event listeners for annotation functionality would go here
        // (Save functionality moved to .chaya download)
    }

    // Helper functions for annotation management
    function syncWithAppState(): void {
        const chayaApp = (window as any).chayaApp;
        if (chayaApp) {
            chayaApp.updateAnnotations(annotations);
        }
    }

    function updateAppProgress(percent: number, text: string, details: string): void {
        const chayaApp = (window as any).chayaApp;
        if (chayaApp && chayaApp.updateLoadingProgress) {
            chayaApp.updateLoadingProgress(percent, text, details);
        }
    }

    async function renderPage(pdf: any, pageNumber: number, containerWidth: number) {
        const page = await pdf.getPage(pageNumber);

        // Calculate scale to fit the container width, up to a maximum.
        const baseViewport = page.getViewport({ scale: 1.0 });
        const maxWidth = 1200; // Maximum width in pixels
        const targetWidth = Math.min(containerWidth, maxWidth);
        const scale = targetWidth / baseViewport.width;

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
        
        aiButton.addEventListener('click', async () => {
            const newAnnotations = await runAIAssistedAnnotation(pageDiv, pageNumber, annotations, getCanvasForPage);
            if (newAnnotations) {
                // Add the new annotations to the main list
                annotations.push(...newAnnotations);
                hasUnsavedChanges = true;

                // Render the new annotation boxes on their respective pages
                for (const annotation of newAnnotations) {
                    const targetPageDiv = pdfContainer.querySelector(`[data-page-number="${annotation.pageNumber}"]`) as HTMLDivElement;
                    if (targetPageDiv) {
                        const targetAnnotationLayer = targetPageDiv.querySelector('.annotation-layer') as HTMLDivElement;
                        if (targetAnnotationLayer) {
                            createAnnotationBox(targetAnnotationLayer, targetPageDiv, annotation);
                        }
                    } else {
                        console.warn(`Could not find page div for annotation on page ${annotation.pageNumber}`);
                    }
                }

                // Update the sidebar and sync with app state
                updateAnnotationList();
                syncWithAppState();
                console.log(`Added ${newAnnotations.length} AI-generated annotations.`);
            }
        });

        pageDiv.appendChild(canvas);
        pageDiv.appendChild(annotationLayer);
        pageDiv.appendChild(aiButton);

        const renderContext = {
            canvasContext: context!,
            viewport: viewport
        };

        await page.render(renderContext).promise;
        
        // Only append to container after the page is fully rendered
        pdfContainer.appendChild(pageDiv);

        // Add mouse event listeners for annotation drawing
        setupAnnotationDrawing(annotationLayer, pageDiv, pageNumber);
    }


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

    // Helper functions for annotation management
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
                hasUnsavedChanges = true;

                // Remove the temporary annotation
                overlay.removeChild(currentAnnotation);
                
                // Create proper annotation box using the same path as loaded annotations
                createAnnotationBox(overlay, pageDiv, annotation);
                
                // Auto-select the newly created annotation so user can resize it immediately
                const newAnnotationBox = overlay.querySelector(`[data-annotation-id="${annotation.id}"]`) as HTMLDivElement;
                if (newAnnotationBox) {
                    selectAnnotation(newAnnotationBox, annotation);
                }

                // Update the annotation list and sync with app state
                updateAnnotationList();
                syncWithAppState();

                console.log('Created annotation:', annotation);
            } else {
                // Remove the annotation if it's too small
                overlay.removeChild(currentAnnotation);
            }

            currentAnnotation = null;
        });
    }

    function createAnnotationBox(overlay: HTMLDivElement, pageDiv: HTMLDivElement, annotation: Annotation): void {
        // Check if annotation box already exists to prevent duplicates
        const existingBox = overlay.querySelector(`[data-annotation-id="${annotation.id}"]`);
        if (existingBox) {
            console.log(`Annotation box with ID ${annotation.id} already exists, skipping creation`);
            return;
        }

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
            e.stopPropagation();
            selectAnnotation(annotationBox, annotation);
            if (e.detail === 2) { // Double click to edit label
                const newLabel = window.prompt('Edit label:', annotation.label);
                if (newLabel !== null && newLabel.trim() !== '') {
                    annotation.label = newLabel.trim();
                    annotationBox.title = newLabel.trim();
                    hasUnsavedChanges = true;
                    updateAnnotationList();
                    syncWithAppState();
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
            highlightSidebarAnnotation(annotation.id, true);
        });

        annotationBox.addEventListener('mouseleave', () => {
            highlightSidebarAnnotation(annotation.id, false);
        });
    }

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

    function showResizeHandles(annotationBox: HTMLDivElement): void {
        const handles = annotationBox.querySelectorAll('.resize-handle');
        handles.forEach(handle => {
            (handle as HTMLElement).style.display = 'block';
        });
    }

    function hideResizeHandles(annotationBox: HTMLDivElement): void {
        const handles = annotationBox.querySelectorAll('.resize-handle');
        handles.forEach(handle => {
            (handle as HTMLElement).style.display = 'none';
        });
    }

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
            hasUnsavedChanges = true;
            syncWithAppState();
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
            hasUnsavedChanges = true;
            syncWithAppState();
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

    function selectAnnotationById(annotationId: string): void {
        const annotation = annotations.find(a => a.id === annotationId);
        if (!annotation) return;

        const annotationBox = document.querySelector(`.annotation-box[data-annotation-id="${annotationId}"]`) as HTMLDivElement;
        if (annotationBox) {
            selectAnnotation(annotationBox, annotation);
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

    function highlightSidebarAnnotation(annotationId: string, highlight: boolean): void {
        const sidebarItem = document.querySelector(`#annotation-list [data-annotation-id="${annotationId}"]`) as HTMLDivElement;
        if (sidebarItem) {
            if (highlight) {
                sidebarItem.style.backgroundColor = '#dbeafe';
                sidebarItem.style.transform = 'scale(1.02)';
                sidebarItem.style.transition = 'all 0.2s ease';
            } else {
                sidebarItem.style.backgroundColor = '';
                sidebarItem.style.transform = '';
            }
        }
    }

    function scrollToSidebarAnnotation(annotationId: string): void {
        const sidebarItem = document.querySelector(`#annotation-list [data-annotation-id="${annotationId}"]`) as HTMLDivElement;
        if (sidebarItem) {
            sidebarItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            highlightSidebarAnnotation(annotationId, true);
            setTimeout(() => highlightSidebarAnnotation(annotationId, false), 2000);
        }
    }

    function deleteAnnotationById(annotationId: string): void {
        const index = annotations.findIndex(a => a.id === annotationId);
        if (index === -1) return;

        annotations.splice(index, 1);
        hasUnsavedChanges = true;

        const annotationBoxes = document.querySelectorAll(`.annotation-box[data-annotation-id="${annotationId}"]`);
        annotationBoxes.forEach(box => {
            box.remove();
        });

        updateAnnotationList();
        syncWithAppState();

        if (selectedAnnotationData && selectedAnnotationData.id === annotationId) {
            selectedAnnotation = null;
            selectedAnnotationData = null;
        }
    }

    function getCanvasForPage(pageNumber: number): HTMLCanvasElement | null {
        const pageDiv = pdfContainer.querySelector(`[data-page-number="${pageNumber}"]`) as HTMLDivElement;
        if (pageDiv) {
            return pageDiv.querySelector('canvas');
        }
        return null;
    }

    // Clean up temporary annotations on any click and handle deselection
    document.addEventListener('click', (e) => {
        const tempAnnotations = document.querySelectorAll('.annotation-box-tmp');
        tempAnnotations.forEach(temp => temp.remove());

        isDrawing = false;
        currentAnnotation = null;

        if (selectedAnnotation && !selectedAnnotation.contains(e.target as Node)) {
            hideResizeHandles(selectedAnnotation);
            selectedAnnotation.style.border = '2px solid #ff0000';
            selectedAnnotation = null;
            selectedAnnotationData = null;
        }
    });

    // Event listener for delete annotation buttons
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

    // Warn user about unsaved changes when leaving the page
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges && annotations.length > 0) {
            const message = 'You have unsaved annotations. Are you sure you want to leave?';
            e.preventDefault();
            e.returnValue = message;
            return message;
        }
    });
}