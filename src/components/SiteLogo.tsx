import React from "react";
import { SITE_LOGO_URL, SITE_NAME } from "../constants/branding";

type SiteLogoSize = "sidebar" | "default" | "hero";

const LOGO_SIZES: Record<
  SiteLogoSize,
  { imgClassName: string; width: number; height: number }
> = {
  sidebar: {
    imgClassName: "h-12 w-auto max-w-[168px] object-contain",
    width: 168,
    height: 56,
  },
  default: {
    imgClassName: "h-12 w-auto max-w-[168px] object-contain",
    width: 168,
    height: 56,
  },
  hero: {
    /* PNG 500×500 com arte pequena no centro — zoom para legibilidade no login */
    imgClassName:
      "absolute inset-0 m-auto w-full h-full object-contain scale-[2.35] origin-center drop-shadow-xl",
    width: 320,
    height: 320,
  },
};

interface SiteLogoProps {
  className?: string;
  imgClassName?: string;
  size?: SiteLogoSize;
  showText?: boolean;
  subtitle?: string;
  dark?: boolean;
}

export function SiteLogo({
  className = "",
  imgClassName,
  size = "default",
  showText = true,
  subtitle,
  dark = false,
}: SiteLogoProps) {
  const preset = LOGO_SIZES[size];
  const imgCls = imgClassName ?? preset.imgClassName;

  const img = (
    <img
      src={SITE_LOGO_URL}
      alt={SITE_NAME}
      className={size === "hero" ? imgCls : `shrink-0 ${imgCls}`}
      width={preset.width}
      height={preset.height}
      decoding="async"
    />
  );

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      {size === "hero" ? (
        <div className="relative shrink-0 size-44 sm:size-48 md:size-52 overflow-visible">
          {img}
        </div>
      ) : (
        img
      )}
      {showText && (
        <div className="min-w-0 flex-1">
          <p
            className={`font-bold text-sm leading-tight truncate ${
              dark ? "text-white" : "text-slate-900"
            }`}
          >
            {SITE_NAME}
          </p>
          {subtitle ? (
            <p
              className={`text-[10px] truncate ${
                dark ? "text-slate-400" : "text-slate-500"
              }`}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
