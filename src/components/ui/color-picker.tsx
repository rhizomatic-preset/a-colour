import { Popover } from "@base-ui/react/popover";
import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
}

export function ColorPicker({ color, onChange, className }: ColorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={cn("main-swatch relative overflow-hidden", className)}
        style={{ backgroundColor: color }}
        aria-label={`Pick a colour. Current colour is ${color}.`}
      />

      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="center"
          sideOffset={-170} // Half of the ~340px swatch height
        >
          <Popover.Popup
            className="z-50 bg-[var(--paper)] border border-[var(--ghost)] flex flex-col items-center focus:outline-none relative shadow-md"
            style={{
              padding: "16px",
              transform: "translateY(-50%)", // Shift up by half its own height to achieve true vertical center
            }}
          >
            <style>
              {`
                .react-colorful {
                  width: 196px !important;
                  height: 224px !important;
                  border: none !important;
                }
                .react-colorful__saturation {
                   border: 1px solid var(--ghost) !important;
                   border-radius: 0 !important;
                }
                .react-colorful__hue {
                  height: 20px !important;
                  border-radius: 0 !important;
                  margin-top: 12px;
                  border: 1px solid var(--ghost) !important;
                }
                .react-colorful__pointer {
                  width: 16px !important;
                  height: 16px !important;
                  border: 2px solid white !important;
                  box-shadow: 0 0 0 1px var(--ink) !important;
                }
              `}
            </style>

            <HexColorPicker color={color} onChange={onChange} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
