import { MarkedRegion, appState, ChayaDocument } from './models.js';
import { runAIAssistedAnnotation } from './ai-orchestrator.js';

export class MarkController {
    // DOM Element References
    private pdfContainer: HTMLDivElement;
    private annotationList: HTMLDivElement;

    // State
    private selectedAnnotationId: string | null = null;

    // Interaction State (for drawing, resizing, dragging)
    private isDrawing = false;
    private isResizing = false;
    private isDragging = false;
    private interactionState: {
        startX: number;
        startY: number;
        startWidth?: number;
        startHeight?: number;
        startLeft?: number;
        startTop?: number;
        resizeHandle?: string;
        currentBox?: HTMLDivElement;
    } = { startX: 0, startY: 0 };

    constructor(
        pdfContainer: HTMLDivElement,
        annotationList: HTMLDivElement,
    ) {
        this.pdfContainer = pdfContainer;
        this.annotationList = annotationList;
        this._setupGlobalListeners();
    }

    public prepareForDocument(): void {
        this.pdfContainer.innerHTML = '';
        this.annotationList.innerHTML = '';
    }

    // Renders a single page and its annotations as they become available.
    public renderPage(pageNumber: number): void {
        this._renderPageCanvas(pageNumber);
        this._renderAnnotationsForPage(pageNumber);
        this._updateAnnotationListForPage(pageNumber);
    }

    // --- Private Methods (Rendering) ---
    private _renderPageCanvas(pageNumber: number): void {
        const cachedCanvas = appState.pageCanvasCache.get(pageNumber);
        if (!cachedCanvas) {
            console.error(`Canvas for page ${pageNumber} not found in cache.`);
            return;
        }

        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.style.position = 'relative';
        pageDiv.style.marginBottom = '1rem';
        pageDiv.dataset.pageNumber = String(pageNumber);
        pageDiv.style.width = `${cachedCanvas.width}px`;
        pageDiv.style.height = `${cachedCanvas.height}px`;

        // Create a new, blank canvas for this tab.
        const canvas = document.createElement('canvas');
        canvas.width = cachedCanvas.width;
        canvas.height = cachedCanvas.height;
        canvas.style.border = '1px solid #ccc';
        const context = canvas.getContext('2d')!;
        context.drawImage(cachedCanvas, 0, 0);

        const annotationLayer = document.createElement('div');
        annotationLayer.className = 'annotation-layer';
        annotationLayer.style.position = 'absolute';
        annotationLayer.style.top = '0';
        annotationLayer.style.left = '0';
        annotationLayer.style.width = '100%';
        annotationLayer.style.height = '100%';
        annotationLayer.style.cursor = 'crosshair';
        annotationLayer.addEventListener('mousedown', (e) => this._onDrawStart(e, pageDiv, pageNumber));
        annotationLayer.addEventListener('mousemove', (e) => this._onDrawMove(e));
        annotationLayer.addEventListener('mouseup', (e) => this._onDrawEnd(e, pageDiv, pageNumber));
        annotationLayer.addEventListener('mouseleave', (e) => this._onDrawEnd(e, pageDiv, pageNumber));

        const aiButton = this._createAiButton(pageDiv, pageNumber);
        pageDiv.append(canvas, annotationLayer, aiButton);
        this.pdfContainer.appendChild(pageDiv);
    }

    private _renderAnnotationsForPage(pageNumber: number): void {
        const regions = appState.chayaDocument.markedRegions.get(pageNumber);
        if (!regions) return;

        const pageDiv = this.pdfContainer.querySelector<HTMLDivElement>(`[data-page-number="${pageNumber}"]`);
        const layer = pageDiv?.querySelector<HTMLDivElement>('.annotation-layer');
        if (pageDiv && layer) {
            regions.forEach(annotation => this._createAnnotationBox(layer, pageDiv, annotation));
        }
    }

    private _updateAnnotationListForPage(pageNumber: number): void {
        const regions = appState.chayaDocument.markedRegions.get(pageNumber);
        if (!regions || regions.length === 0) return;

        // Check if a header for this page already exists to avoid duplicates
        if (this.annotationList.querySelector(`[data-page-header="${pageNumber}"]`)) return;

        const pageHeader = document.createElement('div');
        pageHeader.className = 'text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 mt-2 first:mt-0';
        pageHeader.textContent = `Page ${pageNumber}`;
        pageHeader.dataset.pageHeader = String(pageNumber);
        this.annotationList.appendChild(pageHeader);

        regions.forEach(annotation => {
            const listItem = this._createAnnotationListItem(annotation);
            // Add a page number dataset to the list item for easier removal.
            listItem.dataset.pageNumber = String(pageNumber);
            this.annotationList.appendChild(listItem);
        });
    }

