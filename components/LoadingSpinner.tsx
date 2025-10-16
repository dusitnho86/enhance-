/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { AppState } from '../types';

interface LoadingSpinnerProps {
  appState: AppState;
}

const getMessage = (state: AppState) => {
  switch(state) {
    case AppState.CONVERTING:
      return 'CONVERTING...';
    case AppState.ANALYZING:
      return 'ANALYZING...';
    case AppState.ENHANCING:
      return 'ENHANCING...';
    default:
      return 'LOADING...';
  }
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({appState}) => {
  return (
    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-40">
      <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="mt-4 text-green-400 font-mono tracking-widest animate-pulse">{getMessage(appState)}</p>
    </div>
  );
};