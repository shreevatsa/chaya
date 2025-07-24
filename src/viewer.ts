// Read tab functionality - presentation view of annotated documents

import { ChayaDocument, MarkedRegion } from './models.js';

let loadedAnnotations: Map<number, MarkedRegion[]> = new Map();
export let readModuleDataReady: Function;

export function initializeViewer(): void {
    console.log('Initializing Read tab (viewer)');

    // Get DOM elements
    const pdfContainer = document.getElementById('read-pdf-container') as HTMLDivElement;
    const loadingMessage = document.getElementById('read-loading-message') as HTMLDivElement;
    const annotationCount = document.getElementById('read-annotation-count') as HTMLDivElement;
    const annotationList = document.getElementById('read-annotation-list') as HTMLDivElement;

    if (!pdfContainer || !annotationCount || !annotationList || !loadingMessage) {
        console.error('Required DOM elements not found for Read tab');
        return;
    }

    function handleDataReady(pdfDocument: any, chayaDocument: ChayaDocument): void {
        console.log('Read tab: Data ready', { pdfDocument, chayaDocument });

        // Update local state
        loadedAnnotations = chayaDocument.markedRegions || new Map();

        // Clear container
        pdfContainer.innerHTML = '';

        // Check if we have both PDF and annotations
        if (!pdfDocument || !chayaDocument || chayaDocument.markedRegions.size === 0) {
            pdfContainer.innerHTML = `
                <div class="p-8 text-center text-gray-500">
                    <div class="text-4xl mb-4">📖</div>
                    <p>Load a PDF file and annotations to view annotated regions</p>
                </div>
            `;
            annotationCount.textContent = 'No annotations loaded';
            annotationList.innerHTML = '';
            return;
        }

        // Display the annotated regions
        displayAnnotatedRegions(pdfDocument, chayaDocument);

        // Update annotation list
        updateAnnotationList();
    }

    readModuleDataReady = handleDataReady;

    async function displayAnnotatedRegions(pdfDocument: any, chayaDocument: ChayaDocument): Promise<void> {
        loadingMessage.textContent = 'Extracting annotated regions...';

        const annotationsMap = chayaDocument.markedRegions;
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
                const regionDiv = await extractAnnotationRegion(pdfDocument, annotation);
                pdfContainer.appendChild(regionDiv);
            }
        }

        loadingMessage.textContent = '';
        console.log('All annotation regions extracted successfully');

        const renderingCompleteEvent = new CustomEvent('tabRenderingComplete', {
            detail: {
                tabName: 'read',
                totalPages: totalAnnotations
            }
        });
        document.dispatchEvent(renderingCompleteEvent);
    }

    // Extract a cropped region from a page canvas for a specific annotation
    async function extractAnnotationRegion(pdf: any, annotation: MarkedRegion): Promise<HTMLDivElement> {
        const page = await pdf.getPage(annotation.pageNumber);

        // Calculate scale to limit maximum width while maintaining aspect ratio
        const baseViewport = page.getViewport({ scale: 1.0 });
        const maxWidth = 1200; // Maximum width in pixels - adjust this to control PDF size
        const scale = baseViewport.width > maxWidth ? maxWidth / baseViewport.width : 1.5;

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

    // Update the annotation list sidebar
    function updateAnnotationList(): void {
        let count = 0;
        loadedAnnotations.forEach(regions => count += regions.length);
        annotationCount.textContent = count === 0 ? 'No marked regions' :
            count === 1 ? '1 annotation' : `${count} annotations`;

        // Clear existing list
        annotationList.innerHTML = '';

        // FIX: Iterate through the Map to create navigation buttons.
        const sortedPages = Array.from(loadedAnnotations.keys()).sort((a, b) => a - b);
        for (const pageNumber of sortedPages) {
            const regionsOnPage = loadedAnnotations.get(pageNumber)!;
            for (const annotation of regionsOnPage) {
                const navButton = document.createElement('button');
                navButton.className = 'px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-full transition-colors cursor-pointer';
                navButton.textContent = `${annotation.label} (p.${annotation.pageNumber})`;
                navButton.title = `Jump to: ${annotation.label}`;

                navButton.addEventListener('click', () => scrollToAnnotationRegion(annotation.id));
                navButton.addEventListener('mouseenter', () => highlightAnnotationRegion(annotation.id, true));
                navButton.addEventListener('mouseleave', () => highlightAnnotationRegion(annotation.id, false));

                annotationList.appendChild(navButton);
            }
        }
    }

    // Scroll to and highlight an annotation region
    function scrollToAnnotationRegion(annotationId: string): void {
        const regionDiv = pdfContainer.querySelector<HTMLDivElement>(`.annotation-region[data-annotation-id="${annotationId}"]`);
        if (regionDiv) {
            regionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            highlightAnnotationRegion(annotationId, true);
            setTimeout(() => highlightAnnotationRegion(annotationId, false), 2000);
        }
    }

    // Highlight annotation region with a visual effect
    function highlightAnnotationRegion(annotationId: string, highlight: boolean): void {
        const regionDiv = pdfContainer.querySelector<HTMLDivElement>(`.annotation-region[data-annotation-id="${annotationId}"]`);
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
}
