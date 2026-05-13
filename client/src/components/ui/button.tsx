import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[hsl(var(--foreground))] text-[hsl(var(--background))] hover:opacity-80",
        destructive:
          "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-80",
        outline:
          "border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:bg-[var(--hover-bg)]",
        secondary:
          "bg-[var(--active-bg)] text-[hsl(var(--foreground))] hover:bg-[var(--hover-bg)]",
        ghost:
          "text-[hsl(var(--foreground))] hover:bg-[var(--hover-bg)]",
        link:
          "text-[hsl(var(--foreground))] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 rounded-lg text-sm",
        sm:      "h-8 px-3 rounded-md text-xs",
        lg:      "h-12 px-6 rounded-lg text-base",
        icon:    "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
