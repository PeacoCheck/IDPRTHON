export const motionTransition = Object.freeze({
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1],
});

export const pageMotion = Object.freeze({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: motionTransition,
});

export const overlayMotion = Object.freeze({
  initial: { opacity: 0, scale: 0.985, x: "-50%", y: "calc(-50% + 4px)" },
  animate: { opacity: 1, scale: 1, x: "-50%", y: "-50%" },
  exit: { opacity: 0, scale: 0.985, x: "-50%", y: "calc(-50% + 4px)" },
  transition: motionTransition,
});

export const hoverTransition = Object.freeze({
  duration: 0.16,
  ease: [0.16, 1, 0.3, 1],
});

export const autoAnimateOptions = Object.freeze({
  duration: 180,
  easing: "ease-out",
});
