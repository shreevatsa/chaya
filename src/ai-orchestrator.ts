
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

    // 2. Get the API keys, prompting the user if necessary.
    const geminiApiKey = getGeminiApiKey();
    if (!geminiApiKey) {
        return null; // User cancelled or no key provided
    }

    const googleVisionApiKey = getGoogleVisionApiKey();
    if (!googleVisionApiKey) {
        return null; // User cancelled or no key provided
    }

    // 3. Get word-level OCR data from Google Vision API
    const canvas = pageDiv.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Could not find canvas for page", pageNumber);
        return null;
    }

    let visionData;
    try {
        console.log("Orchestrator: Getting word-level OCR from Google Vision...");
        visionData = await getWordLevelOCR(canvas, googleVisionApiKey);
        console.log("Orchestrator: Got", visionData.words.length, "words from Vision API");
    } catch (error) {
        console.error("Orchestrator: Vision API failed:", error);
        alert(`Vision API failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }

    // 4. Prepare the request for the AI engine.
    const request = await prepareAnnotationRequest(pageDiv, pageNumber, userPrompt, allAnnotations, getCanvasForPage, visionData);
    if (!request) {
        return null; // Could not prepare the request
    }

    // 5. Instantiate the engine and run the annotation process.
    //    This is where you could easily swap in a different engine, e.g., OpenAIEngine.
    const engine: AIEngine = new GeminiEngine(geminiApiKey);

    try {
        console.log("Orchestrator: Calling AI engine...");
        const response = await engine.annotate(request);
        console.log("Orchestrator: AI engine returned successfully.");

        // 6. Convert the engine's response into the application's annotation format.
        return convertResponseToAnnotations(response.parsedAnnotations, pageNumber, visionData, canvas);

    } catch (error) {
        console.error("Orchestrator: An error occurred during AI processing:", error);
        alert(`AI processing failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

// --- Helper Functions for Orchestration ---

/**
 * Word data from Google Vision API
 */
interface VisionWord {
    text: string;
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
}

/**
 * Complete response from Google Vision API
 */
interface VisionData {
    words: VisionWord[];
    fullText: string;
    rawResponse: any; // Store full response for future experiments
}

/**
 * Get word-level OCR data from Google Vision API
 */
async function getWordLevelOCR(canvas: HTMLCanvasElement, apiKey: string): Promise<VisionData> {
    const base64Image = canvas.toDataURL('image/jpeg', 1.0).split(',')[1];
    
    const apiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
    const requestData = {
        requests: [{
            image: { content: base64Image },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
        }]
    };
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Vision API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.responses || !data.responses[0] || !data.responses[0].textAnnotations) {
        throw new Error('Invalid response from Google Vision API');
    }
    
    const ocrResponse = data.responses[0];
    const fullText = ocrResponse.fullTextAnnotation?.text || '';
    
    // Extract word-level data (skip first annotation which is full text)
    const words: VisionWord[] = ocrResponse.textAnnotations.slice(1).map((word: any) => {
        const box = word.boundingPoly || word.boundingBox;
        return {
            text: word.description,
            xmin: Math.min(...box.vertices.map((v: any) => v.x || 0)),
            xmax: Math.max(...box.vertices.map((v: any) => v.x || 0)),
            ymin: Math.min(...box.vertices.map((v: any) => v.y || 0)),
            ymax: Math.max(...box.vertices.map((v: any) => v.y || 0))
        };
    });
    
    return {
        words,
        fullText,
        rawResponse: data.responses[0] // Store for future experiments
    };
}

/**
 * Prepares the request object needed by the AIEngine.
 * This involves getting the canvas, extracting the image, and gathering few-shot examples.
 */
async function prepareAnnotationRequest(
    pageDiv: HTMLDivElement,
    pageNumber: number,
    prompt: string,
    allAnnotations: Annotation[],
    getCanvasForPage: (pageNumber: number) => HTMLCanvasElement | null,
    visionData: VisionData
): Promise<AIAnnotationRequest | null> {
    const canvas = pageDiv.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Could not find canvas for page", pageNumber);
        return null;
    }

    const base64Image = canvas.toDataURL('image/png').split(',')[1];

    // Get examples from up to 2 most recent annotated pages for few-shot prompting.
    const examples = getExamplesFromRecentPages(pageNumber, allAnnotations, getCanvasForPage);

    // Transform vision data for LLM consumption (easy experimentation point)
    const transformedVisionData = transformVisionDataForLLM(visionData, canvas);

    return { 
        base64Image, 
        prompt: enhancePromptWithVisionData(prompt, transformedVisionData), 
        examples 
    };
}

/**
 * Transform vision data for LLM consumption - easy experimentation point
 * This function can be easily modified to experiment with different formats
 */
