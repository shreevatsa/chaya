import { initializePdfjs } from './pdf-utils.js';

// Initialize PDF.js
initializePdfjs();

// Application state
interface AppState {
    currentTab: 'mark' | 'edit' | 'read';
    documentLoaded: boolean;
    pdfFile: File | null;
    annotationsFile: File | null;
}

class ChayaApp {
    private state: AppState = {
        currentTab: 'mark',
        documentLoaded: false,
        pdfFile: null,
        annotationsFile: null
    };

    constructor() {
        this.initializeTabSwitching();
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

    private async initializeMarkTab(): Promise<void> {
        // Import and initialize the mark tab functionality
        // This will be the existing annotator functionality
        const { initializeAnnotator } = await import('./modes/annotator.js');
        initializeAnnotator();
    }

    private async initializeReadTab(): Promise<void> {
        // Import and initialize the read tab functionality  
        // This will be the existing viewer functionality
        const { initializeViewer } = await import('./modes/viewer.js');
        initializeViewer();
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