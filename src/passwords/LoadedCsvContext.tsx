import { useMemo, useState, type ReactNode } from "react";
import {
  initialLoadedCsvState,
  LoadedCsvContext,
  type LoadedCsvContextValue,
  type LoadedCsvState,
} from "./context";

export function LoadedCsvProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadedCsvState>(initialLoadedCsvState);

  const value = useMemo<LoadedCsvContextValue>(
    () => ({
      ...state,
      setLoadedCsv: (next) => setState(next),
      clearLoadedCsv: () => setState(initialLoadedCsvState),
    }),
    [state],
  );

  return (
    <LoadedCsvContext.Provider value={value}>
      {children}
    </LoadedCsvContext.Provider>
  );
}
