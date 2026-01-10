import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-2.5 text-sm",
          "transition-all duration-200",
          "placeholder:text-gray-400",
          "focus-visible:outline-none focus-visible:border-gray-900 focus-visible:ring-4 focus-visible:ring-gray-900 focus-visible:ring-opacity-10",
          "hover:border-gray-300",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50",
          "file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-gray-900",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };