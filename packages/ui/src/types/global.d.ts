declare global {
  interface Window {
    Buffer?: {
      from(value: string, encoding?: string): { toString(encoding?: string): string };
    };
    __FREEBOARD_RUNTIME_EXECUTION_MODE__?: "safe" | "trusted";
  }

  interface GlobalThis {
    Buffer?: {
      from(value: string, encoding?: string): { toString(encoding?: string): string };
    };
    __FREEBOARD_RUNTIME_EXECUTION_MODE__?: "safe" | "trusted";
  }
}

export {};
