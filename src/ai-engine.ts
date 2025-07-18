// In src/ai-engine.ts

// This file is completely headless and has no browser dependencies.
// It can be run from a CLI or a server.

// --- Data Structures ---

export interface AIAnnotationRequest {
    base64Image: string;
    prompt: string;
    // For few-shot examples, we include the image and the expected output.
    examples?: {
        base64Image: string;
        annotations: { x: number; y: number; width: number; height: number; label: string; }[];
    }[];
}

export interface AIAnnotationResponse {
    rawResponse: string;
    parsedAnnotations: {
        x: number; y: number; width: number; height: number; label: string;
    }[];
}

// --- Gemini Annotation Helper ---

/**
 * Annotate a page image using the Gemini API.
 */
export async function annotateWithGemini(
    apiKey: string,
    request: AIAnnotationRequest,
    model = 'gemini-2.5-pro'
): Promise<AIAnnotationResponse> {
    console.log('Gemini Engine: Starting 1-round annotation process.');

    const round1ResponseText = await runRound1(apiKey, model, request);
    const finalAnnotations = parseAIResponse(round1ResponseText);

    console.log(`Gemini Engine: Completed. Found ${finalAnnotations.length} annotations.`);

    return {
        rawResponse: round1ResponseText,
        parsedAnnotations: finalAnnotations,
    };
}

async function runRound1(apiKey: string, model: string, request: AIAnnotationRequest): Promise<string> {
    console.log('Gemini Engine: Round 1 - Generating initial annotations.');
    const imageParts: any[] = [{ text: request.prompt }];

    // Add the main image to be annotated
    imageParts.push({ inline_data: { mime_type: 'image/png', data: request.base64Image } });

    if (request.examples && request.examples.length > 0) {
        let exampleText = `\n\nI'm providing ${request.examples.length} example(s) from OTHER pages to show the desired style. Use them as a guide for the quality and detail expected. DO NOT copy these annotations; create new ones for the image provided above.\n`;

        for (const example of request.examples) {
            exampleText += `\n--- Example ---\nAnnotations (JSON):\n${JSON.stringify(example.annotations, null, 2)}\n\nVisual (see image below):\n`;
            imageParts.push({ inline_data: { mime_type: 'image/png', data: example.base64Image } });
        }
        imageParts[0] = { text: request.prompt + exampleText };
    }

    return callApi(apiKey, model, imageParts);
}

async function callApi(apiKey: string, model: string, parts: any[]): Promise<string> {
    const requestBody = {
        contents: [{ parts }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 262144,
            response_mime_type: 'application/json',
        },
    };

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        }
    );

    if (!response.ok) {
        const errorData = await response.text();
        console.error('Gemini API Error:', errorData);
        throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        console.error('Invalid response from Gemini API:', data);
        throw new Error('Invalid response from Gemini API');
    }
    return text;
}

function parseAIResponse(responseText: string): any[] {
    try {
        const parsed = JSON.parse(responseText);
        if (!Array.isArray(parsed)) {
            throw new Error('AI response is not a JSON array.');
        }
        return parsed;
    } catch (error) {
        console.error('Failed to parse AI JSON response:', error);
        console.log('Raw AI response:', responseText);
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch {
                /* ignore */
            }
        }
        throw new Error('Failed to parse AI response. See console for details.');
    }
}