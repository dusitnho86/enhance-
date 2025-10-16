/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useEffect, useRef, MouseEvent } from 'react';
import heic2any from 'heic2any';
import { DropZone } from './components/DropZone';
import { ImageDisplay } from './components/ImageDisplay';
import { PixelDissolve } from './components/PixelDissolve';
import { StatusBar } from './components/StatusBar';
import { SelectionAnimator } from './components/SelectionAnimator';
import type { Rect, HistoryStep, ImageDescription } from './types';
import { AppState } from './types';
import { cropImage, imageToDataUrl } from './utils/imageUtils';
import { serviceEnhance } from './utils/serviceEnhance';
import { serviceDescribeImage } from './utils/serviceDescribeImage';
import { generateZoomGif } from './utils/gifGenerator';
import { LoadingSpinner } from './components/LoadingSpinner';
import { serviceAnalyzeForOptimalSettings } from './utils/serviceAnalyzeImage';

interface EnhancementJob {
  originalRect: Rect;
  canvasWithSelectionDataUrl: string;
  pixelatedSrc: string;
  screenRect: Rect;
}

const getApiErrorMessage = (error: any): string => {
    console.error("An API error occurred:", error);
    // Default message
    let message = "An unexpected error occurred. Please try again.";

    // Attempt to parse Gemini API error
    if (error?.message) {
        // Gemini API often returns error details in a JSON string within the message.
        try {
            const parsed = JSON.parse(error.message);
            if (parsed.error?.message) {
                if (parsed.error.status === 'RESOURCE_EXHAUSTED') {
                    return "API quota exceeded. Please check your plan and billing details.";
                }
                return `API Error: ${parsed.error.message}`;
            }
        } catch (e) {
            // If parsing fails, it's not the expected JSON format.
            // Fall through to use the raw error message.
        }
        // Use raw message if not a Gemini JSON error
        message = error.message;
    }
    return message;
}

