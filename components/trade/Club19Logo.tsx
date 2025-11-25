/**
 * Club 19 London Logo Component
 * Uses actual logo assets with Next.js Image for optimal rendering
 * Mobile-optimized to prevent cropping
 */

import Image from "next/image";

interface Club19LogoProps {
  compact?: boolean; // if true, only show the mark
  className?: string;
}

export function Club19Logo({
  compact = false,
  className = "",
}: Club19LogoProps) {
  if (compact) {
    // Just the square mark – for very small screens
    return (
      <div
        className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-black shadow-sm ${className}`}
      >
        <Image
          src="/club19-mark.png"
          alt="Club 19 London"
          width={40}
          height={40}
          className="h-full w-full object-contain p-0.5"
          priority
        />
      </div>
    );
  }

  // Full lockup: circular wordmark + optional text
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Circular Wordmark Logo */}
      <div className="relative h-12 w-12 shrink-0 sm:h-14 sm:w-14">
        <Image
          src="/club19-wordmark.png"
          alt="Club 19 London"
          fill
          className="object-contain"
          priority
        />
      </div>

      {/* Optional: Text lockup for larger screens */}
      <div className="hidden flex-col leading-tight sm:flex">
        <div className="font-serif text-lg font-light leading-tight tracking-wide text-gray-900">
          CLUB<span className="mx-1.5 text-gray-400">|</span>19
        </div>
        <div className="font-sans text-[10px] uppercase tracking-[0.2em] text-gray-500">
          LONDON
        </div>
      </div>
    </div>
  );
}
