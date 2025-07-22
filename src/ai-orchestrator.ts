
// In src/ai-orchestrator.ts

// This file is the bridge between the browser UI and the headless AI engine.
// It handles DOM interactions, user prompts, and orchestrates the AI workflow.

import { annotateWithGemini, AIAnnotationRequest } from './ai-engine.js';
import { Annotation, generateId } from './models.js';

/**
 * This is the main entry point called by the UI (annotator.ts).
 * It orchestrates the entire AI-assisted annotation process for multiple pages.
 * @returns A promise that resolves to an array of new annotations, or null if the user cancels.
 */
export async function runAIAssistedAnnotation(
    pageDiv: HTMLDivElement,
    pageNumber: number,
    allAnnotations: Annotation[],
    getCanvasForPage: (pageNumber: number) => HTMLCanvasElement | null
): Promise<Annotation[] | null> {

    // 1. Get user input from the dialog.
    const userPrompt = `Break these document pages into "regions" (paragraphs etc), and for each region, provide a descriptive label and bounding box. The box_2d should be [ymin, xmin, ymax, xmax] normalized to 0-1000. Don't make bounding boxes too tight - leave 5-10 pixels of empty space on all sides.`;

    // 2. Get the API keys, prompting the user if necessary.
    const geminiApiKey = getGeminiApiKey();
    if (!geminiApiKey) {
        return null; // User cancelled or no key provided
    }

    const googleVisionApiKey = getGoogleVisionApiKey();
    if (!googleVisionApiKey) {
        return null; // User cancelled or no key provided
    }

    // 3. Determine which pages to process (current page + up to 4 more)
    const startPage = pageNumber;
    const maxPages = 5;
    const pagesToProcess: number[] = [];

    // Get total pages from the document
    const totalPages = getTotalPages(getCanvasForPage);

    for (let i = 0; i < maxPages && (startPage + i) <= totalPages; i++) {
        pagesToProcess.push(startPage + i);
    }

    console.log(`Orchestrator: Processing ${pagesToProcess.length} pages: ${pagesToProcess.join(', ')}`);

    // 4. Get word-level OCR data from Google Vision API for all pages
    const pageVisionData: { [pageNum: number]: VisionData } = {};

    try {
        for (const pageNum of pagesToProcess) {
            const canvas = getCanvasForPage(pageNum);
            if (!canvas) {
                console.error(`Could not find canvas for page ${pageNum}`);
                continue;
            }

            console.log(`Orchestrator: Getting word-level OCR for page ${pageNum}...`);
            pageVisionData[pageNum] = await getWordLevelOCR(canvas, googleVisionApiKey);
            console.log(`Orchestrator: Got ${pageVisionData[pageNum].words.length} words from page ${pageNum}`);
        }
    } catch (error) {
        console.error("Orchestrator: Vision API failed:", error);
        alert(`Vision API failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }

    // 5. Prepare the request for the AI engine with multiple pages.
    const request = await prepareMultiPageAnnotationRequest(pagesToProcess, userPrompt, allAnnotations, getCanvasForPage, pageVisionData);
    if (!request) {
        return null; // Could not prepare the request
    }

    // 6. Call the Gemini API to get annotations
    try {
        console.log("Orchestrator: Calling Gemini API for multi-page processing...");
        const response = await annotateWithGemini(geminiApiKey, request);
        console.log("Orchestrator: AI engine returned successfully.");

        // 7. Convert the engine's response into the application's annotation format.
        return convertMultiPageResponseToAnnotations(response.parsedAnnotations, pagesToProcess, pageVisionData, getCanvasForPage);

    } catch (error) {
        console.error("Orchestrator: An error occurred during AI processing:", error);
        alert(`AI processing failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

// --- Helper Functions for Orchestration ---

/**
 * Get total number of pages in the document
 */
function getTotalPages(getCanvasForPage: (pageNumber: number) => HTMLCanvasElement | null): number {
    let totalPages = 0;
    for (let i = 1; i <= 1000; i++) { // reasonable upper bound
        if (getCanvasForPage(i)) {
            totalPages = i;
        } else {
            break;
        }
    }
    return totalPages;
}

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
 * Prepares the request object needed for the Gemini API for multiple pages.
 */
async function prepareMultiPageAnnotationRequest(
    pageNumbers: number[],
    prompt: string,
    allAnnotations: Annotation[],
    getCanvasForPage: (pageNumber: number) => HTMLCanvasElement | null,
    pageVisionData: { [pageNum: number]: VisionData }
): Promise<AIAnnotationRequest | null> {
    // Create multi-page vision data
    const multiPageData = {
        pages: pageNumbers.map(pageNum => {
            const canvas = getCanvasForPage(pageNum);
            if (!canvas) return null;

            const visionData = pageVisionData[pageNum];
            if (!visionData) return null;

            return {
                pageNumber: pageNum,
                base64Image: canvas.toDataURL('image/png').split(',')[1],
                transformedVisionData: transformVisionDataForLLM(visionData, canvas)
            };
        }).filter(Boolean)
    };

    if (multiPageData.pages.length === 0) {
        console.error("No valid pages to process");
        return null;
    }

    // Get examples from previously annotated pages
    const examples = getExamplesFromRecentPages(pageNumbers[0], allAnnotations, getCanvasForPage);

    // Use the first page's image as the primary image for the request
    const primaryPage = multiPageData.pages[0];
    if (!primaryPage) {
        console.error("No primary page available");
        return null;
    }

    return {
        base64Image: primaryPage.base64Image,
        prompt: enhanceMultiPagePromptWithVisionData(prompt, multiPageData),
        examples
    };
}


/**
 * Transform vision data for LLM consumption - easy experimentation point
 * This function can be easily modified to experiment with different formats
 */
function transformVisionDataForLLM(visionData: VisionData, canvas: HTMLCanvasElement): any {
    const coordTransform = (coord: number, dimension: number) => {
        // Current: normalize to 0-1000 range
        return Math.round((coord / dimension) * 1000);
    };

    const transformedWords = visionData.words.map((word, index) => ({
        index,
        text: word.text,
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
        pageWidth: canvas.width,
        pageHeight: canvas.height
    };
}

/**
 * Enhance the user prompt with multi-page vision data
 */
function enhanceMultiPagePromptWithVisionData(userPrompt: string, multiPageData: any): string {
    const pageDescriptions = multiPageData.pages.map((page: any, index: number) =>
        `PAGE ${page.pageNumber} WORD DATA (coordinates normalized to 0-1000):
${JSON.stringify(page.transformedVisionData.words, null, 2)}`
    ).join('\n\n');

    return `${userPrompt}

I'm providing precise word-level OCR data from Google Vision API for ${multiPageData.pages.length} pages. Use this data to create accurate bounding boxes for semantic regions across all pages.

${pageDescriptions}

For each semantic region, provide:
1. The pageNumber indicating which page this region is on
2. The wordIndices array containing the indices of words that belong to this region (relative to that page)
3. The semantic type and descriptive label
4. The bounding box that encompasses all words in the region

IMPORTANT: Don't make the bounding boxes too tight. Make sure at least 5-10 pixels of empty space is present on all sides (i.e. the text does not intersect or touch the edges of the bounding box). It's ok for the bounding boxes to overlap slightly. Err on the side of making boxes larger rather than smaller.

Return as JSON array with format:
[
  {
    "pageNumber": 1,
    "wordIndices": [0, 1, 2, 3],
    "semanticType": "title", 
    "label": "descriptive label",
    "box_2d": [ymin, xmin, ymax, xmax]
  }
]`;
}


/**
 * Converts the raw, parsed annotations from the AI engine into the application's
 * internal Annotation format for multiple pages.
 */
function convertMultiPageResponseToAnnotations(
    parsedAnnotations: any[],
    pageNumbers: number[],
    pageVisionData: { [pageNum: number]: VisionData },
    getCanvasForPage: (pageNumber: number) => HTMLCanvasElement | null
): Annotation[] {
    const allAnnotations: Annotation[] = [];

    for (const region of parsedAnnotations) {
        const pageNumber = region.pageNumber;
        if (!pageNumber || !pageNumbers.includes(pageNumber)) {
            console.warn('Invalid or missing pageNumber in region:', region);
            continue;
        }

        const visionData = pageVisionData[pageNumber];
        const canvas = getCanvasForPage(pageNumber);

        if (!visionData || !canvas) {
            console.warn(`Missing vision data or canvas for page ${pageNumber}`);
            continue;
        }

        // Convert this single region using existing logic
        const annotation = convertSingleRegionToAnnotation(region, pageNumber, visionData, canvas);
        if (annotation) {
            allAnnotations.push(annotation);
        }
    }

    return allAnnotations;
}


/**
 * Converts a single region from AI response to Annotation format
 */
function convertSingleRegionToAnnotation(region: any, pageNumber: number, visionData: VisionData, canvas: HTMLCanvasElement): Annotation | null {
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
