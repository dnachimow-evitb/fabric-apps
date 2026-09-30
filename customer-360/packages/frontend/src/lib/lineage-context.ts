import { createContext, useContext } from 'react';

import type { VisualId } from './visual-lineage';

/** Opens the Data lineage panel on one visual. Provided by the Portfolio page; null elsewhere. */
export const LineageContext = createContext<((id: VisualId) => void) | null>(null);

export const useShowLineage = () => useContext(LineageContext);
