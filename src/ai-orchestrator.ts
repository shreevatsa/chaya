
// In src/ai-orchestrator.ts

// This file is the bridge between the browser UI and the headless AI engine.
// It handles DOM interactions, user prompts, and orchestrates the AI workflow.

import { AIEngine, GeminiEngine, AIAnnotationRequest } from './ai-engine.js';
import { Annotation as SharedAnnotation, generateId } from './pdf-utils.js';

// Use the shared Annotation type from the project
export type Annotation = SharedAnnotation;

/**
 * This is the main entry point called by the UI (annotator.ts).
 * It orchestrates the entire AI-assisted annotation process for a single page.
 * @returns A promise that resolves to an array of new annotations, or null if the user cancels.
 */
export async function runAIAssistedAnnotation(
    pageDiv: HTMLDivElement,
    pageNumber: number,
    allAnnotations: Annotation[],
    getCanvasForPage: (pageNumber: number) => HTMLCanvasElement | null
): Promise<Annotation[] | null> {

    // 1. Get user input from the dialog.
    const userPrompt = await showAIPromptDialog(pageNumber);
    if (userPrompt === null) {
        return null; // User cancelled
    }

    // 2. Get the API key, prompting the user if necessary.
    const apiKey = getApiKey();
    if (!apiKey) {
        return null; // User cancelled or no key provided
    }

    // 3. Prepare the request for the AI engine.
    const request = await prepareAnnotationRequest(pageDiv, pageNumber, userPrompt, allAnnotations, getCanvasForPage);
    if (!request) {
        return null; // Could not prepare the request (e.g., canvas not found)
    }

    // 4. Instantiate the engine and run the annotation process.
    //    This is where you could easily swap in a different engine, e.g., OpenAIEngine.
    const engine: AIEngine = new GeminiEngine(apiKey);

    try {
        console.log("Orchestrator: Calling AI engine...");
        const response = await engine.annotate(request);
        console.log("Orchestrator: AI engine returned successfully.");

        // 5. Convert the engine's response into the application's annotation format.
        return convertResponseToAnnotations(response.parsedAnnotations, pageNumber);

    } catch (error) {
        console.error("Orchestrator: An error occurred during AI processing:", error);
        alert(`AI processing failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

// --- Helper Functions for Orchestration ---

/**
 * Prepares the request object needed by the AIEngine.
 * This involves getting the canvas, extracting the image, and gathering few-shot examples.
 */
async function prepareAnnotationRequest(
    pageDiv: HTMLDivElement,
    pageNumber: number,
    prompt: string,
    allAnnotations: Annotation[],
    getCanvasForPage: (pageNumber: number) => HTMLCanvasElement | null
): Promise<AIAnnotationRequest | null> {
    const canvas = pageDiv.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Could not find canvas for page", pageNumber);
        return null;
    }

    const base64Image = canvas.toDataURL('image/png').split(',')[1];

    // Get examples from up to 2 most recent annotated pages for few-shot prompting.
    const examples = getExamplesFromRecentPages(pageNumber, allAnnotations, getCanvasForPage);

    return { base64Image, prompt, examples };
}

/**
 * Converts the raw, parsed annotations from the AI engine into the application's
 * internal Annotation format, including generating unique IDs.
 */
function convertResponseToAnnotations(parsedAnnotations: any[], pageNumber: number): Annotation[] {
    return parsedAnnotations.map((region: any) => {
        // Extract box_2d coordinates [ymin, xmin, ymax, xmax] normalized to 0-1000
        const box2d = region.box_2d || region.box2d || [0, 0, 100, 100]; // fallback if missing
        
        if (!Array.isArray(box2d) || box2d.length !== 4) {
            console.warn('Invalid box_2d format, using fallback:', box2d);
            const x = Math.max(0, Math.min(1, region.x || 0));
            const y = Math.max(0, Math.min(1, region.y || 0));
            const width = Math.max(0.01, Math.min(1 - x, region.width || 0.1));
            const height = Math.max(0.01, Math.min(1 - y, region.height || 0.1));
            
            return {
                id: generateId(),
                x, y, width, height,
                label: region.label || 'AI Annotation',
                pageNumber: pageNumber
            };
        }
        
        // Convert from [ymin, xmin, ymax, xmax] (0-1000) to fractional coordinates (0-1)
        const ymin = Math.max(0, Math.min(1000, box2d[0])) / 1000;
        const xmin = Math.max(0, Math.min(1000, box2d[1])) / 1000;
        const ymax = Math.max(0, Math.min(1000, box2d[2])) / 1000;
        const xmax = Math.max(0, Math.min(1000, box2d[3])) / 1000;
        
        // Convert to our annotation format (x, y, width, height)
        const x = xmin;
        const y = ymin;
        const width = Math.max(0.01, xmax - xmin);
        const height = Math.max(0.01, ymax - ymin);

        return {
            id: generateId(),
            x, y, width, height,
            label: region.label || 'AI Annotation',
            pageNumber: pageNumber
        };
    });
}

/**
 * Retrieves the Gemini API key from local storage, or prompts the user if not found.
 */
function getApiKey(): string | null {
    let apiKey = localStorage.getItem('gemini-api-key');
    if (!apiKey) {
        apiKey = window.prompt('Please enter your Gemini API key (will be saved for this session):');
        if (apiKey) {
            localStorage.setItem('gemini-api-key', apiKey);
        } else {
            alert("API key is required to use the AI feature.");
            return null;
        }
    }
    return apiKey;
}

/**
 * Shows a dialog to get the AI annotation prompt from the user.
 * @returns A promise that resolves with the user's prompt, or null if they cancel.
 */
function showAIPromptDialog(pageNumber: number): Promise<string | null> {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-20 flex items-center justify-center';

        const dialog = document.createElement('div');
        dialog.className = 'bg-white rounded-lg shadow-xl p-6 max-w-lg w-full';

        dialog.innerHTML = `
            <h3 class="text-lg font-bold mb-4">AI Annotate Page ${pageNumber}</h3>
            <label for="ai-prompt" class="block text-sm font-medium text-gray-700 mb-2">Prompt for AI:</label>
            <textarea id="ai-prompt" class="w-full h-32 p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">Break this document page into "regions" (paragraphs etc), and for each region, provide a descriptive label and bounding box. The box_2d should be [ymin, xmin, ymax, xmax] normalized to 0-1000.</textarea>
            <div class="mt-4 flex justify-end gap-3">
                <button id="ai-cancel" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                <button id="ai-submit" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">🤖 Annotate with AI</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const textarea = dialog.querySelector('#ai-prompt') as HTMLTextAreaElement;
        const cancelBtn = dialog.querySelector('#ai-cancel') as HTMLButtonElement;
        const submitBtn = dialog.querySelector('#ai-submit') as HTMLButtonElement;

        textarea.focus();

        const cleanup = () => {
            document.body.removeChild(overlay);
        };

        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(null);
        });

        submitBtn.addEventListener('click', () => {
            const prompt = textarea.value.trim();
            if (!prompt) {
                alert('Please enter a prompt for the AI');
                return;
            }
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processing...';
            cleanup();
            resolve(prompt);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(null);
            }
        });
    });
}

