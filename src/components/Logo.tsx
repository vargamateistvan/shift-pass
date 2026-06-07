type LogoProps = {
  size?: number;
  className?: string;
};

export function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="ShiftPass logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="shiftpass-logo" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#4285f4" />
          <stop offset="1" stopColor="#9b6dff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#shiftpass-logo)" />
      <path
        d="M17.6 5.5 8.4 16.4c-.5.6-.1 1.5.7 1.5h4.2l-1.4 8.1c-.1.8.9 1.3 1.4.6l9.2-10.9c.5-.6.1-1.5-.7-1.5h-4.2l1.4-8.1c.1-.8-.9-1.3-1.4-.6Z"
        fill="#fff"
      />
    </svg>
  );
}
