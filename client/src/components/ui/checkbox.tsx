import * as React from "react";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ onCheckedChange, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      onChange={(e) => {
        if (onCheckedChange) onCheckedChange(e.target.checked);
        props.onChange?.(e);
      }}
      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
