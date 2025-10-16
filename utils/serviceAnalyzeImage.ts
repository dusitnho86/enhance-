/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Type } from "@google/genai";
import { extractJson } from './extractJson';

const dataUrlToBlob = (dataUrl: string): {mimeType: string, data: string} => {
    const parts = dataUrl.split(',');
    const mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const data = parts[1];
    return { mimeType, data };
}

interface OptimalSettings {
    sharpness: number;
    denoise: number;
    imagination: number;
}

export const serviceAnalyzeForOptimalSettings = async (imageDataUrl: string): Promise<OptimalSettings> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const { mimeType, data: base64Data } = dataUrlToBlob(imageDataUrl);

    if (!base64Data) {
        throw new Error("Invalid image data URL provided to serviceAnalyzeForOptimalSettings.");
    }
    
    const imagePart = {
        inlineData: {
            mimeType,
            data: base64Data,
        },
    };
    
    const textPart = {
        text: `You are an expert photo editor AI. Your task is to analyze the provided image and recommend optimal settings for enhancement. The available settings are:

- **sharpness** (0-100): Controls the crispness of details. Low values are soft, high values are very sharp.
- **denoise** (0-100): Controls the amount of noise reduction. Low values preserve grain, high values create a very smooth image.
- **imagination** (0-100): Controls creative freedom. Low values are a faithful upscale, high values allow for artistic transformation.

Analyze the image's characteristics (e.g., blurry, noisy, clear, abstract) and determine the best settings to improve its overall quality and appeal.

Return your response as a JSON object with the keys "sharpness", "denoise", and "imagination", each with an integer value from 0 to 100.
`,
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    sharpness: { type: Type.INTEGER },
                    denoise: { type: Type.INTEGER },
                    imagination: { type: Type.INTEGER },
                },
                required: ['sharpness', 'denoise', 'imagination'],
            }
        }
    });
    
    const text = response.text.trim();
    const data = extractJson<OptimalSettings>(text);
    
    if (typeof data?.sharpness !== 'number' || typeof data?.denoise !== 'number' || typeof data?.imagination !== 'number') {
        throw new Error('Invalid settings format from API.');
    }

    return data;
};