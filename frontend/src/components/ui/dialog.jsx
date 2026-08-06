import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { overlayMotion } from "../../lib/motion.js";
import { cn } from "../../lib/utils.js";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({ children, className, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-dialog__overlay" />
      <DialogPrimitive.Content asChild {...props}>
        <motion.section
          {...overlayMotion}
          className={cn("ui-dialog__content", className)}
        >
          {children}
          <DialogPrimitive.Close
            className="ui-dialog__close"
            aria-label="Закрыть"
          >
            <X size={18} />
          </DialogPrimitive.Close>
        </motion.section>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
