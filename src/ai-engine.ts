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

// --- The Standard Interface ---

export interface AIEngine {
    /**
     *
     * Takes an image and a prompt, and returns structured annotation data.
     *
     * This method can implement various strategies, like multi-round refinement.
     */
    annotate(request: AIAnnotationRequest): Promise<AIAnnotationResponse>;
}

// --- A Specific Implementation for Google Gemini ---

export class GeminiEngine implements AIEngine {
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, model = 'gemini-2.5-pro') {
        this.apiKey = apiKey;
        this.model = model;
    }

    public async annotate(request: AIAnnotationRequest): Promise<AIAnnotationResponse> {
        // This implementation uses a single-round annotation process.
        console.log("Gemini Engine: Starting 1-round annotation process.");

        // Round 1: Initial annotation generation.
        const round1ResponseText = await this.runRound1(request);
        const finalAnnotations = this.parseAIResponse(round1ResponseText);

        console.log(`Gemini Engine: Completed. Found ${finalAnnotations.length} annotations.`);

        return {
            rawResponse: round1ResponseText,
            parsedAnnotations: finalAnnotations,
        };
    }

    private async runRound1(request: AIAnnotationRequest): Promise<string> {
        console.log("Gemini Engine: Round 1 - Generating initial annotations.");
        let prompt = request.prompt;

        const imageParts: any[] = [{ text: prompt }];

        // Add the main image to be annotated
        imageParts.push({
            inline_data: { mime_type: "image/png", data: request.base64Image }
        });

        // Add few-shot examples if they exist
        if (request.examples && request.examples.length > 0) {
            let exampleText = `\n\nI'm providing ${request.examples.length} example(s) from OTHER pages to show the desired style. Use them as a guide for the quality and detail expected. DO NOT copy these annotations; create new ones for the image provided above.\n`;
            
            for (const example of request.examples) {
                exampleText += `\n--- Example ---\nAnnotations (JSON):\n${JSON.stringify(example.annotations, null, 2)}\n\nVisual (see image below):\n`;
                imageParts.push({
                    inline_data: { mime_type: "image/png", data: example.base64Image }
                });
            }
            imageParts[0] = { text: prompt + exampleText };
        }

        return this.callApi(imageParts);
    }

    private async callApi(parts: any[]): Promise<string> {
        const requestBody = {
            contents: [{ parts }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 262144, // 256k tokens for complex documents with many regions
                response_mime_type: "application/json",
            }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error("Gemini API Error:", errorData);
            throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            console.error("Invalid response from Gemini API:", data);
            throw new Error('Invalid response from Gemini API');
        }
        return text;
    }

    private parseAIResponse(responseText: string): any[] {
        try {
            // The API is now requested to return JSON directly.
            const parsed = JSON.parse(responseText);
            if (!Array.isArray(parsed)) {
                throw new Error('AI response is not a JSON array.');
            }
            // TODO: Add validation for each object in the array.
            return parsed;
        } catch (error) {
            console.error('Failed to parse AI JSON response:', error);
            console.log('Raw AI response:', responseText);
            // As a fallback, try to extract from markdown code block
            const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[1]);
                } catch (e) {
                    // ignore secondary parsing error
                }
            }
            throw new Error('Failed to parse AI response. See console for details.');
        }
    }
}