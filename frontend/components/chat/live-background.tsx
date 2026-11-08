// The moving, softly glowing background behind the whole app ("liquid glass").
// Pure CSS animation (GPU transforms only); it stops when Settings → Live
// background is off or the device asks for reduced motion.
export function LiveBackground() {
  return (
    <div className="live-bg" aria-hidden="true">
      <div className="live-bg__blob live-bg__blob--1" />
      <div className="live-bg__blob live-bg__blob--2" />
      <div className="live-bg__blob live-bg__blob--3" />
      <div className="live-bg__blob live-bg__blob--4" />
      <div className="live-bg__grain" />
    </div>
  );
}