/**
 * Gathers few-shot examples from previously annotated pages.
 */
function getExamplesFromRecentPages(
    currentPageNumber: number,
    allAnnotations: Annotation[],
    getCanvasForPage: (pageNumber: number) => HTMLCanvasElement | null
): { base64Image: string; annotations: any[]; }[] {
    const examples: { base64Image: string; annotations: any[]; }[] = [];
    const annotatedPageNumbers = [...new Set(allAnnotations.map(a => a.pageNumber))]
        .filter(pn => pn !== currentPageNumber)
        .sort((a, b) => b - a); // Most recent first

    for (const pageNum of annotatedPageNumbers.slice(0, 2)) { // Take up to 2 examples
        const canvas = getCanvasForPage(pageNum);
        if (canvas) {
            const base64Image = canvas.toDataURL('image/png').split(',')[1];
            const annotations = allAnnotations
                .filter(a => a.pageNumber === pageNum)
                .map(a => {
                    // Convert from our internal format to box_2d format [ymin, xmin, ymax, xmax] (0-1000)
                    const ymin = Math.round(a.y * 1000);
                    const xmin = Math.round(a.x * 1000);
                    const ymax = Math.round((a.y + a.height) * 1000);
                    const xmax = Math.round((a.x + a.width) * 1000);
                    
                    return { 
                        box_2d: [ymin, xmin, ymax, xmax], 
                        label: a.label 
                    };
                });
            
            examples.push({ base64Image, annotations });
        }
    }
    return examples;
}
