import { forwardRef } from 'react';

interface VideoBackgroundProps {
  blur?: number;
  brightness?: number;
  overlayOpacity?: number;
  accentColor?: string;
  className?: string;
  videoSrc?: string;
}

const VideoBackground = forwardRef<HTMLDivElement, VideoBackgroundProps>(
  ({ blur = 60, brightness = 0.4, overlayOpacity = 0.85, accentColor, className = '', videoSrc = '/videos/ambient-bokeh.mp4' }, ref) => {
    return (
      <div ref={ref} className={`fixed inset-0 z-0 overflow-hidden ${className}`} aria-hidden="true">
        {/* Video layer */}
        <video
          autoPlay
          muted
          loop
          playsInline
          webkit-playsinline="true"
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            filter: `blur(${blur}px) brightness(${brightness})`,
            transform: 'scale(1.2)', // Prevent blur edges from showing
          }}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>

        {/* Radial gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, rgba(10,10,15,${1 - overlayOpacity * 0.35}) 0%, rgba(10,10,15,${overlayOpacity}) 100%)`,
          }}
        />

        {/* Character accent overlay */}
        {accentColor && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: accentColor,
              opacity: 0.06,
              mixBlendMode: 'overlay',
            }}
          />
        )}
      </div>
    );
  }
);

VideoBackground.displayName = 'VideoBackground';
export default VideoBackground;