function transformVisionDataForLLM(visionData: VisionData, canvas: HTMLCanvasElement): any {
    // EXPERIMENT POINT: Transform coordinates to different ranges
    const coordTransform = (coord: number, dimension: number) => {
        // Current: normalize to 0-1000 range
        return Math.round((coord / dimension) * 1000);
    };
    
    // EXPERIMENT POINT: Choose what data to include
    const transformedWords = visionData.words.map((word, index) => ({
        index,
        text: word.text,
        // EXPERIMENT POINT: Different coordinate formats
        box_2d: [
            coordTransform(word.ymin, canvas.height), // ymin
            coordTransform(word.xmin, canvas.width),  // xmin
            coordTransform(word.ymax, canvas.height), // ymax
            coordTransform(word.xmax, canvas.width)   // xmax
        ]
    }));
    
    return {
        words: transformedWords,
        fullText: visionData.fullText,
        // EXPERIMENT POINT: Include more/less raw data
        pageWidth: canvas.width,
        pageHeight: canvas.height
    };
}

/**
 * Enhance the user prompt with vision data
 */
function enhancePromptWithVisionData(userPrompt: string, visionData: any): string {
    return `${userPrompt}

I'm also providing precise word-level OCR data from Google Vision API. Use this data to create accurate bounding boxes for semantic regions.

WORD DATA (coordinates normalized to 0-1000):
${JSON.stringify(visionData.words, null, 2)}

For each semantic region, provide:
1. The wordIndices array containing the indices of words that belong to this region
2. The semantic type and descriptive label
3. The bounding box that encompasses all words in the region

Return as JSON array with format:
[
  {
    "wordIndices": [0, 1, 2, 3],
    "semanticType": "title", 
    "label": "descriptive label",
    "box_2d": [ymin, xmin, ymax, xmax]
  }
]`;
}

/**
 * Converts the raw, parsed annotations from the AI engine into the application's
 * internal Annotation format, including generating unique IDs.
 */
function convertResponseToAnnotations(parsedAnnotations: any[], pageNumber: number, visionData: VisionData, canvas: HTMLCanvasElement): Annotation[] {
    return parsedAnnotations.map((region: any) => {
        // EXPERIMENT POINT: Try different approaches for bounding box calculation
        
        // Method 1: Use word indices to calculate precise bounding box
        if (region.wordIndices && Array.isArray(region.wordIndices) && region.wordIndices.length > 0) {
            const regionWords = region.wordIndices
                .map((idx: number) => visionData.words[idx])
                .filter(Boolean);
            
            if (regionWords.length > 0) {
                // Calculate precise bounding box from actual words
                const xmin = Math.min(...regionWords.map((w: VisionWord) => w.xmin));
                const xmax = Math.max(...regionWords.map((w: VisionWord) => w.xmax));
                const ymin = Math.min(...regionWords.map((w: VisionWord) => w.ymin));
                const ymax = Math.max(...regionWords.map((w: VisionWord) => w.ymax));
                
                // Convert to fractional coordinates
                const x = xmin / canvas.width;
                const y = ymin / canvas.height;
                const width = Math.max(0.01, (xmax - xmin) / canvas.width);
                const height = Math.max(0.01, (ymax - ymin) / canvas.height);
                
                return {
                    id: generateId(),
                    x, y, width, height,
                    label: region.label || 'AI Annotation',
                    semanticType: region.semanticType,
                    pageNumber: pageNumber,
                    wordIndices: region.wordIndices,
                    ocrText: regionWords.map((w: VisionWord) => w.text).join(' ')
                };
            }
        }
        
        // Method 2: Fallback to box_2d coordinates
        const box2d = region.box_2d || region.box2d || [0, 0, 100, 100];
        
        if (!Array.isArray(box2d) || box2d.length !== 4) {
            console.warn('Invalid box_2d format and no valid wordIndices, using fallback:', box2d);
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
            semanticType: region.semanticType,
            pageNumber: pageNumber
        };
    });
}

/**
 * Retrieves the Gemini API key from local storage, or prompts the user if not found.
 */
function getGeminiApiKey(): string | null {
    let apiKey = localStorage.getItem('gemini-api-key');
    if (!apiKey) {
        apiKey = window.prompt('Please enter your Gemini API key (will be saved for this session):');
        if (apiKey) {
            localStorage.setItem('gemini-api-key', apiKey);
        } else {
            alert("Gemini API key is required to use the AI feature.");
            return null;
        }
    }
    return apiKey;
}

/**
 * Retrieves the Google Vision API key from local storage, or prompts the user if not found.
 */
function getGoogleVisionApiKey(): string | null {
    let apiKey = localStorage.getItem('google-vision-api-key');
    if (!apiKey) {
        apiKey = window.prompt('Please enter your Google Vision API key (will be saved for this session):');
        if (apiKey) {
            localStorage.setItem('google-vision-api-key', apiKey);
        } else {
            alert("Google Vision API key is required to use the AI feature.");
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
