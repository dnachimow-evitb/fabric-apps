import { useContext, useEffect, useState } from 'react';

import { ThemeContext } from '@/hooks/theme.context';

export interface ChartColors {
  series1: string;
  series2: string;
  /** Low end of the sequential blue scale (lighter in light mode, darker in dark mode). */
  series1Light: string;
  muted: string;
  border: string;
}

function read(): ChartColors {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    series1: v('--color-series-1', '#1c6fb8'),
    series2: v('--color-series-2', '#d9480f'),
    series1Light: v('--color-series-1-light', '#9ec5f4'),
    muted: v('--color-muted-foreground', '#5b6067'),
    border: v('--color-border', '#dcd9d3'),
  };
}

/**
 * Vega renders SVG and cannot resolve CSS variables, so series colours are read from the theme
 * tokens and re-read whenever light/dark changes.
 */
export function useChartColors(): ChartColors {
  const { isDark } = useContext(ThemeContext);
  const [colors, setColors] = useState(read);
  useEffect(() => {
    // Child effects run before the parent's effect that toggles the .dark class; read on the next frame.
    const id = requestAnimationFrame(() => setColors(read()));
    return () => cancelAnimationFrame(id);
  }, [isDark]);
  return colors;
}

export const TYPE_DOMAIN = ['Wholesale', 'Direct'] as const;
