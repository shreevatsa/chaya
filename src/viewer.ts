import { initializePdfjs, waitForPdfjs, parseAnnotationsFromJson, Annotation } from './pdf-utils.js';

// Initialize PDF.js
initializePdfjs();

const pdfUpload = document.getElementById('pdf-upload') as HTMLInputElement;
const annotationsUpload = document.getElementById('annotations-upload') as HTMLInputElement;
const loadFilesBtn = document.getElementById('load-files') as HTMLButtonElement;
const pdfContainer = document.getElementById('pdf-container') as HTMLDivElement;
const loadingMessage = document.getElementById('loading-message') as HTMLDivElement;
const annotationCount = document.getElementById('annotation-count') as HTMLDivElement;
const annotationList = document.getElementById('annotation-list') as HTMLDivElement;

let pdfFile: File | null = null;
let annotationsFile: File | null = null;
let loadedAnnotations: Annotation[] = [];

// Extract a cropped region from a page canvas for a specific annotation
async function extractAnnotationRegion(pdf: any, annotation: Annotation): Promise<HTMLDivElement> {
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

// Enable/disable load button based on file selection
function updateLoadButton(): void {
    loadFilesBtn.disabled = !pdfFile || !annotationsFile;
}

// File input handlers
pdfUpload.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    pdfFile = target.files?.[0] || null;
    updateLoadButton();
});

annotationsUpload.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    annotationsFile = target.files?.[0] || null;
    updateLoadButton();
});

// Load and display the files
loadFilesBtn.addEventListener('click', async () => {
    if (!pdfFile || !annotationsFile) return;

    try {
        loadFilesBtn.disabled = true;
        loadFilesBtn.textContent = 'Loading...';
        loadingMessage.textContent = 'Loading PDF and annotations...';

        // Load and parse annotations first
        const annotationsText = await readFileAsText(annotationsFile);
        const annotationsData = JSON.parse(annotationsText);
        loadedAnnotations = parseAnnotationsFromJson(annotationsData);

        console.log(`Loaded ${loadedAnnotations.length} annotations`);

        // Clear container and load PDF
        pdfContainer.innerHTML = '';

        const pdfArrayBuffer = await readFileAsArrayBuffer(pdfFile);
        const typedArray = new Uint8Array(pdfArrayBuffer);

        // Wait for PDF.js and load document
        const pdfjs = await waitForPdfjs();
        const loadingTask = pdfjs.getDocument(typedArray);
        const pdf = await loadingTask.promise;

        console.log('PDF loaded successfully, pages:', pdf.numPages);

        // Extract and display only the annotated regions
        loadingMessage.textContent = 'Extracting annotated regions...';

        for (let i = 0; i < loadedAnnotations.length; i++) {
            const annotation = loadedAnnotations[i];
            console.log(`Extracting region ${i + 1}/${loadedAnnotations.length}: ${annotation.label}`);

            const regionDiv = await extractAnnotationRegion(pdf, annotation);
            pdfContainer.appendChild(regionDiv);
        }

        loadingMessage.textContent = '';

        // Update annotation list
        updateAnnotationList();

        console.log('All annotation regions extracted successfully');

    } catch (error) {
        console.error('Error loading files:', error);
        loadingMessage.textContent = `Error loading files: ${error}`;
    } finally {
        loadFilesBtn.disabled = false;
        loadFilesBtn.textContent = 'Load and View';
    }
});

// Update the annotation list sidebar
function updateAnnotationList(): void {
    // Update count
    const count = loadedAnnotations.length;
    annotationCount.textContent = count === 0 ? 'No annotations loaded' :
        count === 1 ? '1 annotation' : `${count} annotations`;

    // Clear existing list
    annotationList.innerHTML = '';

    // Group annotations by page
    const annotationsByPage: { [key: number]: Annotation[] } = {};
    loadedAnnotations.forEach(annotation => {
        if (!annotationsByPage[annotation.pageNumber]) {
            annotationsByPage[annotation.pageNumber] = [];
        }
        annotationsByPage[annotation.pageNumber].push(annotation);
    });

    // Create navigation buttons for each annotation
    loadedAnnotations.forEach((annotation, index) => {
        const navButton = document.createElement('button');
        navButton.className = 'px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-full transition-colors cursor-pointer';
        navButton.textContent = `${annotation.label} (p.${annotation.pageNumber})`;
        navButton.title = `Jump to: ${annotation.label}`;

        // Add click handler to scroll to annotation region
        navButton.addEventListener('click', () => {
            scrollToAnnotationRegion(annotation);
        });

        // Add hover effect
        navButton.addEventListener('mouseenter', () => {
            highlightAnnotationRegion(annotation, true);
        });

        navButton.addEventListener('mouseleave', () => {
            highlightAnnotationRegion(annotation, false);
        });

        annotationList.appendChild(navButton);
    });
}

// Scroll to and highlight an annotation region
function scrollToAnnotationRegion(annotation: Annotation): void {
    const regionDivs = pdfContainer.querySelectorAll('.annotation-region');

    // Find the region div for this annotation by matching the label
    for (let i = 0; i < regionDivs.length; i++) {
        const regionDiv = regionDivs[i] as HTMLDivElement;
        const labelDiv = regionDiv.querySelector('.annotation-label');

        if (labelDiv && labelDiv.textContent === annotation.label) {
            regionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Temporarily highlight the region
            highlightAnnotationRegion(annotation, true);
            setTimeout(() => highlightAnnotationRegion(annotation, false), 2000);
            break;
        }
    }
}

// Highlight annotation region with a visual effect
function highlightAnnotationRegion(annotation: Annotation, highlight: boolean): void {
    const regionDivs = pdfContainer.querySelectorAll('.annotation-region');

    // Find the region div for this annotation by matching the label
    for (let i = 0; i < regionDivs.length; i++) {
        const regionDiv = regionDivs[i] as HTMLDivElement;
        const labelDiv = regionDiv.querySelector('.annotation-label');

        if (labelDiv && labelDiv.textContent === annotation.label) {
            if (highlight) {
                regionDiv.style.boxShadow = '0 0 0 4px rgba(255, 215, 0, 0.8)';
                regionDiv.style.transform = 'scale(1.02)';
                regionDiv.style.transition = 'all 0.2s ease';
            } else {
                regionDiv.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                regionDiv.style.transform = '';
            }
            break;
        }
    }
}

// File reading utilities
function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}
