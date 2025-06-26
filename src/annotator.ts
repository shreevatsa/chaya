import * as pdfjsLib from '../lib/pdf.mjs';

// Set the worker source for pdf.js. This is required for the library to work.
if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.mjs';
}

const pdfUpload = document.getElementById('pdf-upload') as HTMLInputElement;
const pdfContainer = document.getElementById('pdf-container') as HTMLDivElement;
const saveAnnotationsBtn = document.getElementById('save-annotations') as HTMLButtonElement;

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

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    canvas.style.border = '1px solid black';

    pageDiv.style.width = `${viewport.width}px`;
    pageDiv.style.height = `${viewport.height}px`;

    pageDiv.appendChild(canvas);
    pdfContainer.appendChild(pageDiv);

    const renderContext = {
        canvasContext: context!,
        viewport: viewport
    };

    await page.render(renderContext).promise;
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
        const typedArray = new Uint8Array(e.target?.result as ArrayBuffer);
        const loadingTask = pdfjsLib.getDocument(typedArray);
        
        try {
            const pdf = await loadingTask.promise;
            for (let i = 1; i <= pdf.numPages; i++) {
                await renderPage(pdf, i);
            }
        } catch (reason) {
            console.error(`Error during PDF loading or rendering: ${reason}`);
        }
    };

    fileReader.readAsArrayBuffer(file);
});