/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { GoogleGenAI, Modality } from "@google/genai";

const dataUrlToBase64 = (dataUrl: string): string => {
    const parts = dataUrl.split(',');
    if (parts.length > 1) {
        return parts[1];
    }
    return '';
}

const getQualityModifiers = (sharpness: number, denoise: number): string[] => {
    const modifiers: string[] = [];

    // Sharpness
    if (sharpness <= 20) modifiers.push('have a soft focus, maintaining the original level of detail');
    else if (sharpness >= 61 && sharpness <= 80) modifiers.push('have a sharp, crisp finish, adding subtle, plausible details where the image is slightly blurry');
    else if (sharpness >= 81) modifiers.push('be extremely sharp, with highly defined details. Where the image is blurry, you must invent and add intricate, photorealistic details that are consistent with the surrounding context');
    
    // Denoise
    if (denoise <= 20) modifiers.push('preserve the original film grain and texture');
    else if (denoise >= 61 && denoise <= 80) modifiers.push('apply significant noise reduction for a clean look');
    else if (denoise >= 81) modifiers.push('be almost completely free of noise and grain, resulting in a very smooth image');

    return modifiers;
}

const getImaginationInstructions = (imagination: number): string => {
    if (imagination <= 20) {
        return `The final image should be a direct, high-resolution upscale of the input. Stick as closely as possible to the original image's shapes, colors, and content. Do not add or remove any elements.`;
    } else if (imagination <= 40) {
        return `Subtly enhance the details. You can introduce small, plausible textures and details that are hinted at in the original, but do not add new objects or significantly alter the composition.`;
    } else if (imagination <= 60) {
        return `Be moderately creative. You can reinterpret blurry or ambiguous areas into more defined objects and textures that fit the context. The overall theme and composition should remain consistent with the original.`;
    } else if (imagination <= 80) {
        return `Use your imagination. You can add new elements and transform parts of the scene, as long as it's clearly inspired by the original image's colors and shapes. The result can be a creative interpretation.`;
    } else { // 81-100
        return `Transform the image into something fantastical and surreal. The original image is merely a starting point for a highly imaginative and artistic creation. Feel free to completely reimagine the scene.`;
    }
};

export const serviceEnhance = async (croppedImageDataUrl: string, history: string[], seekNanoBanana:boolean, sharpness: number, denoise: number, imagination: number): Promise<{ imageSrc: string, foundTheBanana: boolean }> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const base64Data = dataUrlToBase64(croppedImageDataUrl);
    const imagePart = {
        inlineData: {
            mimeType: 'image/png',
            data: base64Data,
        },
    };

    if (!history || history.length === 0) {
        throw new Error("Enhancement history is empty.");
    }

    const context = history[history.length-1];
  
    const qualityModifiers = getQualityModifiers(sharpness, denoise);
    let qualityInstructions = '';
    if (qualityModifiers.length > 0) {
        qualityInstructions = `The final image should ${qualityModifiers.join(' and ')}.`;
    }
    
    const imaginationInstructions = getImaginationInstructions(imagination);

    const generationPrompt = `The provided image is a low-resolution crop, described as: "${context || 'an unknown scene'}". Your task is to upscale it into a high-resolution, detailed image.

**Creative Guidance:** ${imaginationInstructions}

**Quality Instructions:** ${qualityInstructions || 'Use default quality settings.'}

**Boundary Rules:** The resulting image must be a plausible, higher-resolution version of the input, interpreted through the creative guidance above. It should build upon the shapes and colors present in the reference image.
` + (seekNanoBanana ? `
**Easter Egg:** There's a small chance you can hide a "nano banana" 🍌 in the image. Be subtle. If you add a banana, respond with the text part as a JSON object: \`{"foundTheBanana": true}\`. Otherwise, do not include a text part or set it to \`{"foundTheBanana": false}\`.` : '');

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {parts:[imagePart, {text:generationPrompt}]},
        config:{
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        }
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0)
        throw new Error("No candidates returned from the API.");
    const contents = candidates[0].content;
    if (!contents) throw new Error("No contents returned from the API.");
    const parts = contents.parts;
    if (!parts) throw new Error("No parts returned from the API.");


    let foundTheBanana = false;
    let imageSrc: string | null = null;

    for (const part of parts) {
        if (part.text) {
        try {
            const json = JSON.parse(part.text);
            if(json.foundTheBanana) {
                foundTheBanana = true;
            }
        } catch(e) {
            // Ignore if parsing fails, it's probably not the JSON we want.
            console.log('Non-JSON text part from enhancement:', part.text);
        }
        } else if (part.inlineData) {
        const imageData = part.inlineData.data;
        imageSrc = `data:${part.inlineData.mimeType};base64,${imageData}`;
        }
    }
    
    if (!imageSrc) {
        throw new Error("API response did not include an image.");
    }
    
    return { imageSrc, foundTheBanana };
};