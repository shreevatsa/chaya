import { Annotation, parseAnnotationsFromJson } from './pdf-utils.js';

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

function documentGetElementById<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id) as T;
    if (!element) {
        throw new Error(`Required element with id '${id}' not found`);
    }
    return element;
}

// Application state
interface AppState {
    currentTab: 'mark' | 'edit' | 'read';  // Which tab of the app is active
    documentLoaded: boolean;  // Whether the document (PDF or Chaya) has been loaded yet
    pdfFile: File | null;
    loadedAnnotations: Annotation[];
    loadedAnnotationsFileName: string | null;
    pdfDocument: any | null;
    hasUnsavedChanges: boolean;
}

class ChayaApp {
    // === STATE ===
    private state: AppState = {
        currentTab: 'mark',
        documentLoaded: false,
        pdfFile: null,
        loadedAnnotations: [],
        loadedAnnotationsFileName: null,
        pdfDocument: null,
        hasUnsavedChanges: false
    };

    // === PUBLIC API (Interface for tabs to use) ===
    constructor() {
        this.setupFileInputListeners();
        this.updateSlotUI();
        this.setupTabSwitchingEventListeners();
        this.initializeMarkTab();
        this.initializeReadTab();

        // Start with Mark tab
        this.switchToTab('mark');
    }
    // Public methods for tabs to access shared state
    public getSharedState() {
        return {
            pdfDocument: this.state.pdfDocument,
            annotations: this.state.loadedAnnotations,
            annotationsFileName: this.state.loadedAnnotationsFileName,
            pdfFileName: this.state.pdfFile?.name,
            documentLoaded: this.state.documentLoaded
        };
    }

    public updateAnnotations(annotations: Annotation[]): void {
        this.state.loadedAnnotations = annotations;
        this.state.hasUnsavedChanges = true;
    }

    public syncAnnotations(annotations: Annotation[]): void {
        // Update annotations without marking as unsaved (for sync operations)
        this.state.loadedAnnotations = annotations;
    }

    public markAsSaved(): void {
        this.state.hasUnsavedChanges = false;
    }

    public updateLoadingProgress(percent: number, text: string, details: string): void {
        const clampedPercent = Math.max(0, Math.min(100, percent));

        documentGetElementById<HTMLSpanElement>('app-loading-text').textContent = text;
        documentGetElementById<HTMLSpanElement>('app-loading-percent').textContent = `${Math.round(clampedPercent)}%`;
        documentGetElementById<HTMLDivElement>('app-loading-details').textContent = details;
        const progressBar = documentGetElementById<HTMLDivElement>('app-progress-bar');
        progressBar.style.width = `${clampedPercent}%`;
        // Update progress bar color based on status
        if (clampedPercent === 100) {
            progressBar.className = 'bg-green-600 h-2 rounded-full transition-all duration-300';
        } else if (clampedPercent === 0 && text.includes('Error')) {
            progressBar.className = 'bg-red-600 h-2 rounded-full transition-all duration-300';
        } else {
            progressBar.className = 'bg-blue-600 h-2 rounded-full transition-all duration-300';
        }
    }

    // === TAB MANAGEMENT ===
    // Clicking on Mark/Edit/Read should call `switchToTab('mark')` etc.
    private setupTabSwitchingEventListeners(): void {
        documentGetElementById<HTMLButtonElement>('mark-tab-btn').addEventListener('click', () => this.switchToTab('mark'));
        documentGetElementById<HTMLButtonElement>('read-tab-btn').addEventListener('click', () => this.switchToTab('read'));
        // Edit tab is disabled for now
        documentGetElementById<HTMLButtonElement>('edit-tab-btn').addEventListener('click', (e) => { e.preventDefault(); });
    }

    private switchToTab(tab: 'mark' | 'edit' | 'read'): void {
        // Update state
        this.state.currentTab = tab;

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

        // If we have loaded data, notify the newly active tab
        if (this.state.documentLoaded && this.state.pdfDocument) {
            console.log(`Notifying newly active ${tab} tab with existing data`);
            const tabDataEvent = new CustomEvent(`${tab}TabDataReady`, {
                detail: {
                    pdfDocument: this.state.pdfDocument,
                    annotations: this.state.loadedAnnotations,
                    annotationsFileName: this.state.loadedAnnotationsFileName,
                    pdfFileName: this.state.pdfFile?.name
                }
            });
            // Use setTimeout to ensure the tab switch visual update happens first
            setTimeout(() => {
                document.dispatchEvent(tabDataEvent);
            }, 100);
        }

        console.log(`Switched to ${tab} tab`);
    }

