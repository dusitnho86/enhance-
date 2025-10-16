/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Rect } from '../types';

interface ImageDisplayProps {
  imageSrc: string;
  onSelect: (originalRect: Rect, screenRect: Rect, canvasDataUrl: string) => void;
  isEnhancing: boolean;
  historicalSelection?: Rect | null;
  useFixedSelectionBox: boolean;
  fixedSelectionSizePercentage: number;
}

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ imageSrc, onSelect, isEnhancing, historicalSelection, useFixedSelectionBox, fixedSelectionSizePercentage }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Load image from src
  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      setImage(img);
      setTransform({ x: 0, y: 0, scale: 1 }); // Reset view on new image
    };
  }, [imageSrc]);

  // Add effect to handle Escape key for cancelling selection
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
        // If the user is dragging to select (startPoint is set) and presses Escape
        if (startPoint && event.key === 'Escape') {
            event.preventDefault(); // Prevent any other default browser behavior for Escape
            setStartPoint(null);
            setSelection(null);
        }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [startPoint]); // Dependency on startPoint ensures the listener has the latest state

  const getCanvasScale = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return { scale: 1, offsetX: 0, offsetY: 0, dWidth: 0, dHeight: 0 };
    
    const { width: canvasWidth, height: canvasHeight } = canvas.getBoundingClientRect();

    const canvasAspect = canvasWidth / canvasHeight;
    const imageAspect = image.naturalWidth / image.naturalHeight;
    
    let dWidth, dHeight, offsetX, offsetY;

    if (canvasAspect > imageAspect) {
      dHeight = canvasHeight;
      dWidth = dHeight * imageAspect;
    } else {
      dWidth = canvasWidth;
      dHeight = dWidth / imageAspect;
    }
    
    offsetX = (canvasWidth - dWidth) / 2;
    offsetY = (canvasHeight - dHeight) / 2;
    const scale = dWidth / image.naturalWidth;
    
    return { scale, offsetX, offsetY, dWidth, dHeight };
  }, [image]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !image) return;
    
    const dpr = window.devicePixelRatio || 1;
    // The context is scaled, so we clear using CSS dimensions
    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);
    
    const { scale, offsetX, offsetY, dWidth, dHeight } = getCanvasScale();
    
    ctx.drawImage(image, offsetX, offsetY, dWidth, dHeight);

    if (selection) {
      ctx.strokeStyle = '#39FF14'; // Neon green
      ctx.lineWidth = 2 / transform.scale;
      ctx.setLineDash([5 / transform.scale, 5 / transform.scale]);
      ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
      ctx.setLineDash([]);
      
      // Draw labels
      ctx.font = `${10 / transform.scale}px "Fira Code", monospace`;
      const info = `x:${Math.round(selection.x)} y:${Math.round(selection.y)} w:${Math.round(selection.w)} h:${Math.round(selection.h)}`;
      const textMetrics = ctx.measureText(info);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(selection.x -1 / transform.scale, selection.y - 14 / transform.scale, textMetrics.width + 4 / transform.scale, 12 / transform.scale);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(info, selection.x + 1 / transform.scale, selection.y - 4 / transform.scale);
    } else if (historicalSelection) {
      const screenRect = {
          x: historicalSelection.x * scale + offsetX,
          y: historicalSelection.y * scale + offsetY,
          w: historicalSelection.w * scale,
          h: historicalSelection.h * scale,
      };

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2 / transform.scale;
      ctx.strokeRect(screenRect.x, screenRect.y, screenRect.w, screenRect.h);
      
      ctx.font = `${10 / transform.scale}px "Fira Code", monospace`;
      const info = `PREV. CROP`;
      const textMetrics = ctx.measureText(info);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(screenRect.x - 1 / transform.scale, screenRect.y - 14 / transform.scale, textMetrics.width + 4 / transform.scale, 12 / transform.scale);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText(info, screenRect.x + 1 / transform.scale, screenRect.y - 4 / transform.scale);
    }
    
    ctx.restore();

  }, [image, selection, getCanvasScale, historicalSelection, transform]);

  // Resize and draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const { width, height } = parent.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.scale(dpr, dpr);
        }
        
        draw();
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [draw, image]);

  const getTransformedMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const transformedX = (canvasX - transform.x) / transform.scale;
    const transformedY = (canvasY - transform.y) / transform.scale;

    return { x: transformedX, y: transformedY };
  }, [transform]);
  
  const handleMouseUpSelection = useCallback(() => {
    if (useFixedSelectionBox) return;

    if (!selection || !image || selection.w < 10 || selection.h < 10 || isEnhancing) {
      setStartPoint(null);
      setSelection(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const { scale, offsetX, offsetY } = getCanvasScale();
    const originalRect: Rect = {
        x: (selection.x - offsetX) / scale,
        y: (selection.y - offsetY) / scale,
        w: selection.w / scale,
        h: selection.h / scale
    };
    
    const canvasDataUrl = canvas.toDataURL('image/png');
    onSelect(originalRect, selection, canvasDataUrl);

    setStartPoint(null);
    setSelection(null);
  }, [selection, image, isEnhancing, useFixedSelectionBox, getCanvasScale, onSelect]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isEnhancing) return;

    if (e.button === 1) { // Middle mouse button for panning
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        return;
    }
    
    const pos = getTransformedMousePos(e);

    if (useFixedSelectionBox) {
        if (!image) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const { scale, offsetX, offsetY, dWidth, dHeight } = getCanvasScale();

        if (pos.x < offsetX || pos.x > offsetX + dWidth || pos.y < offsetY || pos.y > offsetY + dHeight) {
            return;
        }
        
        const originalClickX = (pos.x - offsetX) / scale;
        const originalClickY = (pos.y - offsetY) / scale;
        
        const boxWidth = image.naturalWidth * fixedSelectionSizePercentage;
        const boxHeight = image.naturalHeight * fixedSelectionSizePercentage;
        
        let originalX = originalClickX - boxWidth / 2;
        let originalY = originalClickY - boxHeight / 2;
        
        if (originalX < 0) originalX = 0;
        if (originalY < 0) originalY = 0;
        if (originalX + boxWidth > image.naturalWidth) originalX = image.naturalWidth - boxWidth;
        if (originalY + boxHeight > image.naturalHeight) originalY = image.naturalHeight - boxHeight;
        
        const originalRect: Rect = { x: originalX, y: originalY, w: boxWidth, h: boxHeight };
        
        const screenRect: Rect = {
            x: originalRect.x * scale + offsetX,
            y: originalRect.y * scale + offsetY,
            w: originalRect.w * scale,
            h: originalRect.h * scale,
        };
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(canvas,0,0);
        
        ctx.save();
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.scale, transform.scale);
        ctx.strokeStyle = '#39FF14';
        ctx.lineWidth = 2 / transform.scale;
        ctx.setLineDash([5 / transform.scale, 5 / transform.scale]);
        ctx.strokeRect(screenRect.x, screenRect.y, screenRect.w, screenRect.h);
        ctx.restore();
        
        const canvasDataUrl = tempCanvas.toDataURL('image/png');
        
        onSelect(originalRect, screenRect, canvasDataUrl);

    } else {
        setStartPoint(pos);
        setSelection({ ...pos, w: 0, h: 0 });
    }
  }, [isEnhancing, getTransformedMousePos, useFixedSelectionBox, image, getCanvasScale, fixedSelectionSizePercentage, onSelect, transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
        e.preventDefault();
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        setTransform(prev => ({
            ...prev,
            x: prev.x + dx,
            y: prev.y + dy
        }));
        setPanStart({ x: e.clientX, y: e.clientY });
        return;
    }

    if (useFixedSelectionBox || !startPoint || isEnhancing) return;
    const pos = getTransformedMousePos(e);
    const x = Math.min(pos.x, startPoint.x);
    const y = Math.min(pos.y, startPoint.y);
    const w = Math.abs(pos.x - startPoint.x);
    const h = Math.abs(pos.y - startPoint.y);
    setSelection({ x, y, w, h });
  }, [isPanning, panStart, useFixedSelectionBox, startPoint, isEnhancing, getTransformedMousePos]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
        setIsPanning(false);
        return;
    }
    handleMouseUpSelection();
  }, [isPanning, handleMouseUpSelection]);

  const handleMouseLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (startPoint) {
      handleMouseUpSelection();
    }
  }, [isPanning, startPoint, handleMouseUpSelection]);
  
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (isEnhancing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = 1.1;
    const newScale = e.deltaY < 0 ? transform.scale * zoomFactor : transform.scale / zoomFactor;
    const clampedScale = clamp(newScale, 0.25, 20);

    const newX = mouseX - (mouseX - transform.x) * (clampedScale / transform.scale);
    const newY = mouseY - (mouseY - transform.y) * (clampedScale / transform.scale);

    setTransform({
        x: newX,
        y: newY,
        scale: clampedScale,
    });
  }, [isEnhancing, transform]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      className={`max-w-full max-h-full w-full h-full transition-[filter] duration-700 ${isEnhancing ? 'filter brightness-50 cursor-wait' : 'filter brightness-100 ' + (isPanning ? 'cursor-grabbing' : useFixedSelectionBox ? 'cursor-zoom-in' : 'cursor-crosshair')}`}
    />
  );
};