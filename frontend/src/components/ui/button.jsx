import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { motion } from "motion/react";
import { hoverTransition } from "../../lib/motion.js";
import { cn } from "../../lib/utils.js";

const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      default: "ui-button--default",
      secondary: "ui-button--secondary",
      ghost: "ui-button--ghost",
      outline: "ui-button--outline",
      danger: "ui-button--danger",
    },
    size: { default: "", sm: "ui-button--sm", icon: "ui-button--icon" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}) {
  if (asChild) {
    return (
      <Slot
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
  return (
    <motion.button
      className={cn(buttonVariants({ variant, size }), className)}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={hoverTransition}
      {...props}
    />
  );
}
