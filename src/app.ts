import { MarkedRegion, appState, ChayaDocument } from './models.js';
import { initializeAnnotator, markModuleDataReady } from './annotator.js';
import { initializeViewer, readModuleDataReady } from './viewer.js';
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
    // === PUBLIC API (Interface for tabs to use) ===
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
        initializeAnnotator();
        initializeViewer();

        // Start with Mark tab
        this.switchToTab('mark');
    }

    // === TAB MANAGEMENT ===
    private switchToTab(tab: 'mark' | 'edit' | 'read'): void {
        // Update state
        appState.currentTab = tab;

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

        console.log(`Switched to ${tab} tab`);
    }

    private async postLoading(pdfArrayBuffer: ArrayBuffer) {
        updateLoadingProgress(10, 'Processing PDF...', 'Initializing PDF.js and document...');

        const pdfjs = await waitForPdfjs();
        const loadingTask = pdfjs.getDocument(new Uint8Array(pdfArrayBuffer));
        appState.pdfDocument = await loadingTask.promise;

        updateLoadingProgress(30, 'Rendering pages...', 'Processing PDF pages for display');

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

        updateLoadingProgress(100, 'Complete!', 'Chaya file loaded successfully');

        // Notify tabs that data is ready
        markModuleDataReady(appState.pdfDocument, appState.chayaDocument);
        readModuleDataReady(appState.pdfDocument, appState.chayaDocument);

        // Listen for rendering completion
        this.waitForRenderingComplete();
    }

    // Writes to `appState.pdfFile`.
    // Calls `updateLoadingProgress`, `this.postLoading`
    private async loadPdfFile(pdfFile: File): Promise<void> {
        if (!pdfFile) return;
        appState.pdfFile = pdfFile;

        try {
            updateLoadingProgress(0, 'Loading PDF...', 'Reading PDF file...');

            // Load PDF
            const pdfArrayBuffer = await readFileAsArrayBuffer(pdfFile);
            this.postLoading(pdfArrayBuffer);
        } catch (error) {
            console.error('Error loading files:', error);
            updateLoadingProgress(0, 'Error loading files', `Failed: ${error}`);
        }
    }

    // .chaya file handling methods
    /**
     * Load a `.chaya` package. A .chaya file is a ZIP archive containing
     * the original PDF, annotations and a manifest. This method extracts
     * those components and then follows the same initialization steps as
     * `loadPdfFile()`.
     */
    private async loadChayaFile(file: File): Promise<void> {
        const loadingDiv = documentGetElementById<HTMLDivElement>('app-loading');

        try {
            console.log('Loading .chaya file:', file.name);

            // Show loading progress
            loadingDiv.classList.remove('hidden');
            updateLoadingProgress(0, 'Loading .chaya file...', 'Reading ZIP file...');

            // Read ZIP file
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);

            updateLoadingProgress(5, 'Extracting files...', 'Validating .chaya format...');

            // Validate required files
            const requiredFiles = ['manifest.json', 'document.pdf', 'annotations.json'];
            for (const requiredFile of requiredFiles) {
                if (!zipContent.file(requiredFile)) {
                    throw new Error(`Invalid .chaya file: missing ${requiredFile}`);
                }
            }

            updateLoadingProgress(10, 'Reading manifest...', 'Validating format version...');

            // Read and validate manifest
            const manifestText = await zipContent.file('manifest.json')!.async('string');
            const manifest = JSON.parse(manifestText);
            console.log('Manifest:', manifest);

            updateLoadingProgress(15, 'Extracting PDF...', 'Loading document content...');

            // Extract PDF data
            const pdfArrayBuffer = await zipContent.file('document.pdf')!.async('arraybuffer');
            const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
            const pdfFile = new File([pdfBlob], manifest.originalFilename || 'document.pdf', {
                type: 'application/pdf'
            });

            updateLoadingProgress(20, 'Loading annotations...', 'Parsing annotation data...');

            // Extract annotations
            const annotationsText = await zipContent.file('annotations.json')!.async('string');
            const annotationsData = JSON.parse(annotationsText);
            const regions = MarkedRegion.parseFromJson(annotationsData);

            updateLoadingProgress(25, 'Initializing document...', 'Setting up PDF viewer...');

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

            // Create ZIP file
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

    private createAnnotationsJSON(): any {
        // Create annotations JSON structure for saving to the file.
        const annotationsData = {
            metadata: {
                sourcePdf: appState.pdfFile?.name || 'unknown.pdf',
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
        appState.chayaDocument.markedRegions.forEach(annotation => {
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

        return annotationsData;
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

    // === UTILITIES ===
    private waitForRenderingComplete(): void {
        // Listen for rendering completion from the active tab
        const handleRenderingComplete = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { tabName, totalPages, error } = customEvent.detail;

            if (error) {
                console.error(`Rendering failed for ${tabName} tab: ${error}`);
            } else {
                console.log(`Rendering complete for ${tabName} tab: ${totalPages} pages`);
            }

            // Hide loading after a short delay (progress should already be at 100% with "Complete!" text)
            const loadingDiv = documentGetElementById<HTMLDivElement>('app-loading');
            setTimeout(() => {
                console.log('Hiding loading progress bar');
                loadingDiv.classList.add('hidden');
            }, 1000);

            // Remove the event listener
            document.removeEventListener('tabRenderingComplete', handleRenderingComplete);
        };
        document.addEventListener('tabRenderingComplete', handleRenderingComplete);
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
