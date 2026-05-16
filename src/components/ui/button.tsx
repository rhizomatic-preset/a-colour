import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = Omit<ComponentPropsWithoutRef<typeof BaseButton>, "className"> & {
  className?: string;
};

export function Button({ className, ...props }: ButtonProps) {
  return (
    <BaseButton
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
