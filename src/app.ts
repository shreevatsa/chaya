import { MarkedRegion, appState, ChayaDocument } from './models.js';
import { MarkController, initializeMarkTab } from './mark-controller.js';
import { ViewerController, initializeViewer } from './read-controller.js';
import { documentGetElementById, updateLoadingProgress } from './actions.js';

// JSZip is loaded globally via script tag in the HTML
declare const JSZip: any;

// PDF.js is loaded globally via script tag in the HTML
declare const pdfjsLib: any; // Only used via `waitForPdfjs` below.
// Wait for PDF.js to be available before using it
async function waitForPdfjs(): Promise<any> {
    while (typeof pdfjsLib == 'undefined') {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    return pdfjsLib;
}
// Initialize PDF.js
(async function (): Promise<void> {
    const pdfjs = await waitForPdfjs();
    if (pdfjs?.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    console.log('PDF.js initialized; worker src set to:', pdfjs.GlobalWorkerOptions?.workerSrc);
})();

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

class ChayaApp {
    private markController: MarkController;
    private viewerController: ViewerController;

    constructor() {
        // Set up file input listeners
        {
            documentGetElementById<HTMLInputElement>('chaya-upload').addEventListener('change', async (event) => {
                const target = event.target as HTMLInputElement;
                const file = target.files?.[0];
                console.log('Going to upload chaya file');
                if (file) {
                    await this.loadChayaFile(file);
                }
            });
            documentGetElementById<HTMLInputElement>('pdf-upload').addEventListener('change', async (event) => {
                const target = event.target as HTMLInputElement;
                const file = target.files?.[0];
                if (file) {
                    await this.loadPdfFile(file);
                }
            });
        }
        // Set up slot event listeners: either upload or download
        {
            documentGetElementById<HTMLDivElement>('chaya-slot').onclick = () => {
                if (!appState.documentLoaded) {
                    const chayaUpload = documentGetElementById<HTMLInputElement>('chaya-upload');
                    chayaUpload.click();
                } else {
                    this.downloadChayaFile();
                }
            };
            documentGetElementById<HTMLDivElement>('pdf-slot').onclick = () => {
                if (!appState.documentLoaded) {
                    const pdfUpload = documentGetElementById<HTMLInputElement>('pdf-upload');
                    pdfUpload.click();
                } else {
                    this.downloadPdfFile();
                }
            };
        }
        // Set up tab switching event listeners: clicking on Mark/Edit/Read should call `switchToTab('mark')` etc.
        {
            documentGetElementById<HTMLButtonElement>('mark-tab-btn').addEventListener('click', () => this.switchToTab('mark'));
            documentGetElementById<HTMLButtonElement>('edit-tab-btn').addEventListener('click', () => this.switchToTab('edit'));
            documentGetElementById<HTMLButtonElement>('read-tab-btn').addEventListener('click', () => this.switchToTab('read'));
        }
        this.markController = initializeMarkTab();
        this.viewerController = initializeViewer();
        this.switchToTab('mark');
    }

    private switchToTab(tab: 'mark' | 'edit' | 'read'): void {
        // Hide all tab content
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.add('hidden');
        });
        // Remove active class from all buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.classList.remove('bg-blue-100', 'text-blue-700');
            btn.classList.add('text-gray-600', 'hover:text-gray-800');
        });

        // Show target tab
        documentGetElementById(`${tab}-tab`).classList.remove('hidden');
        // Activate target button
        const targetBtn = documentGetElementById(`${tab}-tab-btn`);
        targetBtn.classList.add('active', 'bg-blue-100', 'text-blue-700');
        targetBtn.classList.remove('text-gray-600', 'hover:text-gray-800');
    }

    private async postLoading(pdfArrayBuffer: ArrayBuffer) {
        updateLoadingProgress(5, 'Processing PDF...', 'Initializing PDF.js and document...');

        const pdfjs = await waitForPdfjs();
        appState.pdfDocument = await pdfjs.getDocument(new Uint8Array(pdfArrayBuffer)).promise;

        this.markController.prepareForDocument();
        this.viewerController.prepareForDocument();

        updateLoadingProgress(5, 'Rendering pages...', 'Processing PDF pages for display');

        // Mark as loaded
        appState.documentLoaded = true;
        appState.hasUnsavedChanges = false;

        // Update slot UI to download mode
        {
            const documentFilename = documentGetElementById<HTMLDivElement>('document-filename');
            documentFilename.textContent = `Document: ${appState.pdfFile?.name || 'document'}`;
            documentFilename.classList.remove('hidden');
            const chayaSlot = documentGetElementById<HTMLDivElement>('chaya-slot');
            chayaSlot.querySelector('.upload-slot')?.classList.add('hidden');
            chayaSlot.querySelector('.download-slot')?.classList.remove('hidden');
            const pdfSlot = documentGetElementById<HTMLDivElement>('pdf-slot');
            pdfSlot.querySelector('.upload-slot')?.classList.add('hidden');
            pdfSlot.querySelector('.download-slot')?.classList.remove('hidden');
        }

        this._progressivelyRenderPages();
    }

    private async _progressivelyRenderPages(): Promise<void> {
        const pdf = appState.pdfDocument;
        const totalPages = pdf.numPages;
        appState.pageCanvasCache.clear();

        console.log(`Starting progressive render of ${totalPages} pages...`);
        const containerWidth = documentGetElementById('pdf-container').offsetWidth;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const progress = 10 + (85 * pageNum / totalPages); // Leave final 5% for cleanup
            updateLoadingProgress(progress, `Rendering page ${pageNum} of ${totalPages}...`, `Processing page ${pageNum}`);

            const page = await pdf.getPage(pageNum);
            // Calculate the correct scale for this page.
            const baseViewport = page.getViewport({ scale: 1.0 });
            const maxWidth = 1200;
            const targetWidth = Math.min(containerWidth, maxWidth);
            const scale = targetWidth / baseViewport.width;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext('2d')!;
            await page.render({ canvasContext: context, viewport }).promise;

            appState.pageCanvasCache.set(pageNum, canvas);
            canvas.style.width = `${targetWidth}px`;

            // Notify controllers that a new page is ready to be displayed.
            this.markController.renderPage(pageNum);
            await this.viewerController.renderRegionsForPage(pageNum);
        }

        console.log('All pages rendered.');
        updateLoadingProgress(100, 'Complete!', 'Document ready.');
        setTimeout(() => {
            documentGetElementById('app-loading').classList.add('hidden');
        }, 500);
    }

    // Writes to `appState.pdfFile`.
    // Calls `updateLoadingProgress`, `this.postLoading`
    private async loadPdfFile(pdfFile: File): Promise<void> {
        appState.pdfFile = pdfFile;
        try {
            updateLoadingProgress(0, 'Loading PDF...', 'Reading PDF file...');
            const pdfArrayBuffer = await readFileAsArrayBuffer(pdfFile);
            this.postLoading(pdfArrayBuffer);
        } catch (error) {
            console.error('Error loading files:', error);
            updateLoadingProgress(0, 'Error loading files', `Failed: ${error}`);
        }
    }

    private async loadChayaFile(file: File): Promise<void> {
        const loadingDiv = documentGetElementById<HTMLDivElement>('app-loading');

        try {
            console.log('Loading .chaya file:', file.name);
            updateLoadingProgress(0, 'Loading .chaya file...', 'Reading ZIP file...');

            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);

            updateLoadingProgress(5, 'Extracting files...', 'Validating .chaya format...');

            const requiredFiles = ['manifest.json', 'document.pdf', 'annotations.json'];
            for (const requiredFile of requiredFiles) {
                if (!zipContent.file(requiredFile)) {
                    throw new Error(`Invalid .chaya file: missing ${requiredFile}`);
                }
            }

            updateLoadingProgress(5, 'Reading manifest...', 'Validating format version...');

            // Read and validate manifest
            const manifestText = await zipContent.file('manifest.json')!.async('string');
            const manifest = JSON.parse(manifestText);
            console.log('Manifest:', manifest);

            updateLoadingProgress(5, 'Extracting PDF...', 'Loading document content...');

            // Extract PDF data
            const pdfArrayBuffer = await zipContent.file('document.pdf')!.async('arraybuffer');
            const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
            const pdfFile = new File([pdfBlob], manifest.originalFilename || 'document.pdf', {
                type: 'application/pdf'
            });

            updateLoadingProgress(5, 'Loading annotations...', 'Parsing annotation data...');

            // Extract annotations
            const annotationsText = await zipContent.file('annotations.json')!.async('string');
            const annotationsData = JSON.parse(annotationsText);
            const regions = MarkedRegion.parseFromJson(annotationsData);

            updateLoadingProgress(5, 'Initializing document...', 'Setting up PDF viewer...');

            // Update state
            appState.pdfFile = pdfFile;
            appState.chayaDocument = ChayaDocument.fromRegions(regions);
            appState.loadedChayaFileName = file.name;

            this.postLoading(pdfArrayBuffer);
            console.log('Successfully loaded .chaya file');
        } catch (error) {
            console.error('Error loading .chaya file:', error);
            updateLoadingProgress(0, 'Error loading .chaya file', `Failed: ${error}`);
            setTimeout(() => {
                loadingDiv.classList.add('hidden');
            }, 3000);
        }
    }

    private async downloadChayaFile(): Promise<void> {
        if (!appState.pdfDocument || !appState.pdfFile) {
            alert('No document loaded to create .chaya file');
            return;
        }

        try {
            console.log('Creating .chaya file...');

            const zip = new JSZip();

            // Add manifest.json
            const manifest = {
                version: "1.0",
                created: new Date().toISOString(),
                originalFilename: appState.pdfFile.name,
                chayaFormatVersion: "1.0",
                application: {
                    name: "Chaya",
                    version: "1.0.0"
                }
            };
            zip.file("manifest.json", JSON.stringify(manifest, null, 2));

            // Add original PDF
            const pdfArrayBuffer = await readFileAsArrayBuffer(appState.pdfFile);
            zip.file("document.pdf", pdfArrayBuffer);

            // Add annotations.json
            const annotationsData = this.createAnnotationsJSON();
            zip.file("annotations.json", JSON.stringify(annotationsData, null, 2));

            // Generate ZIP file with proper MIME type
            const zipBlob = await zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: {
                    level: 9
                }
            });

            // Create blob with application/zip MIME type to help browsers recognize it
            const chayaBlob = new Blob([zipBlob], { type: 'application/zip' });

            // Download the .chaya file
            const fileName = appState.pdfFile.name.replace(/\.pdf$/i, '.chaya');
            const url = URL.createObjectURL(chayaBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Mark as saved since we just exported everything
            appState.hasUnsavedChanges = false;

            console.log('Successfully created .chaya file:', fileName);

        } catch (error) {
            console.error('Error creating .chaya file:', error);
            alert('Error creating .chaya file: ' + error);
        }
    }

    // Creates annotations JSON structure for saving to the file.
    private createAnnotationsJSON(): any {
        const annotationsByPage: Record<string, any[]> = {};
        // Convert the Map to the plain object required by JSON.stringify
        appState.chayaDocument.markedRegions.forEach((regions, pageNumber) => {
            annotationsByPage[String(pageNumber)] = regions.map(ann => ({
                id: ann.id,
                x: ann.x, y: ann.y,
                width: ann.width, height: ann.height,
                label: ann.label
            }));
        });

        return {
            metadata: {
                sourcePdf: appState.pdfFile?.name || 'unknown.pdf',
                annotationVersion: "1.1",
                annotatedAt: new Date().toISOString()
            },
            annotationsByPage
        };
    }

    private async downloadPdfFile(): Promise<void> {
        if (!appState.pdfFile) return;

        // Download the original PDF file
        const url = URL.createObjectURL(appState.pdfFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = appState.pdfFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ChayaApp();
});

// CSS for tab styling
const style = document.createElement('style');
style.textContent = `
    .tab-btn.active {
        background-color: rgb(219 234 254);
        color: rgb(29 78 216);
    }
    
    .tab-btn:not(.active) {
        color: rgb(75 85 99);
    }
    
    .tab-btn:not(.active):hover {
        color: rgb(31 41 55);
        background-color: rgb(249 250 251);
    }
    
    .tab-btn.opacity-50 {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;
document.head.appendChild(style);
