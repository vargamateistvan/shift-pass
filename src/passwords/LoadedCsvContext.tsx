import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  initialLoadedCsvState,
  LoadedCsvContext,
  type LoadedCsvContextValue,
  type LoadedCsvState,
} from "./context";

const LOADED_CSV_STORAGE_KEY = "shiftpass.loadedCsv";

function loadStoredCsv(): LoadedCsvState {
  if (typeof localStorage === "undefined") {
    return initialLoadedCsvState;
  }

  try {
    const raw = localStorage.getItem(LOADED_CSV_STORAGE_KEY);
    if (!raw) {
      return initialLoadedCsvState;
    }

    const parsed = JSON.parse(raw) as Partial<LoadedCsvState>;
    if (
      typeof parsed.fileName !== "string" ||
      typeof parsed.rawCsv !== "string" ||
      !Array.isArray(parsed.entries)
    ) {
      localStorage.removeItem(LOADED_CSV_STORAGE_KEY);
      return initialLoadedCsvState;
    }

    return {
      fileName: parsed.fileName,
      rawCsv: parsed.rawCsv,
      entries: parsed.entries,
    };
  } catch {
    localStorage.removeItem(LOADED_CSV_STORAGE_KEY);
    return initialLoadedCsvState;
  }
}

export function LoadedCsvProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<LoadedCsvState>(loadStoredCsv);

  useEffect(() => {
    if (typeof localStorage === "undefined") {
      return;
    }

    if (!state.fileName && !state.rawCsv && state.entries.length === 0) {
      localStorage.removeItem(LOADED_CSV_STORAGE_KEY);
      return;
    }

    localStorage.setItem(LOADED_CSV_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

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
