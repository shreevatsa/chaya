// Read tab functionality - presentation view of annotated documents

import { ChayaDocument, MarkedRegion, appState } from './models.js';

export class ViewerController {
    private pdfContainer: HTMLDivElement;
    private annotationCount: HTMLDivElement;
    private annotationList: HTMLDivElement;

    constructor(
        pdfContainer: HTMLDivElement,
        annotationCount: HTMLDivElement,
        annotationList: HTMLDivElement
    ) {
        this.pdfContainer = pdfContainer;
        this.annotationCount = annotationCount;
        this.annotationList = annotationList;
    }

    public loadData(): void {
        console.log('Read tab: Displaying cached data');
        this.pdfContainer.innerHTML = '';
        const annotationsMap = appState.chayaDocument.markedRegions;

        if (annotationsMap.size === 0) {
            this.pdfContainer.innerHTML = `...`; // Placeholder message
            this.annotationCount.textContent = 'No marked regions loaded';
            this.annotationList.innerHTML = '';
            return;
        }

        this.displayAnnotatedRegions();
        this.updateAnnotationList(annotationsMap);
    }

    private async displayAnnotatedRegions(): Promise<void> {
        const annotationsMap = appState.chayaDocument.markedRegions;
        // Get page numbers and sort them to ensure regions are displayed in order.
        const sortedPages = Array.from(annotationsMap.keys()).sort((a, b) => a - b);

        let totalAnnotations = 0;
        annotationsMap.forEach(regions => totalAnnotations += regions.length);
        let processedCount = 0;

        for (const pageNumber of sortedPages) {
            const regionsOnPage = annotationsMap.get(pageNumber)!;
            for (const annotation of regionsOnPage) {
                processedCount++;
                console.log(`Extracting region ${processedCount}/${totalAnnotations}: ${annotation.label}`);
                const regionDiv = await this.extractAnnotationRegion(annotation);
                this.pdfContainer.appendChild(regionDiv);
            }
        }

        console.log('All annotation regions extracted successfully');
    }

    // Update the annotation list sidebar
    private updateAnnotationList(annotationsMap: Map<number, MarkedRegion[]>): void {
        let count = 0;
        annotationsMap.forEach(regions => count += regions.length);
        this.annotationCount.textContent = count === 0 ? 'No marked regions' : `${count} marked region${count > 1 ? 's' : ''}`;
        // Clear existing list
        this.annotationList.innerHTML = '';

        const sortedPages = Array.from(annotationsMap.keys()).sort((a, b) => a - b);
        for (const pageNumber of sortedPages) {
            const regionsOnPage = annotationsMap.get(pageNumber)!;
            for (const annotation of regionsOnPage) {
                const navButton = document.createElement('button');
                navButton.className = 'px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-full transition-colors cursor-pointer';
                navButton.textContent = `${annotation.label} (p.${annotation.pageNumber})`;
                navButton.title = `Jump to: ${annotation.label}`;

                navButton.addEventListener('click', () => this.scrollToAnnotationRegion(annotation.id));
                navButton.addEventListener('mouseenter', () => this.highlightAnnotationRegion(annotation.id, true));
                navButton.addEventListener('mouseleave', () => this.highlightAnnotationRegion(annotation.id, false));
                this.annotationList.appendChild(navButton);
            }
        }
    }

    // Scroll to and highlight an annotation region
    private scrollToAnnotationRegion(annotationId: string): void {
        const regionDiv = this.pdfContainer.querySelector<HTMLDivElement>(`.annotation-region[data-annotation-id="${annotationId}"]`);
        if (regionDiv) {
            regionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            this.highlightAnnotationRegion(annotationId, true);
            setTimeout(() => this.highlightAnnotationRegion(annotationId, false), 2000);
        }
    }

    // Highlight annotation region with a visual effect
    private highlightAnnotationRegion(annotationId: string, highlight: boolean): void {
        const regionDiv = this.pdfContainer.querySelector<HTMLDivElement>(`.annotation-region[data-annotation-id="${annotationId}"]`);
        if (regionDiv) {
            if (highlight) {
                regionDiv.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.7)'; // Changed color for visibility
                regionDiv.style.transform = 'scale(1.02)';
                regionDiv.style.transition = 'all 0.2s ease';
            } else {
                regionDiv.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                regionDiv.style.transform = '';
            }
        }
    }

    // Extract a cropped region from a page canvas for a specific annotation
    private async extractAnnotationRegion(annotation: MarkedRegion): Promise<HTMLDivElement> {
        const sourceCanvas = appState.pageCanvasCache.get(annotation.pageNumber);
        if (!sourceCanvas) {
            console.error(`Canvas for page ${annotation.pageNumber} not found in cache.`);
            const errorDiv = document.createElement('div');
            errorDiv.textContent = `Error: Could not display region for page ${annotation.pageNumber}.`;
            return errorDiv;
        }

        const left = annotation.x * sourceCanvas.width;
        const top = annotation.y * sourceCanvas.height;
        const width = annotation.width * sourceCanvas.width;
        const height = annotation.height * sourceCanvas.height;

        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = width;
        croppedCanvas.height = height;
        const croppedContext = croppedCanvas.getContext('2d')!;

        // Crop directly from the cached canvas - this is very fast.
        croppedContext.drawImage(
            sourceCanvas,
            left, top, width, height, // source rectangle
            0, 0, width, height      // destination rectangle
        );

        // Create a container div with the cropped image and label
        const regionDiv = document.createElement('div');
        regionDiv.className = 'annotation-region';
        regionDiv.dataset.annotationId = annotation.id;
        regionDiv.style.position = 'relative';
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
}

// --- Module's Public Interface ---
export function initializeViewer(): ViewerController {
    console.log('Initializing Read tab (viewer)');
    const pdfContainer = document.getElementById('read-pdf-container') as HTMLDivElement;
    const annotationCount = document.getElementById('read-annotation-count') as HTMLDivElement;
    const annotationList = document.getElementById('read-annotation-list') as HTMLDivElement;

    if (!pdfContainer || !annotationCount || !annotationList) {
        throw new Error('Required DOM elements not found for Read tab');
    }

    return new ViewerController(pdfContainer, annotationCount, annotationList);
}
