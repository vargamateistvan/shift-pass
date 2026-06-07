import { useContext } from "react";
import { LoadedCsvContext } from "./context";

export function useLoadedCsv() {
  const context = useContext(LoadedCsvContext);
  if (!context) {
    throw new Error("useLoadedCsv must be used within LoadedCsvProvider");
  }
  return context;
}
