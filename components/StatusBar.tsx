/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';
import { AppState } from '../types';

interface StatusBarProps {
  state: AppState;
  useFixedSelectionBox: boolean;
  isInitialState: boolean;
  onUploadClick: () => void;
}

const getStatusMessage = (state: AppState, useFixedSelectionBox:boolean): string => {
  switch (state) {
    case AppState.IDLE:
      return 'SYSTEM IDLE. AWAITING INPUT.';
    case AppState.LOADING:
      return 'LOADING INITIAL ASSETS... STANDBY...';
    case AppState.LOADED:
      const selectionInstruction = useFixedSelectionBox ? 'CLICK TO SELECT AREA' : 'DRAW SELECTION';
      return `IMAGE LOADED. ${selectionInstruction} TO ENHANCE. SCROLL TO ZOOM, MIDDLE-DRAG TO PAN.`;
    case AppState.SELECTING:
        return 'DEFINING SELECTION AREA...';
    case AppState.ANALYZING:
      return 'ANALYZING IMAGE FOR OPTIMAL SETTINGS...';
    case AppState.ENHANCING:
      return 'ENHANCING IMAGE...';
    case AppState.ENHANCED:
      return 'APPLYING ENHANCEMENT...';
    case AppState.CONVERTING:
      return 'CONVERTING HEIC IMAGE TO A SUPPORTED FORMAT...';
    default:
      return '...';
  }
};

export const StatusBar: React.FC<StatusBarProps> = ({ state, useFixedSelectionBox, isInitialState, onUploadClick }) => {
  // Special UI for the initial loaded state, combining the prompt and status
  if (state === AppState.LOADED && isInitialState) {
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-green-400 font-mono tracking-widest text-sm border-t border-green-500/30 z-10 flex items-center justify-center sm:justify-between h-12 px-4">
        <p className="hidden sm:block animate-pulse">Drag & drop image, or click to enhance. Scroll to zoom.</p>
        <button
          onClick={onUploadClick}
          className="px-4 py-2 bg-green-500/20 border border-green-500/50 rounded text-green-300 hover:bg-green-500/30 transition-colors"
        >
          Upload Image
        </button>
      </div>
    );
  }

  // Fallback to original status bar for all other states
  const message = getStatusMessage(state, useFixedSelectionBox);
  const showUploadButton = ![AppState.IDLE, AppState.LOADING, AppState.CONVERTING].includes(state);

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-green-400 font-mono tracking-widest text-sm border-t border-green-500/30 z-10 flex items-center justify-between h-12 px-4">
        <p className="animate-pulse flex-grow text-center">{message}</p>
        {showUploadButton && (
            <button
              onClick={onUploadClick}
              className="ml-4 px-3 py-1 bg-green-500/20 border border-green-500/50 rounded text-green-300 hover:bg-green-500/30 transition-colors flex-shrink-0"
            >
              Upload Image
            </button>
        )}
    </div>
  );
};