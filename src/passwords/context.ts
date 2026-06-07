import { createContext } from "react";

export interface GooglePasswordEntry {
  name: string;
  url: string;
  username: string;
  password: string;
  note: string;
}

export interface LoadedCsvState {
  fileName: string;
  rawCsv: string;
  entries: GooglePasswordEntry[];
}

export interface LoadedCsvContextValue extends LoadedCsvState {
  setLoadedCsv: (next: LoadedCsvState) => void;
  clearLoadedCsv: () => void;
}

export const initialLoadedCsvState: LoadedCsvState = {
  fileName: "",
  rawCsv: "",
  entries: [],
};

export const LoadedCsvContext = createContext<LoadedCsvContextValue | null>(
  null,
);
