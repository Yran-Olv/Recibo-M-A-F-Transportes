import React from "react";
import { SITE_LOGO_URL, SITE_NAME } from "../constants/branding";

interface SiteLogoProps {
  className?: string;
  imgClassName?: string;
  showText?: boolean;
  subtitle?: string;
  dark?: boolean;
}

export function SiteLogo({
  className = "",
  imgClassName = "h-12 w-auto object-contain",
  showText = true,
  subtitle,
  dark = false,
}: SiteLogoProps) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <img
        src={SITE_LOGO_URL}
        alt={SITE_NAME}
        className={`shrink-0 ${imgClassName}`}
        width={168}
        height={56}
        decoding="async"
      />
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