    // --- Private Methods (Annotation Box & List Item Creation) ---

    private _createAnnotationBox(overlay: HTMLDivElement, pageDiv: HTMLDivElement, annotation: MarkedRegion): HTMLDivElement | null {
        const existingBox = overlay.querySelector(`[data-annotation-id="${annotation.id}"]`);
        if (existingBox) {
            console.warn(`Annotation box with ID ${annotation.id} already exists. Skipping creation.`);
            return null;
        }

        const pageWidth = pageDiv.offsetWidth;
        const pageHeight = pageDiv.offsetHeight;

        const box = document.createElement('div');
        box.className = 'annotation-box';
        box.dataset.annotationId = annotation.id;
        box.style.position = 'absolute';
        box.style.border = '2px solid #ff0000';
        box.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
        box.style.left = `${annotation.x * pageWidth}px`;
        box.style.top = `${annotation.y * pageHeight}px`;
        box.style.width = `${annotation.width * pageWidth}px`;
        box.style.height = `${annotation.height * pageHeight}px`;
        box.style.cursor = 'move';
        box.title = annotation.label;

        // Add resize handles
        ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].forEach(handleType => {
            box.appendChild(this._createResizeHandle(handleType));
        });

        box.addEventListener('mousedown', e => this._onBoxMouseDown(e, box, annotation, pageDiv));
        box.addEventListener('dblclick', e => this._onBoxDoubleClick(e, box, annotation));
        box.addEventListener('mouseenter', () => this._highlightSidebarItem(annotation.id, true));
        box.addEventListener('mouseleave', () => this._highlightSidebarItem(annotation.id, false));

