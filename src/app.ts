import { initializePdfjs, waitForPdfjs, parseAnnotationsFromJson, Annotation as SharedAnnotation } from './pdf-utils.js';

// Initialize PDF.js
initializePdfjs();

// Application state
interface AppState {
    currentTab: 'mark' | 'edit' | 'read';
    documentLoaded: boolean;
    pdfFile: File | null;
    annotationsFile: File | null;
    loadedAnnotations: SharedAnnotation[];
    loadedAnnotationsFileName: string | null;
    pdfDocument: any | null;
    hasUnsavedChanges: boolean;
}

class ChayaApp {
    private state: AppState = {
        currentTab: 'mark',
        documentLoaded: false,
        pdfFile: null,
        annotationsFile: null,
        loadedAnnotations: [],
        loadedAnnotationsFileName: null,
        pdfDocument: null,
        hasUnsavedChanges: false
    };

    constructor() {
        this.initializeTabSwitching();
        this.initializeCentralizedFileLoading();
        this.initializeMarkTab();
        this.initializeReadTab();
        
        // Start with Mark tab
        this.switchToTab('mark');
    }

    private initializeTabSwitching(): void {
        const markBtn = document.getElementById('mark-tab-btn') as HTMLButtonElement;
        const editBtn = document.getElementById('edit-tab-btn') as HTMLButtonElement;
        const readBtn = document.getElementById('read-tab-btn') as HTMLButtonElement;

        markBtn.addEventListener('click', () => this.switchToTab('mark'));
        readBtn.addEventListener('click', () => this.switchToTab('read'));
        
        // Edit tab is disabled for now
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Could show a modal about coming soon feature
        });
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
        const targetTab = document.getElementById(`${tab}-tab`);
        if (targetTab) {
            targetTab.classList.remove('hidden');
        }

        // Activate target button
        const targetBtn = document.getElementById(`${tab}-tab-btn`);
        if (targetBtn && tab !== 'edit') { // Edit tab stays disabled
            targetBtn.classList.add('active', 'bg-blue-100', 'text-blue-700');
            targetBtn.classList.remove('text-gray-600', 'hover:text-gray-800');
        }

        console.log(`Switched to ${tab} tab`);
    }

    private initializeCentralizedFileLoading(): void {
        const pdfUpload = document.getElementById('app-pdf-upload') as HTMLInputElement;
        const annotationsUpload = document.getElementById('app-annotations-upload') as HTMLInputElement;
        const loadFilesBtn = document.getElementById('load-files-btn') as HTMLButtonElement;
        const fileStatus = document.getElementById('file-status') as HTMLDivElement;

        // File input handlers
        pdfUpload.addEventListener('change', (event) => {
            const target = event.target as HTMLInputElement;
            this.state.pdfFile = target.files?.[0] || null;
            this.updateFileStatus();
        });

        annotationsUpload.addEventListener('change', (event) => {
            const target = event.target as HTMLInputElement;
            this.state.annotationsFile = target.files?.[0] || null;
            if (this.state.annotationsFile) {
                this.state.loadedAnnotationsFileName = this.state.annotationsFile.name;
            }
            this.updateFileStatus();
        });

        // Load files button
        loadFilesBtn.addEventListener('click', async () => {
            if (!this.state.pdfFile) return;
            
            // Check for unsaved changes
            if (this.state.hasUnsavedChanges) {
                const confirmed = confirm(
                    'You have unsaved changes that will be lost when loading new files. ' +
                    'Do you want to continue?'
                );
                if (!confirmed) return;
            }

            await this.loadFiles();
        });

        // Initial status update
        this.updateFileStatus();
    }

    private updateFileStatus(): void {
        const loadFilesBtn = document.getElementById('load-files-btn') as HTMLButtonElement;
        const fileStatus = document.getElementById('file-status') as HTMLDivElement;

        if (this.state.pdfFile) {
            loadFilesBtn.disabled = false;
            const pdfName = this.state.pdfFile.name;
            const annotationsName = this.state.annotationsFile?.name;
            
            if (annotationsName) {
                fileStatus.textContent = `Ready to load: ${pdfName} + ${annotationsName}`;
            } else {
                fileStatus.textContent = `Ready to load: ${pdfName}`;
            }
        } else {
            loadFilesBtn.disabled = true;
            fileStatus.textContent = 'Select a PDF file to begin';
        }
    }

    private async loadFiles(): Promise<void> {
        if (!this.state.pdfFile) return;

        const loadingDiv = document.getElementById('app-loading') as HTMLDivElement;
        const loadingText = document.getElementById('app-loading-text') as HTMLSpanElement;
        const loadingPercent = document.getElementById('app-loading-percent') as HTMLSpanElement;
        const progressBar = document.getElementById('app-progress-bar') as HTMLDivElement;
        const loadingDetails = document.getElementById('app-loading-details') as HTMLDivElement;

        try {
            // Show loading progress
            loadingDiv.classList.remove('hidden');
            this.updateLoadingProgress(0, 'Loading PDF...', 'Reading PDF file...');

            // Load PDF
            const pdfArrayBuffer = await this.readFileAsArrayBuffer(this.state.pdfFile);
            this.updateLoadingProgress(30, 'Processing PDF...', 'Initializing PDF.js...');

            const pdfjs = await waitForPdfjs();
            const loadingTask = pdfjs.getDocument(new Uint8Array(pdfArrayBuffer));
            this.state.pdfDocument = await loadingTask.promise;

            this.updateLoadingProgress(70, 'Loading annotations...', 'Processing annotation file...');

            // Load annotations if provided
            if (this.state.annotationsFile) {
                const annotationsText = await this.readFileAsText(this.state.annotationsFile);
                const annotationsData = JSON.parse(annotationsText);
                this.state.loadedAnnotations = parseAnnotationsFromJson(annotationsData);
            } else {
                this.state.loadedAnnotations = [];
                this.state.loadedAnnotationsFileName = null;
            }

            this.updateLoadingProgress(100, 'Complete!', 'Files loaded successfully');
            
            // Mark as loaded
            this.state.documentLoaded = true;
            this.state.hasUnsavedChanges = false;

            // Notify tabs that data is ready
            this.notifyTabsDataReady();

            // Hide loading after a short delay
            setTimeout(() => {
                loadingDiv.classList.add('hidden');
            }, 1000);

        } catch (error) {
            console.error('Error loading files:', error);
            this.updateLoadingProgress(0, 'Error loading files', `Failed: ${error}`);
            setTimeout(() => {
                loadingDiv.classList.add('hidden');
            }, 3000);
        }
    }

    private updateLoadingProgress(percent: number, text: string, details: string): void {
        const loadingText = document.getElementById('app-loading-text') as HTMLSpanElement;
        const loadingPercent = document.getElementById('app-loading-percent') as HTMLSpanElement;
        const progressBar = document.getElementById('app-progress-bar') as HTMLDivElement;
        const loadingDetails = document.getElementById('app-loading-details') as HTMLDivElement;

        const clampedPercent = Math.max(0, Math.min(100, percent));
        
        progressBar.style.width = `${clampedPercent}%`;
        loadingPercent.textContent = `${Math.round(clampedPercent)}%`;
        loadingText.textContent = text;
        loadingDetails.textContent = details;
        
        // Update progress bar color based on status
        if (clampedPercent === 100) {
            progressBar.className = 'bg-green-600 h-2 rounded-full transition-all duration-300';
        } else if (clampedPercent === 0 && text.includes('Error')) {
            progressBar.className = 'bg-red-600 h-2 rounded-full transition-all duration-300';
        } else {
            progressBar.className = 'bg-blue-600 h-2 rounded-full transition-all duration-300';
        }
    }

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

    private notifyTabsDataReady(): void {
        // Dispatch custom events to notify tabs that data is ready
        const dataReadyEvent = new CustomEvent('appDataReady', {
            detail: {
                pdfDocument: this.state.pdfDocument,
                annotations: this.state.loadedAnnotations,
                annotationsFileName: this.state.loadedAnnotationsFileName,
                pdfFileName: this.state.pdfFile?.name
            }
        });
        
        document.dispatchEvent(dataReadyEvent);
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

    public updateAnnotations(annotations: SharedAnnotation[]): void {
        this.state.loadedAnnotations = annotations;
        this.state.hasUnsavedChanges = true;
    }

    public markAsSaved(): void {
        this.state.hasUnsavedChanges = false;
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