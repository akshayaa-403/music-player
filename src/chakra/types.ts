/** Song-average contribution of each signal to a chakra, 0..1. */
export interface ChakraParts {
  note: number; // how much of the music sits on the chakra's note
  freq: number; // how much energy sits right at its Solfeggio frequency
  texture: number; // how much the sound resembles its associated instruments
}

export interface ChakraMap {
  source: 'preview' | 'file' | 'estimate';
  /** Human-readable description of where the data came from. */
  sourceLabel: string;
  /** Overall strength per chakra (7), scaled so the strongest chakra = 1. */
  profile: number[];
  parts: ChakraParts[];
  /**
   * Per-moment strengths aligned with song time (only for a full-song file).
   * `data[frame * 7 + chakra]`, one frame every `hop` seconds.
   */
  timeline: { hop: number; frames: number; data: Float32Array } | null;
}
