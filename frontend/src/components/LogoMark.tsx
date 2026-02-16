import { cn } from "@/lib/utils";

interface LogoMarkProps {
  className?: string;
  size?: number;
}

export function LogoMark({ className, size = 24 }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient
          id="logo-amber"
          x1="4"
          y1="8"
          x2="40"
          y2="36"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      <path
        d="M8 24C8 15.1634 15.1634 8 24 8C32.8366 8 40 15.1634 40 24"
        stroke="#78716c"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M40 24C40 30 36 36 28 36C20 36 20 28 12 28C6 28 4 32 4 36"
        stroke="#78716c"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="38" cy="36" r="4.75" fill="#78716c" />
      <path
        d="M8 24C8 15.1634 15.1634 8 24 8C32.8366 8 40 15.1634 40 24"
        stroke="url(#logo-amber)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M40 24C40 30 36 36 28 36C20 36 20 28 12 28C6 28 4 32 4 36"
        stroke="url(#logo-amber)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="38" cy="36" r="4" fill="#f59e0b" />
    </svg>
  );
}
