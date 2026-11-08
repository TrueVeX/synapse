import { FloatingPaths } from "@/components/ui/floating-paths";

// The moving background behind the whole app: slowly flowing lines
// (Floating paths from 21st.dev). They stop moving when Settings → Live
// background is off or the device asks for reduced motion.
export function LiveBackground() {
  return (
    <div className="live-bg" aria-hidden="true">
      <FloatingPaths />
    </div>
  );
}