        overlay.appendChild(box);
        return box;
    }

    private _createAnnotationListItem(annotation: MarkedRegion): HTMLDivElement {
        const item = document.createElement('div');
        item.className = 'bg-gray-50 border border-gray-200 rounded-lg p-3 my-1 hover:bg-gray-100 cursor-pointer transition-colors';
        item.dataset.annotationId = annotation.id;
        item.dataset.pageNumber = String(annotation.pageNumber);
        item.innerHTML = `
            <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 truncate">${annotation.label}</div>
                </div>
                <div class="ml-2 flex-shrink-0">
                    <button class="delete-annotation-btn text-red-500 hover:text-red-700 p-1" title="Delete region">
                        <svg class="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>
                    </button>
                </div>
            </div>`;

        item.addEventListener('click', e => {
            if ((e.target as HTMLElement).classList.contains('delete-annotation-btn')) {
                this._deleteAnnotation(annotation.id);
            } else {
                this._selectAnnotation(annotation.id, true);
            }
        });
        item.addEventListener('mouseenter', () => this._highlightAnnotationBox(annotation.id, true));
        item.addEventListener('mouseleave', () => this._highlightAnnotationBox(annotation.id, false));
        return item;
    }

    private _createResizeHandle(type: string): HTMLDivElement {
        const handle = document.createElement('div');
        handle.className = `resize-handle resize-${type}`;
        handle.dataset.handle = type;
        return handle;
    }

    private _createAiButton(pageDiv: HTMLDivElement, pageNumber: number): HTMLButtonElement {
        const button = document.createElement('button');
        button.className = 'ai-annotate-btn';
        button.textContent = '🤖 AI Mark Regions';
        button.title = 'Use AI to automatically mark regions on this and subsequent pages';

        button.addEventListener('click', async () => {
            // Flatten the map values into a list for the AI orchestrator.
            const allCurrentAnnotations = Array.from(appState.chayaDocument.markedRegions.values()).flat();
            const newAnnotations = await runAIAssistedAnnotation(pageDiv, pageNumber, allCurrentAnnotations, this._getCanvasForPage.bind(this));

            if (newAnnotations && newAnnotations.length > 0) {
                newAnnotations.forEach(annotation => {
                    const pageNum = annotation.pageNumber;
                    if (!appState.chayaDocument.markedRegions.has(pageNumber)) {
                        appState.chayaDocument.markedRegions.set(pageNumber, []);
                    }
                    appState.chayaDocument.markedRegions.get(pageNumber)!.push(annotation);
                });
                appState.hasUnsavedChanges = true;

                newAnnotations.forEach(annotation => {
                    const targetPageDiv = this.pdfContainer.querySelector<HTMLDivElement>(`[data-page-number="${annotation.pageNumber}"]`);
                    if (targetPageDiv) {
                        const layer = targetPageDiv.querySelector<HTMLDivElement>('.annotation-layer');
                        if (layer) {
                            this._createAnnotationBox(layer, targetPageDiv, annotation);
                        }
                    }
                    this._updateAnnotationListForPage(annotation.pageNumber);
                });

                console.log(`Added ${newAnnotations.length} AI-generated marked regions.`);
            }
        });
        return button;
    }

    // --- Private Methods (Event Handlers) ---

    private _onDrawStart(e: MouseEvent, pageDiv: HTMLDivElement, pageNumber: number): void {
        // Only start drawing on left mouse button (button 0). Prevent drawing when clicking on an existing box.
        if (e.button !== 0 || (e.target as HTMLElement).closest('.annotation-box')) return;
        e.preventDefault();

        this.isDrawing = true;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        this.interactionState = {
            startX: e.clientX - rect.left,
            startY: e.clientY - rect.top,
        };

        const tempBox = document.createElement('div');
        tempBox.className = 'annotation-box-tmp';

        tempBox.style.left = `${this.interactionState.startX}px`;
        tempBox.style.top = `${this.interactionState.startY}px`;
        tempBox.style.width = '0px';
        tempBox.style.height = '0px';

        this.interactionState.currentBox = tempBox;
        (e.currentTarget as HTMLElement).appendChild(tempBox);
    }

    private _onDrawMove(e: MouseEvent): void {
        if (!this.isDrawing || !this.interactionState.currentBox) return;

        const box = this.interactionState.currentBox;
        const rect = box.parentElement!.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const left = Math.min(this.interactionState.startX, currentX);
        const top = Math.min(this.interactionState.startY, currentY);
        const width = Math.abs(currentX - this.interactionState.startX);
        const height = Math.abs(currentY - this.interactionState.startY);

        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
    }

    private _onDrawEnd(e: MouseEvent, pageDiv: HTMLDivElement, pageNumber: number): void {
        if (!this.isDrawing || !this.interactionState.currentBox) return;
        this.isDrawing = false;

        const box = this.interactionState.currentBox;
        const width = parseFloat(box.style.width);
        const height = parseFloat(box.style.height);

        box.remove();
        this.interactionState.currentBox = undefined;

        if (width < 5 || height < 5) return;

        const label = prompt('Enter label for this region:', 'Unlabeled');
        if (!label) return;

        const pageWidth = pageDiv.offsetWidth;
        const pageHeight = pageDiv.offsetHeight;

        const newAnnotation: MarkedRegion = {
            id: MarkedRegion.generateRandomId(),
            x: parseFloat(box.style.left) / pageWidth,
            y: parseFloat(box.style.top) / pageHeight,
            width: width / pageWidth,
            height: height / pageHeight,
            label,
            pageNumber,
        };

        if (!appState.chayaDocument.markedRegions.has(pageNumber)) {
            appState.chayaDocument.markedRegions.set(pageNumber, []);
        }
        appState.chayaDocument.markedRegions.get(pageNumber)!.push(newAnnotation);
        appState.hasUnsavedChanges = true;

        this._createAnnotationBox(pageDiv.querySelector('.annotation-layer')!, pageDiv, newAnnotation);
        this._updateAnnotationListForPage(newAnnotation.pageNumber);
        this._selectAnnotation(newAnnotation.id);
    }

    private _onBoxMouseDown(e: MouseEvent, box: HTMLDivElement, annotation: MarkedRegion, pageDiv: HTMLDivElement): void {
        e.stopPropagation();
        this._selectAnnotation(annotation.id);

        const handle = (e.target as HTMLElement).dataset.handle;
        if (handle) {
            this.isResizing = true;
            this.interactionState = {
                startX: e.clientX,
                startY: e.clientY,
                startLeft: parseFloat(box.style.left),
                startTop: parseFloat(box.style.top),
                startWidth: parseFloat(box.style.width),
                startHeight: parseFloat(box.style.height),
                resizeHandle: handle,
            };
        } else {
            this.isDragging = true;
            this.interactionState = {
                startX: e.clientX,
                startY: e.clientY,
                startLeft: parseFloat(box.style.left),
                startTop: parseFloat(box.style.top),
            };
        }

        const onInteractionMove = (ev: MouseEvent) => {
            if (this.isResizing) this._onResize(ev, box, annotation, pageDiv);
            if (this.isDragging) this._onDrag(ev, box, annotation, pageDiv);
        };

        const onInteractionEnd = () => {
            this.isResizing = false;
            this.isDragging = false;
            document.removeEventListener('mousemove', onInteractionMove);
            document.removeEventListener('mouseup', onInteractionEnd);
        };

        document.addEventListener('mousemove', onInteractionMove);
        document.addEventListener('mouseup', onInteractionEnd);
    }

    private _onResize(e: MouseEvent, box: HTMLDivElement, annotation: MarkedRegion, pageDiv: HTMLDivElement): void {
        const { startX, startY, startLeft, startTop, startWidth, startHeight, resizeHandle } = this.interactionState;
        const deltaX = e.clientX - startX!;
        const deltaY = e.clientY - startY!;

        let newLeft = startLeft!, newTop = startTop!, newWidth = startWidth!, newHeight = startHeight!;

        if (resizeHandle!.includes('w')) { newWidth -= deltaX; newLeft += deltaX; }
        if (resizeHandle!.includes('e')) { newWidth += deltaX; }
        if (resizeHandle!.includes('n')) { newHeight -= deltaY; newTop += deltaY; }
        if (resizeHandle!.includes('s')) { newHeight += deltaY; }

        if (newWidth < 10) newWidth = 10;
        if (newHeight < 10) newHeight = 10;

        box.style.left = `${newLeft}px`;
        box.style.top = `${newTop}px`;
        box.style.width = `${newWidth}px`;
        box.style.height = `${newHeight}px`;

        annotation.x = newLeft / pageDiv.offsetWidth;
        annotation.y = newTop / pageDiv.offsetHeight;
        annotation.width = newWidth / pageDiv.offsetWidth;
        annotation.height = newHeight / pageDiv.offsetHeight;

        appState.hasUnsavedChanges = true;
    }

    private _onDrag(e: MouseEvent, box: HTMLDivElement, annotation: MarkedRegion, pageDiv: HTMLDivElement): void {
        const { startX, startY, startLeft, startTop } = this.interactionState;
        const newLeft = startLeft! + e.clientX - startX!;
        const newTop = startTop! + e.clientY - startY!;

        const clampedLeft = Math.max(0, Math.min(newLeft, pageDiv.offsetWidth - box.offsetWidth));
        const clampedTop = Math.max(0, Math.min(newTop, pageDiv.offsetHeight - box.offsetHeight));

        box.style.left = `${clampedLeft}px`;
        box.style.top = `${clampedTop}px`;

        annotation.x = clampedLeft / pageDiv.offsetWidth;
        annotation.y = clampedTop / pageDiv.offsetHeight;

        appState.hasUnsavedChanges = true;
    }

    private _onBoxDoubleClick(e: MouseEvent, box: HTMLDivElement, annotation: MarkedRegion) {
        e.preventDefault();
        const newLabel = prompt('Edit label:', annotation.label);
        if (newLabel !== null && newLabel.trim()) {
            annotation.label = newLabel.trim();
            box.title = newLabel.trim();
            appState.hasUnsavedChanges = true;
            this._updateAnnotationListForPage(annotation.pageNumber);
        }
    }

    // --- Private Methods (State & UI Sync) ---
    private _selectAnnotation(annotationId: string, scrollIntoView = false): void {
        if (this.selectedAnnotationId) {
            this.pdfContainer.querySelector(`.annotation-box[data-annotation-id="${this.selectedAnnotationId}"]`)?.classList.remove('selected');
        }

        this.selectedAnnotationId = annotationId;
        const box = this.pdfContainer.querySelector(`.annotation-box[data-annotation-id="${annotationId}"]`);
        if (box) {
            box.classList.add('selected');
            if (scrollIntoView) {
                box.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    private _deselectAll(): void {
        if (this.selectedAnnotationId) {
            this.pdfContainer.querySelector(`.annotation-box[data-annotation-id="${this.selectedAnnotationId}"]`)?.classList.remove('selected');
            this.selectedAnnotationId = null;
        }
    }

    private _deleteAnnotation(annotationId: string): void {
        let foundPageNumber: number | null = null;
        const annotationsMap = appState.chayaDocument.markedRegions;

        // Find and remove the region from the state
        for (const [pageNumber, regions] of annotationsMap.entries()) {
            const index = regions.findIndex(a => a.id === annotationId);
            if (index !== -1) {
                regions.splice(index, 1);
                foundPageNumber = pageNumber;
                break;
            }
        }

        if (foundPageNumber !== null) {
            appState.hasUnsavedChanges = true;
            // Remove the annotation box from the PDF view
            this.pdfContainer.querySelector(`.annotation-box[data-annotation-id="${annotationId}"]`)?.remove();
            // Remove the corresponding item from the sidebar list
            this.annotationList.querySelector(`[data-annotation-id="${annotationId}"]`)?.remove();
            // Check if this was the last region for that page
            const regionsLeft = annotationsMap.get(foundPageNumber);
            if (!regionsLeft || regionsLeft.length === 0) {
                // If so, remove the "Page X" header as well
                this.annotationList.querySelector(`[data-page-header="${foundPageNumber}"]`)?.remove();
                // And remove the page from the map to keep the state clean
                annotationsMap.delete(foundPageNumber);
            }
            if (this.selectedAnnotationId === annotationId) {
                this.selectedAnnotationId = null;
            }
        }
    }

    private _highlightAnnotationBox(id: string, highlight: boolean): void {
        const box = this.pdfContainer.querySelector(`.annotation-box[data-annotation-id="${id}"]`);
        if (box) box.classList.toggle('highlighted', highlight);
    }

    private _highlightSidebarItem(id: string, highlight: boolean): void {
        const item = this.annotationList.querySelector(`[data-annotation-id="${id}"]`);
        if (item) item.classList.toggle('highlighted', highlight);
    }

    private _getCanvasForPage(pageNumber: number): HTMLCanvasElement | null {
        return this.pdfContainer.querySelector(`[data-page-number="${pageNumber}"] canvas`);
    }

    private _setupGlobalListeners(): void {
        this.pdfContainer.addEventListener('mousedown', (e) => {
            if (!(e.target as HTMLElement).closest('.annotation-box')) {
                this._deselectAll();
            }
        });

        window.addEventListener('beforeunload', (e) => {
            if (appState.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }
}


// --- Module's Public Interface ---

export function initializeMarkTab(): MarkController {
    console.log('Initializing Mark tab');
    const pdfContainer = document.getElementById('pdf-container') as HTMLDivElement;
    const annotationList = document.getElementById('annotation-list') as HTMLDivElement;

    if (!pdfContainer || !annotationList) {
        throw new Error("Required DOM elements not found for Mark tab");
    }

    const controller = new MarkController(pdfContainer, annotationList);

    const style = document.createElement('style');
    style.textContent = `
        .annotation-box.selected { border-color: #0066ff; background-color: rgba(0, 102, 255, 0.15); }
        .annotation-box.selected .resize-handle { display: block; }
        .annotation-box.highlighted { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5); }
        #annotation-list .highlighted { background-color: #dbeafe !important; }
        .resize-handle { 
            position: absolute; display: none; background-color: #fff; border: 1px solid #000;
            width: 8px; height: 8px; z-index: 1000;
        }
        .ai-annotate-btn {
            position: absolute; top: 8px; right: 8px; background-color: #3b82f6; color: white;
            border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; z-index: 1000;
        }
        .ai-annotate-btn:hover { background-color: #2563eb; }
        .resize-nw { top: -4px; left: -4px; cursor: nwse-resize; }
        .resize-ne { top: -4px; right: -4px; cursor: nesw-resize; }
        .resize-sw { bottom: -4px; left: -4px; cursor: nesw-resize; }
        .resize-se { bottom: -4px; right: -4px; cursor: nwse-resize; }
        .resize-n { top: -4px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
        .resize-s { bottom: -4px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
        .resize-e { top: 50%; right: -4px; transform: translateY(-50%); cursor: ew-resize; }
        .resize-w { top: 50%; left: -4px; transform: translateY(-50%); cursor: ew-resize; }
        .annotation-box-tmp { position: absolute; border: 2px dashed #ff0000; background-color: rgba(255, 0, 0, 0.05); pointer-events: none; }
    `;
    document.head.appendChild(style);
    return controller;
}