const App: React.FC = () => {
  // --- FEATURE FLAG ---
  // Set to true to use a fixed-size selection box (click to select).
  // Set to false to use a draggable selection box (click and drag to select).
  const useFixedSelectionBox = false;
  const fixedSelectionSizePercentage = 0.125; // e.g., 0.25 for 25% of image dimensions. Only used if useFixedSelectionBox is true.

  const [appState, setAppState] = useState<AppState>(AppState.LOADING);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [pixelatedImageSrc, setPixelatedImageSrc] = useState<string | null>(null);
  const [enhancedImageSrc, setEnhancedImageSrc] = useState<string | null>(null);
  const [finalImageSrc, setFinalImageSrc] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryStep[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [newHistoryEntryData, setNewHistoryEntryData] = useState<{description: ImageDescription, originalRect: Rect} | null>(null);

  const [enhancementJob, setEnhancementJob] = useState<EnhancementJob | null>(null);
  const [finalEnhancementRect, setFinalEnhancementRect] = useState<Rect | null>(null);
  const [displaySelection, setDisplaySelection] = useState<Rect | null>(null);
  const [isGeneratingGif, setIsGeneratingGif] = useState<boolean>(false);
  const [showBananaBanner, setShowBananaBanner] = useState<boolean>(false);
   const [seekNanoBanana, setSeekNanoBanana] = useState<boolean>(false);
   const [sharpness, setSharpness] = useState<number>(50);
   const [denoise, setDenoise] = useState<number>(50);
   const [imagination, setImagination] = useState<number>(0);
   const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);
   const [isRegenPromptVisible, setIsRegenPromptVisible] = useState<boolean>(false);
   const [regenPrompt, setRegenPrompt] = useState<string>('');
   const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageObjectURLRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (isExportMenuOpen && exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExportMenuOpen]);

  const loadInitialImage = useCallback(async () => {
    if (imageObjectURLRef.current) {
      URL.revokeObjectURL(imageObjectURLRef.current);
      imageObjectURLRef.current = null;
    }

    setAppState(AppState.LOADING);
    try {
      const response = await fetch('https://www.gstatic.com/aistudio/starter-apps/enhance/living_room.png');
      if (!response.ok) {
        throw new Error(`Failed to fetch initial image: ${response.statusText}`);
      }
      const blob = await response.blob();
      const objectURL = URL.createObjectURL(blob);
      imageObjectURLRef.current = objectURL;

      const img = new Image();
      img.onload = () => {
        const newStep: HistoryStep = { imageSrc: objectURL, description: null, originalRect: null };
        setHistory([newStep]);
        setHistoryIndex(0);
        setImage(img);
        setFinalImageSrc(objectURL);
        setDisplaySelection(null);
        setAppState(AppState.LOADED);
      };
      img.onerror = () => {
        console.error("Image failed to load from object URL.");
        setAppState(AppState.IDLE);
        if (imageObjectURLRef.current) {
          URL.revokeObjectURL(imageObjectURLRef.current);
          imageObjectURLRef.current = null;
        }
      };
      img.src = objectURL;
    } catch (error) {
      console.error("Failed to load initial image:", error);
      setAppState(AppState.IDLE);
    }
  }, []);
  
  const resetState = useCallback(() => {
    setEnhancementJob(null);
    setFinalEnhancementRect(null);
    setHistory([]);
    setHistoryIndex(-1);
    setNewHistoryEntryData(null);
    setDisplaySelection(null);
    setShowBananaBanner(false);
    setSeekNanoBanana(false);
    setImagination(0);
    loadInitialImage();
  }, [loadInitialImage]);

  useEffect(() => {
    loadInitialImage();
    
    return () => {
      if (imageObjectURLRef.current) {
        URL.revokeObjectURL(imageObjectURLRef.current);
      }
    };
  }, [loadInitialImage]);


  const handleFileDrop = useCallback(async (file: File) => {
    setErrorMessage(null);
    if (imageObjectURLRef.current) {
      URL.revokeObjectURL(imageObjectURLRef.current);
      imageObjectURLRef.current = null;
    }
    
    let imageFile: File | Blob = file;
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
    
    if (isHeic) {
      setAppState(AppState.CONVERTING);
      try {
        const result = await heic2any({ blob: file, toType: 'image/png' });
        imageFile = Array.isArray(result) ? result[0] : result;
      } catch (e: any) {
        console.error('HEIC conversion failed', e);
        let heicMessage = 'HEIC conversion failed. This format may not be supported by your browser. Please try a different image.';
        if (e?.message) {
            heicMessage = `HEIC conversion failed: ${e.message}. Please try a different image.`;
        }
        setErrorMessage(heicMessage);
        setAppState(image ? AppState.LOADED : AppState.IDLE);
        return;
      }
    }

    if (imageFile && (imageFile as File).type?.startsWith('image/')) {
      const objectURL = URL.createObjectURL(imageFile);
      imageObjectURLRef.current = objectURL;

      const img = new Image();
      img.onload = () => {
        const newStep: HistoryStep = { imageSrc: objectURL, description: null, originalRect: null };
        setHistory([newStep]);
        setHistoryIndex(0);
        setImage(img);
        setFinalImageSrc(objectURL);
        setEnhancementJob(null);
        setFinalEnhancementRect(null);
        setDisplaySelection(null);
        setShowBananaBanner(false);
        setSeekNanoBanana(false);
        setAppState(AppState.LOADED);
      };
      img.onerror = () => {
        console.error("Image failed to load from object URL.");
        setAppState(AppState.IDLE);
        if (imageObjectURLRef.current) {
          URL.revokeObjectURL(imageObjectURLRef.current);
          imageObjectURLRef.current = null;
        }
      };
      img.src = objectURL;
    }
  }, [image]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileDrop(e.target.files[0]);
    }
    e.target.value = '';
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleSelection = useCallback(async (originalRect: Rect, screenRect: Rect, canvasWithSelectionDataUrl: string) => {
    if (!image) return;

    // If we are not at the head of history, a new selection creates a new branch.
    // We truncate the "redo" history here to ensure the new step is added correctly
    // and that runEnhancementJob gets the correct history.
    if (historyIndex < history.length - 1) {
      const newHistory = history.slice(0, historyIndex + 1);
      setHistory(newHistory);
    }

    setAppState(AppState.ENHANCING);
    
    const aspectRatio = originalRect.w / originalRect.h;
    const padding = 0.05;
    const maxWidth = window.innerWidth * (1 - padding);
    const maxHeight = window.innerHeight * (1 - padding);

    let targetWidth = maxWidth;
    let targetHeight = targetWidth / aspectRatio;

    if (targetHeight > maxHeight) {
        targetHeight = maxHeight;
        targetWidth = targetHeight * aspectRatio;
    }
    
    setFinalEnhancementRect({
        w: targetWidth,
        h: targetHeight,
        x: (window.innerWidth - targetWidth) / 2,
        y: (window.innerHeight - targetHeight) / 2,
    });

    const pixelatedSrc = await cropImage(image, originalRect, originalRect.w, originalRect.h, true);
    
    setEnhancementJob({
      originalRect,
      canvasWithSelectionDataUrl,
      pixelatedSrc,
      screenRect,
    });

  }, [image, history, historyIndex]);

  const runEnhancementJob = useCallback(async () => {
    if (!enhancementJob || !image) return;
    
    const { originalRect, canvasWithSelectionDataUrl, pixelatedSrc } = enhancementJob;

    try {
        const descriptionHistory = history.slice(0, historyIndex + 1).map(h => h.description).filter((d): d is ImageDescription => d !== null);
        const description = await serviceDescribeImage(canvasWithSelectionDataUrl, descriptionHistory);
        
        setNewHistoryEntryData({ description, originalRect });

        // Calculate padded rect for enhancement context
        const sourceImageWidth = image.naturalWidth;
        const sourceImageHeight = image.naturalHeight;
        const padding = 0.5; // 50% padding

        const paddedX = originalRect.x - originalRect.w * padding;
        const paddedY = originalRect.y - originalRect.h * padding;
        const paddedW = originalRect.w * (1 + 2 * padding);
        const paddedH = originalRect.h * (1 + 2 * padding);

        const finalPaddedX = Math.max(0, paddedX);
        const finalPaddedY = Math.max(0, paddedY);
        const finalPaddedX2 = Math.min(sourceImageWidth, paddedX + paddedW);
        const finalPaddedY2 = Math.min(sourceImageHeight, paddedY + paddedH);

        const paddedRect = {
            x: finalPaddedX,
            y: finalPaddedY,
            w: finalPaddedX2 - finalPaddedX,
            h: finalPaddedY2 - finalPaddedY,
        };
        
        // Crop with padding for enhancement
        const aspect = paddedRect.h / paddedRect.w;
        const targetWidth = 1024;
        const targetHeight = Math.round(targetWidth * aspect);
        const croppedForEnhancement = await cropImage(image, paddedRect, targetWidth, targetHeight, false);

        const { imageSrc: enhancedPaddedSrc, foundTheBanana } = await serviceEnhance(croppedForEnhancement, [...descriptionHistory.map(d=>d.prompt), description.prompt], seekNanoBanana, sharpness, denoise, imagination);
        
        if (foundTheBanana) {
            setShowBananaBanner(true);
        }

        // Load the enhanced padded image to perform the final crop
        const enhancedPaddedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = enhancedPaddedSrc;
        });

        // Calculate the crop area within the enhanced padded image that corresponds to the original selection
        const finalCropRect = {
            x: enhancedPaddedImage.naturalWidth * ((originalRect.x - paddedRect.x) / paddedRect.w),
            y: enhancedPaddedImage.naturalHeight * ((originalRect.y - paddedRect.y) / paddedRect.h),
            w: enhancedPaddedImage.naturalWidth * (originalRect.w / paddedRect.w),
            h: enhancedPaddedImage.naturalHeight * (originalRect.h / paddedRect.h),
        };

        // Perform the final crop to the original selection aspect ratio at a higher resolution
        const finalImageWidth = 1024;
        const finalImageHeight = Math.round(finalImageWidth * (originalRect.h / originalRect.w));
        
        const enhancedSrc = await cropImage(enhancedPaddedImage, finalCropRect, finalImageWidth, finalImageHeight, false);

        setPixelatedImageSrc(pixelatedSrc);
        setEnhancedImageSrc(enhancedSrc);
        setAppState(AppState.ENHANCED);

    } catch (error: any) {
        setErrorMessage(getApiErrorMessage(error));
        setAppState(AppState.LOADED);
        setFinalEnhancementRect(null);
    } finally {
        setEnhancementJob(null);
    }
  }, [enhancementJob, image, history, historyIndex, seekNanoBanana, sharpness, denoise, imagination]);
  
  const handleEnhancementComplete = useCallback(() => {
    if (enhancedImageSrc && newHistoryEntryData) {
        const newStep: HistoryStep = {
            imageSrc: enhancedImageSrc,
            description: newHistoryEntryData.description,
            originalRect: newHistoryEntryData.originalRect,
        };

        const newHistory = history.slice(0, historyIndex + 1);
        setHistory([...newHistory, newStep]);
        setHistoryIndex(newHistory.length);

        const newImage = new Image();
        newImage.onload = () => {
            setImage(newImage);
            setFinalImageSrc(enhancedImageSrc);
            //setPixelatedImageSrc(null);
            setEnhancedImageSrc(null);
            setFinalEnhancementRect(null);
            setNewHistoryEntryData(null);
            setDisplaySelection(null);
            setAppState(AppState.LOADED);
        }
        newImage.src = enhancedImageSrc;
    }
  }, [enhancedImageSrc, newHistoryEntryData, history, historyIndex]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileDrop(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0 || appState === AppState.ENHANCING || isGeneratingGif) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    
    const nextStep = history[newIndex + 1];
    setDisplaySelection(nextStep?.originalRect || null);

    const newImageSrc = history[newIndex].imageSrc;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setFinalImageSrc(newImageSrc);
    };
    img.src = newImageSrc;
  }, [history, historyIndex, appState, isGeneratingGif]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1 || appState === AppState.ENHANCING || isGeneratingGif) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);

    const nextStep = history[newIndex + 1];
    setDisplaySelection(nextStep?.originalRect || null);

    const newImageSrc = history[newIndex].imageSrc;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setFinalImageSrc(newImageSrc);
    };
    img.src = newImageSrc;
  }, [history, historyIndex, appState, isGeneratingGif]);

  const handleRegenerateClick = useCallback(() => {
    if (historyIndex <= 0 || appState === AppState.ENHANCING || isGeneratingGif) return;
  
    const currentPrompt = history[historyIndex]?.description?.prompt || '';
    setRegenPrompt(currentPrompt);
    setIsRegenPromptVisible(true);
  }, [history, historyIndex, appState, isGeneratingGif]);
  
  const handleRegenWithPrompt = useCallback(async () => {
      if (historyIndex <= 0 || appState === AppState.ENHANCING || isGeneratingGif) return;
  
      setIsRegenPromptVisible(false);
      setAppState(AppState.ENHANCING);
      
      const previousStep = history[historyIndex - 1];
      const currentStep = history[historyIndex];
      const originalRect = currentStep.originalRect;
  
      if (!originalRect) {
          setAppState(AppState.LOADED);
          return;
      }
  
      const sourceImage = new Image();
      sourceImage.crossOrigin = "anonymous";
      sourceImage.onload = async () => {
        try {
          const descriptionHistory = history.slice(0, historyIndex).map(h => h.description).filter((d): d is ImageDescription => d !== null);
          
          const description: ImageDescription = {
            selectionDescription: currentStep.description?.selectionDescription || 'User-provided prompt for regeneration.',
            prompt: regenPrompt,
          };
          
          const sourceImageWidth = sourceImage.naturalWidth;
          const sourceImageHeight = sourceImage.naturalHeight;
          const padding = 0.5;
  
          const paddedX = originalRect.x - originalRect.w * padding;
          const paddedY = originalRect.y - originalRect.h * padding;
          const paddedW = originalRect.w * (1 + 2 * padding);
          const paddedH = originalRect.h * (1 + 2 * padding);
  
          const finalPaddedX = Math.max(0, paddedX);
          const finalPaddedY = Math.max(0, paddedY);
          const finalPaddedX2 = Math.min(sourceImageWidth, paddedX + paddedW);
          const finalPaddedY2 = Math.min(sourceImageHeight, paddedY + paddedH);
  
          const paddedRect = {
              x: finalPaddedX,
              y: finalPaddedY,
              w: finalPaddedX2 - finalPaddedX,
              h: finalPaddedY2 - finalPaddedY,
          };
  
          const aspect = paddedRect.h / paddedRect.w;
          const targetWidth = 1024;
          const targetHeight = Math.round(targetWidth * aspect);
          const croppedForEnhancement = await cropImage(sourceImage, paddedRect, targetWidth, targetHeight, false);
          
          const { imageSrc: enhancedPaddedSrc, foundTheBanana } = await serviceEnhance(croppedForEnhancement, [...descriptionHistory.map(d=>d.prompt || ''), description.prompt || ''], seekNanoBanana, sharpness, denoise, imagination);
  
          if (foundTheBanana) {
              setShowBananaBanner(true);
          }
  
          const enhancedPaddedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = enhancedPaddedSrc;
          });
  
          const finalCropRect = {
              x: enhancedPaddedImage.naturalWidth * ((originalRect.x - paddedRect.x) / paddedRect.w),
              y: enhancedPaddedImage.naturalHeight * ((originalRect.y - paddedRect.y) / paddedRect.h),
              w: enhancedPaddedImage.naturalWidth * (originalRect.w / paddedRect.w),
              h: enhancedPaddedImage.naturalHeight * (originalRect.h / paddedRect.h),
          };
  
          const finalImageWidth = 1024;
          const finalImageHeight = Math.round(finalImageWidth * (originalRect.h / originalRect.w));
          
          const enhancedSrc = await cropImage(enhancedPaddedImage, finalCropRect, finalImageWidth, finalImageHeight, false);
  
          const newStep: HistoryStep = {
              imageSrc: enhancedSrc,
              description,
              originalRect,
          };
  
          const newHistory = [...history.slice(0, historyIndex), newStep];
          setHistory(newHistory);
          setDisplaySelection(null);
  
          const newImage = new Image();
          newImage.onload = () => {
              setImage(newImage);
              setFinalImageSrc(enhancedSrc);
              setAppState(AppState.LOADED);
          };
          newImage.src = enhancedSrc;
  
        } catch (error: any) {
          setErrorMessage(getApiErrorMessage(error));
          setAppState(AppState.LOADED);
        }
      };
      sourceImage.src = previousStep.imageSrc;
  }, [history, historyIndex, appState, isGeneratingGif, seekNanoBanana, sharpness, denoise, regenPrompt, imagination]);

  const runFullImageEnhancement = useCallback(async (newSharpness: number, newDenoise: number, newImagination: number) => {
    if (!image) {
        setAppState(AppState.LOADED);
        return;
    }

    setAppState(AppState.ENHANCING);

    try {
        const fullImageDataUrl = await imageToDataUrl(image);
        const originalRect: Rect = { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
        
        const descriptionHistory = history.slice(0, historyIndex + 1).map(h => h.description).filter((d): d is ImageDescription => d !== null);
        const description = await serviceDescribeImage(fullImageDataUrl, descriptionHistory, true);

        const { imageSrc: enhancedSrc, foundTheBanana } = await serviceEnhance(fullImageDataUrl, [...descriptionHistory.map(d=>d.prompt), description.prompt], seekNanoBanana, newSharpness, newDenoise, newImagination);
        
        if (foundTheBanana) {
            setShowBananaBanner(true);
        }

        const newStep: HistoryStep = {
            imageSrc: enhancedSrc,
            description: description,
            originalRect: originalRect,
        };

        const newHistory = [...history.slice(0, historyIndex + 1), newStep];
        setHistory(newHistory);
        setHistoryIndex(newHistory.length);

        const newImage = new Image();
        newImage.onload = () => {
            setImage(newImage);
            setFinalImageSrc(enhancedSrc);
            setDisplaySelection(null);
            setAppState(AppState.LOADED);
        };
        newImage.src = enhancedSrc;

    } catch (error: any) {
        setErrorMessage(getApiErrorMessage(error));
        setAppState(AppState.LOADED);
    }
  }, [image, history, historyIndex, seekNanoBanana]);

  const handleAutoEnhance = useCallback(async () => {
    if (!image || (appState !== AppState.LOADED && appState !== AppState.IDLE)) return;

    setAppState(AppState.ANALYZING);

    try {
        const imageDataUrl = await imageToDataUrl(image);
        const settings = await serviceAnalyzeForOptimalSettings(imageDataUrl);

        setSharpness(settings.sharpness);
        setDenoise(settings.denoise);
        setImagination(settings.imagination);

        await runFullImageEnhancement(settings.sharpness, settings.denoise, settings.imagination);

    } catch (error: any) {
        setErrorMessage(getApiErrorMessage(error));
        setAppState(AppState.LOADED);
    }

  }, [image, appState, runFullImageEnhancement]);
  
  const handleExportPng = useCallback(() => {
    if (!finalImageSrc) return;
    const a = document.createElement('a');
    a.href = finalImageSrc;
    a.download = 'enhancement.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setIsExportMenuOpen(false);
  }, [finalImageSrc]);

  const handleExportJpg = useCallback(() => {
    if (!finalImageSrc) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.9); // 0.9 quality
      const a = document.createElement('a');
      a.href = jpgDataUrl;
      a.download = 'enhancement.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setIsExportMenuOpen(false);
    };
    img.src = finalImageSrc;
  }, [finalImageSrc]);

  const handleExportGif = useCallback(async () => {
    if (historyIndex < 1) return;
    setIsGeneratingGif(true);
    try {
      const blob = await generateZoomGif(history.slice(0, historyIndex + 1));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'enhancement-zoom.gif';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to generate GIF:", error);
    } finally {
      setIsGeneratingGif(false);
      setIsExportMenuOpen(false);
    }
  }, [history, historyIndex]);


  const stopPropagation = (ev:MouseEvent<HTMLButtonElement | HTMLInputElement | HTMLDivElement>) => {
    ev.stopPropagation();
  }

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-black flex flex-col items-center justify-center p-4"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {errorMessage && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-center p-2 z-30 font-bold text-lg flex items-center justify-center shadow-lg">
          <span>{errorMessage}</span>
          <button 
            onClick={() => setErrorMessage(null)} 
            className="absolute right-4 text-white hover:text-gray-200 text-2xl font-bold leading-none"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
      {showBananaBanner && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-400 text-black text-center p-2 z-20 font-bold text-lg animate-pulse flex items-center justify-center">
          <span>🍌 YOU FOUND THE NANO BANANA! 🍌</span>
          <button 
            onClick={() => setShowBananaBanner(false)} 
            className="absolute right-4 text-black hover:text-gray-700 text-2xl font-bold leading-none"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
      {appState === AppState.IDLE && <DropZone />}
      
      <div className="w-full h-full flex items-center justify-center relative">
        {finalImageSrc && appState !== AppState.ENHANCED && (
          <ImageDisplay
            imageSrc={finalImageSrc}
            onSelect={handleSelection}
            isEnhancing={appState === AppState.ENHANCING || appState === AppState.ANALYZING || isGeneratingGif}
            historicalSelection={displaySelection}
            useFixedSelectionBox={useFixedSelectionBox}
            fixedSelectionSizePercentage={fixedSelectionSizePercentage}
          />
        )}
      </div>

      {(appState === AppState.ENHANCING || appState === AppState.CONVERTING || appState === AppState.ANALYZING) && <LoadingSpinner appState={appState} />}

      {enhancementJob && appState === AppState.ENHANCING && finalEnhancementRect && (
          <SelectionAnimator
              rect={enhancementJob.screenRect}
              finalRect={finalEnhancementRect}
              src={enhancementJob.pixelatedSrc}
              onComplete={runEnhancementJob}
          />
      )}

      {appState === AppState.ENHANCED && pixelatedImageSrc && enhancedImageSrc && finalEnhancementRect && (
        <div 
          className="absolute"
          style={{
            top: `${finalEnhancementRect.y}px`,
            left: `${finalEnhancementRect.x}px`,
            width: `${finalEnhancementRect.w}px`,
            height: `${finalEnhancementRect.h}px`,
          }}
        >
          <PixelDissolve
            lowResSrc={pixelatedImageSrc}
            highResSrc={enhancedImageSrc}
            onComplete={handleEnhancementComplete}
          />
        </div>
      )}

      {appState === AppState.LOADED && history.length >= 1 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 w-max">
          <div className="flex items-center gap-4 bg-black/50 p-2 rounded-md border border-green-500/60">
            <div className="flex items-center gap-2">
              <label htmlFor="sharpness" className="text-xs">Sharpness</label>
              <input
                id="sharpness"
                type="range"
                min="0"
                max="100"
                value={sharpness}
                onChange={(e) => setSharpness(Number(e.target.value))}
                onMouseDownCapture={stopPropagation}
                className="w-24"
                disabled={isGeneratingGif}
              />
              <span className="text-xs w-8 text-right">{sharpness}</span>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="denoise" className="text-xs">Denoise</label>
              <input
                id="denoise"
                type="range"
                min="0"
                max="100"
                value={denoise}
                onChange={(e) => setDenoise(Number(e.target.value))}
                onMouseDownCapture={stopPropagation}
                className="w-24"
                disabled={isGeneratingGif}
              />
              <span className="text-xs w-8 text-right">{denoise}</span>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="imagination" className="text-xs">Imagination</label>
              <input
                id="imagination"
                type="range"
                min="0"
                max="100"
                value={imagination}
                onChange={(e) => setImagination(Number(e.target.value))}
                onMouseDownCapture={stopPropagation}
                className="w-24"
                disabled={isGeneratingGif}
              />
              <span className="text-xs w-8 text-right">{imagination}</span>
            </div>
            <div className="flex items-center gap-2 pl-2 border-l border-green-500/30">
                <input
                    id="seek-banana"
                    type="checkbox"
                    checked={seekNanoBanana}
                    onChange={(e) => setSeekNanoBanana(e.target.checked)}
                    onMouseDownCapture={stopPropagation}
                    disabled={isGeneratingGif}
                    className="w-4 h-4 text-green-500 bg-gray-800 border-green-500/60 rounded focus:ring-green-500 focus:ring-offset-gray-900 focus:ring-2 cursor-pointer"
                />
                <label htmlFor="seek-banana" className="text-xs cursor-pointer select-none">Seek Nano Banana 🍌</label>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-black/50 p-2 rounded-md border border-green-500/60">
            <button 
              onClick={handleUndo}
              onMouseDownCapture={stopPropagation}
              disabled={historyIndex <= 0 || isGeneratingGif} 
              className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors" aria-label="Undo"
            >
              &lt;
            </button>
            <span className="text-xs w-24 text-center">Step: {historyIndex + 1} / {history.length}</span>
            <button 
              onClick={handleRedo} 
              onMouseDownCapture={stopPropagation}
              disabled={historyIndex >= history.length - 1 || isGeneratingGif} 
              className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors" aria-label="Redo"
            >
              &gt;
            </button>
            <button
              onClick={handleAutoEnhance}
              onMouseDownCapture={stopPropagation}
              disabled={isGeneratingGif}
              className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors"
            >
              Auto-Enhance
            </button>
            <button 
              onClick={handleRegenerateClick} 
              onMouseDownCapture={stopPropagation}
              disabled={historyIndex <= 0 || isGeneratingGif} 
              className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors"
            >
              Re-gen
            </button>
            <div className="relative" ref={exportMenuRef} onMouseDownCapture={stopPropagation}>
              <button 
                  onClick={() => setIsExportMenuOpen(prev => !prev)}
                  disabled={isGeneratingGif} 
                  className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors"
              >
                  {isGeneratingGif ? 'Generating...' : 'Export'}
              </button>
              {isExportMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-2 bg-black/80 border border-green-500/60 rounded-md py-1 w-28">
                      <ul>
                          <li>
                              <button 
                                  onClick={handleExportPng}
                                  className="w-full text-left px-3 py-1 text-green-400 hover:bg-green-500/20 transition-colors"
                              >
                                  as PNG
                              </button>
                          </li>
                          <li>
                              <button 
                                  onClick={handleExportJpg}
                                  className="w-full text-left px-3 py-1 text-green-400 hover:bg-green-500/20 transition-colors"
                              >
                                  as JPG
                              </button>
                          </li>
                          <li>
                              <button 
                                  onClick={handleExportGif} 
                                  disabled={historyIndex < 1 || isGeneratingGif} 
                                  className="w-full text-left px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 transition-colors"
                              >
                                  as GIF
                              </button>
                          </li>
                      </ul>
                  </div>
              )}
            </div>
            <button 
              onClick={resetState}
              onMouseDownCapture={stopPropagation}
              className="px-3 py-1 text-green-400 hover:enabled:bg-green-500/20 rounded transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {isRegenPromptVisible && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-30" onClick={() => setIsRegenPromptVisible(false)}>
          <div className="bg-black border border-green-500/60 rounded-lg p-6 w-full max-w-lg" onClick={stopPropagation}>
            <h3 className="text-lg font-bold mb-4 text-green-400">Modify Enhancement Prompt</h3>
            <textarea
              className="w-full h-32 bg-gray-900 border border-green-500/40 rounded p-2 text-green-300 focus:outline-none focus:ring-2 focus:ring-green-500"
              value={regenPrompt}
              onChange={(e) => setRegenPrompt(e.target.value)}
            />
            <div className="flex justify-end gap-4 mt-4">
              <button
                onClick={() => setIsRegenPromptVisible(false)}
                className="px-4 py-2 text-green-400 hover:bg-green-500/20 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenWithPrompt}
                className="px-4 py-2 bg-green-500/20 text-green-300 hover:bg-green-500/30 rounded transition-colors border border-green-500/50"
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        accept="image/*,.heic,.heif"
      />
      <StatusBar 
        state={appState} 
        useFixedSelectionBox={useFixedSelectionBox}
        isInitialState={history.length <= 1}
        onUploadClick={handleUploadClick}
      />
    </div>
  );
};

export default App;