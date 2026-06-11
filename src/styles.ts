/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleId } from './types';

export interface ThemeTokens {
  bodyBg: string; // Background class for direct body/container wrapper
  cardBg: string; // Background and borders for configuration panels
  textPrimary: string; // Primary content text color
  textSecondary: string; // Muted helper text
  titleText: string; // Card headers/brand texts
  inputClass: string; // Common input fields styling
  buttonPrimary: string; // Core action button triggers
  buttonSecondary: string; // Standard list elements / secondary interactive badges
  divider: string; // Border color for division stripes
  badgeAccent: string; // Brand labels class configurations
  iconAccent: string; // Highlight icons style wrapper
  accentColor: string; // Standard accent labels hex or classes
}

export const THEME_PRESETS: Record<StyleId, ThemeTokens> = {
  brutalist: {
    bodyBg: 'bg-[#e5e4de] text-stone-950',
    cardBg: 'bg-white border-2 border-stone-950 shadow-[4px_4px_0px_#000] rounded-none p-5',
    textPrimary: 'text-stone-950',
    textSecondary: 'text-stone-800 font-mono text-[11px] font-medium',
    titleText: 'text-stone-950 font-display font-black uppercase tracking-tight',
    inputClass: 'bg-white border-2 border-stone-950 text-stone-950 focus:bg-yellow-50/20 font-mono rounded-none py-1.5 px-2.5 text-xs',
    buttonPrimary: 'bg-[#3b82f6] hover:bg-[#2563eb] text-white border-2 border-stone-950 shadow-[3px_3px_0px_#000] font-black font-display rounded-none py-2 px-4',
    buttonSecondary: 'bg-[#a7f3d0] hover:bg-[#6ee7b7] border-2 border-stone-950 text-stone-950 font-mono text-[11px] font-bold rounded-none',
    divider: 'border-stone-950 border-b-2',
    badgeAccent: 'bg-[#fbcfe8] border-2 border-stone-950 text-stone-950 font-mono font-bold',
    iconAccent: 'bg-white border-2 border-stone-950 text-stone-950',
    accentColor: '#3b82f6'
  }
};
