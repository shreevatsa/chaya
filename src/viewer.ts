import { initializePdfjs, waitForPdfjs, parseAnnotationsFromJson, extractAnnotationRegion, Annotation } from './pdf-utils.js';

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