    private async initializeMarkTab(): Promise<void> {
        // Import and initialize the mark tab functionality
        // Pass the shared state access to the tab
        const { initializeAnnotator } = await import('./modes/annotator.js');
        initializeAnnotator();
    }

    private async initializeReadTab(): Promise<void> {
        // Import and initialize the read tab functionality  
        // Pass the shared state access to the tab
        const { initializeViewer } = await import('./modes/viewer.js');
        initializeViewer();
    }

    private setupFileInputListeners(): void {
        const chayaUpload = documentGetElementById<HTMLInputElement>('chaya-upload');
        const pdfUpload = documentGetElementById<HTMLInputElement>('pdf-upload');

        chayaUpload.addEventListener('change', async (event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files?.[0];
            if (file) {
                await this.loadChayaFile(file);
            }
        });

        pdfUpload.addEventListener('change', async (event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files?.[0];
            if (file) {
                this.state.pdfFile = file;
                this.state.loadedAnnotations = [];
                this.state.loadedAnnotationsFileName = null;
                await this.loadFiles();
            }
        });
    }

    /**
     * Load a raw PDF and, if provided, a separate annotations JSON file.
     *
     * This is the "legacy" workflow used when the user uploads a plain
     * PDF document (and optionally an annotations file). The method reads
     * those files, initializes PDF.js and populates the application state
     * so that other tabs can render the document.
     */
    private async loadFiles(): Promise<void> {
        if (!this.state.pdfFile) return;

        const loadingDiv = documentGetElementById<HTMLDivElement>('app-loading');

        try {
            // Show loading progress
            loadingDiv.classList.remove('hidden');
            this.updateLoadingProgress(0, 'Loading PDF...', 'Reading PDF file...');

            // Load PDF
            const pdfArrayBuffer = await this.readFileAsArrayBuffer(this.state.pdfFile);
            this.updateLoadingProgress(10, 'Processing PDF...', 'Initializing PDF.js...');

            const pdfjs = await waitForPdfjs();
            const loadingTask = pdfjs.getDocument(new Uint8Array(pdfArrayBuffer));
            this.state.pdfDocument = await loadingTask.promise;

            this.updateLoadingProgress(20, 'Loading annotations...', 'Processing annotation file...');

            // Load annotations if provided
            this.state.loadedAnnotations = [];
            this.state.loadedAnnotationsFileName = null;

            this.updateLoadingProgress(30, 'Rendering pages...', 'Processing PDF pages for display');

            // Mark as loaded
            this.state.documentLoaded = true;
            this.state.hasUnsavedChanges = false;

            // Update slot UI to download mode
            this.updateSlotUI();

            // Notify tabs that data is ready and wait for rendering to complete
            this.notifyTabsDataReady();

            // Listen for rendering completion
            this.waitForRenderingComplete();

        } catch (error) {
            console.error('Error loading files:', error);
            this.updateLoadingProgress(0, 'Error loading files', `Failed: ${error}`);
            setTimeout(() => {
                loadingDiv.classList.add('hidden');
            }, 3000);
        }
    }

