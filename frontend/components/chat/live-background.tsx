import { FluidParticlesBackground } from "@/components/ui/fluid-particles-background";

// The moving background behind the whole app: soft glowing colours plus
// fluid particles in the SYNAPSE palette. Both stop when Settings → Live
// background is off or the device asks for reduced motion.
export function LiveBackground() {
  return (
    <div className="live-bg" aria-hidden="true">
      <div className="live-bg__blob live-bg__blob--1" />
      <div className="live-bg__blob live-bg__blob--2" />
      <div className="live-bg__blob live-bg__blob--3" />
      <div className="live-bg__blob live-bg__blob--4" />
      <FluidParticlesBackground className="absolute inset-0" />
      <div className="live-bg__grain" />
    </div>
  );
}
