import { useEffect, useRef } from "react";
import { useStdin, useStdout } from "ink";

export type MouseAction = "left" | "wheel-up" | "wheel-down";

export interface MouseEvent {
  action: MouseAction;
  column: number;
  row: number;
}

const MOUSE_SEQUENCE = /\u001B\[<(\d+);(\d+);(\d+)([Mm])/g;

/** True for mouse input after Ink has stripped its leading escape byte. */
export function isMouseInput(input: string): boolean {
  return /^\[<\d+;\d+;\d+[Mm]/.test(input);
}

export function useMouse(handler: (event: MouseEvent) => void): void {
  const { internal_eventEmitter: input } = useStdin();
  const { stdout } = useStdout();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onInput = (raw: string) => {
      MOUSE_SEQUENCE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = MOUSE_SEQUENCE.exec(raw)) !== null) {
        const code = Number.parseInt(match[1], 10);
        const column = Number.parseInt(match[2], 10);
        const row = Number.parseInt(match[3], 10);
        const suffix = match[4];

        if ((code & 64) !== 0) {
          handlerRef.current({
            action: (code & 1) === 0 ? "wheel-up" : "wheel-down",
            column,
            row,
          });
        } else if (suffix === "M" && (code & 3) === 0) {
          handlerRef.current({ action: "left", column, row });
        }
      }
    };

    // Basic tracking reports clicks and the wheel; SGR mode supplies reliable
    // coordinates beyond the legacy protocol's 223-column limit.
    stdout.write("\u001B[?1000h\u001B[?1006h");
    input.on("input", onInput);
    return () => {
      input.off("input", onInput);
      stdout.write("\u001B[?1000l\u001B[?1006l");
    };
  }, [input, stdout]);
}