    // .chaya file handling methods
    /**
     * Load a `.chaya` package. A .chaya file is a ZIP archive containing
     * the original PDF, annotations and a manifest. This method extracts
     * those components and then follows the same initialization steps as
     * `loadFiles()`.
     */
    private async loadChayaFile(file: File): Promise<void> {
        const loadingDiv = documentGetElementById<HTMLDivElement>('app-loading');

        try {
            console.log('Loading .chaya file:', file.name);

            // Show loading progress
            loadingDiv.classList.remove('hidden');
            this.updateLoadingProgress(0, 'Loading .chaya file...', 'Reading ZIP file...');

            // Read ZIP file
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);

            this.updateLoadingProgress(20, 'Extracting files...', 'Validating .chaya format...');

            // Validate required files
            const requiredFiles = ['manifest.json', 'document.pdf', 'annotations.json'];
            for (const requiredFile of requiredFiles) {
                if (!zipContent.file(requiredFile)) {
                    throw new Error(`Invalid .chaya file: missing ${requiredFile}`);
                }
            }

            this.updateLoadingProgress(40, 'Reading manifest...', 'Validating format version...');

            // Read and validate manifest
            const manifestText = await zipContent.file('manifest.json')!.async('string');
            const manifest = JSON.parse(manifestText);
            console.log('Manifest:', manifest);

            this.updateLoadingProgress(60, 'Extracting PDF...', 'Loading document content...');

            // Extract PDF data
            const pdfArrayBuffer = await zipContent.file('document.pdf')!.async('arraybuffer');
            const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
            const pdfFile = new File([pdfBlob], manifest.originalFilename || 'document.pdf', {
                type: 'application/pdf'
            });

            this.updateLoadingProgress(80, 'Loading annotations...', 'Parsing annotation data...');

            // Extract annotations
            const annotationsText = await zipContent.file('annotations.json')!.async('string');
            const annotationsData = JSON.parse(annotationsText);
            const annotations = parseAnnotationsFromJson(annotationsData);

            this.updateLoadingProgress(90, 'Initializing document...', 'Setting up PDF viewer...');

            // Update state
            this.state.pdfFile = pdfFile;
            this.state.loadedAnnotations = annotations;
            this.state.loadedAnnotationsFileName = file.name;

            // Load PDF document
            const pdfjs = await waitForPdfjs();
            const loadingTask = pdfjs.getDocument(new Uint8Array(pdfArrayBuffer));
            this.state.pdfDocument = await loadingTask.promise;

            this.updateLoadingProgress(95, 'Finalizing...', 'Preparing user interface...');

            // Mark as loaded
            this.state.documentLoaded = true;
            this.state.hasUnsavedChanges = false;

            // Update slot UI to download mode
            this.updateSlotUI();

            this.updateLoadingProgress(100, 'Complete!', 'Chaya file loaded successfully');

            // Notify tabs that data is ready
            this.notifyTabsDataReady();

            // Listen for rendering completion
            this.waitForRenderingComplete();

            console.log('Successfully loaded .chaya file:', file.name);

        } catch (error) {
            console.error('Error loading .chaya file:', error);
            this.updateLoadingProgress(0, 'Error loading .chaya file', `Failed: ${error}`);
            setTimeout(() => {
                loadingDiv.classList.add('hidden');
            }, 3000);
        }
    }

    private async downloadChayaFile(): Promise<void> {
        if (!this.state.pdfDocument || !this.state.pdfFile) {
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
                originalFilename: this.state.pdfFile.name,
                chayaFormatVersion: "1.0",
                application: {
                    name: "Bookchop",
                    version: "1.0.0"
                }
            };
            zip.file("manifest.json", JSON.stringify(manifest, null, 2));

            // Add original PDF
            const pdfArrayBuffer = await this.readFileAsArrayBuffer(this.state.pdfFile);
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

            // Download the .chaya file (use .zip for local development to avoid browser blocks)
            const isDevelopment = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]';
            const extension = isDevelopment ? '.chaya.zip' : '.chaya';
            const fileName = this.state.pdfFile.name.replace(/\.pdf$/i, extension);
            const url = URL.createObjectURL(chayaBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Mark as saved since we just exported everything
            this.state.hasUnsavedChanges = false;

            // Also notify the annotator that changes have been saved
            this.notifyTabsSaved();

            console.log('Successfully created .chaya file:', fileName);

        } catch (error) {
            console.error('Error creating .chaya file:', error);
            alert('Error creating .chaya file: ' + error);
        }
    }

    private createAnnotationsJSON(): any {
        // Create annotations JSON structure according to the spec
        const annotationsData = {
            metadata: {
                sourcePdf: this.state.pdfFile?.name || 'unknown.pdf',
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
        this.state.loadedAnnotations.forEach(annotation => {
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
        if (!this.state.pdfFile) return;

        // Download the original PDF file
        const url = URL.createObjectURL(this.state.pdfFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.state.pdfFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // === UI MANAGEMENT ===
    private updateSlotUI(): void {
        const chayaSlot = documentGetElementById<HTMLDivElement>('chaya-slot');
        const pdfSlot = documentGetElementById<HTMLDivElement>('pdf-slot');
        const documentFilename = documentGetElementById<HTMLDivElement>('document-filename');

        if (this.state.documentLoaded) {
            // Download mode
            const filename = this.state.pdfFile?.name || 'document';
            documentFilename.textContent = `Document: ${filename}`;
            documentFilename.classList.remove('hidden');

            // Update .chaya slot - preserve file input
            chayaSlot.innerHTML = `
                <div class="download-slot border-2 border-blue-500 bg-blue-50 rounded-lg p-8 text-center hover:bg-blue-100 transition-colors cursor-pointer">
                    <div class="text-4xl mb-3">📦</div>
                    <div class="text-sm font-medium text-blue-700 mb-1">Download .chaya</div>
                    <div class="text-xs text-blue-600">Complete package</div>
                </div>
            `;
            chayaSlot.appendChild(documentGetElementById<HTMLInputElement>('chaya-upload'));

            // Update .pdf slot - preserve file input
            pdfSlot.innerHTML = `
                <div class="download-slot border-2 border-gray-500 bg-gray-50 rounded-lg p-8 text-center hover:bg-gray-100 transition-colors cursor-pointer">
                    <div class="text-4xl mb-3">📄</div>
                    <div class="text-sm font-medium text-gray-700 mb-1">Download .pdf</div>
                    <div class="text-xs text-gray-600">Original document</div>
                </div>
            `;
            pdfSlot.appendChild(documentGetElementById<HTMLInputElement>('pdf-upload'));
        } else {
            // Upload mode
            documentFilename.classList.add('hidden');

            // Reset .chaya slot - preserve file input
            chayaSlot.innerHTML = `
                <div class="upload-slot border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer">
                    <div class="text-4xl mb-3">📦</div>
                    <div class="text-sm font-medium text-gray-700 mb-1">Upload .chaya</div>
                    <div class="text-xs text-gray-500">Complete package</div>
                </div>
            `;
            chayaSlot.appendChild(documentGetElementById<HTMLInputElement>('chaya-upload'));

            // Reset .pdf slot - preserve file input
            pdfSlot.innerHTML = `
                <div class="upload-slot border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer">
                    <div class="text-4xl mb-3">📄</div>
                    <div class="text-sm font-medium text-gray-700 mb-1">Upload .pdf</div>
                    <div class="text-xs text-gray-500">Start from scratch</div>
                </div>
            `;
            pdfSlot.appendChild(documentGetElementById<HTMLInputElement>('pdf-upload'));
        }

        // Re-attach event listeners after updating innerHTML
        this.attachSlotEventListeners();
    }

    private attachSlotEventListeners(): void {
        // Either upload or download
        documentGetElementById<HTMLDivElement>('chaya-slot').onclick = () => {
            if (!this.state.documentLoaded) {
                const chayaUpload = documentGetElementById<HTMLInputElement>('chaya-upload');
                chayaUpload.click();
            } else {
                this.downloadChayaFile();
            }
        };

        documentGetElementById<HTMLDivElement>('pdf-slot').onclick = () => {
            if (!this.state.documentLoaded) {
                const pdfUpload = documentGetElementById<HTMLInputElement>('pdf-upload');
                pdfUpload.click();
            } else {
                this.downloadPdfFile();
            }
        };
    }

    // === UTILITIES ===
    private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    private readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }


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

        // Add a timeout in case rendering gets stuck
        const timeoutId = setTimeout(() => {
            console.warn('Rendering timeout - hiding progress bar anyway');
            documentGetElementById<HTMLDivElement>('app-loading').classList.add('hidden');
            document.removeEventListener('tabRenderingComplete', handleRenderingComplete);
        }, 300000); // 5 minutes timeout

        // Store timeout ID to cancel it when rendering completes normally
        const originalHandler = handleRenderingComplete;
        const wrappedHandler = (event: Event) => {
            clearTimeout(timeoutId);
            originalHandler(event);
        };

        document.removeEventListener('tabRenderingComplete', handleRenderingComplete);
        document.addEventListener('tabRenderingComplete', wrappedHandler);
    }

    private notifyTabsDataReady(): void {
        // Only notify the currently active tab to avoid conflicts
        const activeTabEvent = new CustomEvent(`${this.state.currentTab}TabDataReady`, {
            detail: {
                pdfDocument: this.state.pdfDocument,
                annotations: this.state.loadedAnnotations,
                annotationsFileName: this.state.loadedAnnotationsFileName,
                pdfFileName: this.state.pdfFile?.name
            }
        });
        document.dispatchEvent(activeTabEvent);

        console.log(`Notified ${this.state.currentTab} tab that data is ready`);
    }


    private notifyTabsSaved(): void {
        // Dispatch event to notify tabs that data has been saved
        const savedEvent = new CustomEvent('documentSaved');
        document.dispatchEvent(savedEvent);
    }


}

// Initialize the app when DOM is ready
let appInstance: ChayaApp;

document.addEventListener('DOMContentLoaded', () => {
    appInstance = new ChayaApp();
    // Make app instance globally accessible for tabs
    (window as any).chayaApp = appInstance;
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
