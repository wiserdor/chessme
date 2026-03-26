import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

function BaseIcon(props: IconProps) {
  const { title, children, className, ...rest } = props;
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function BrandKnightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path
        d="M7.5 20.5h9m-7-9.5 2.5-3-1-3.5 4 1 2-2.5 1.5 4-2 2-.5 3.5 1.5 2.5-2 5h-7l1.5-4.5-2.5-5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="14.75" cy="7.75" fill="currentColor" r="1" />
    </BaseIcon>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="7" x="4" y="4" />
      <rect height="10" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="9" x="11" y="4" />
      <rect height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="7" x="4" y="10" />
      <rect height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="9" x="11" y="14" />
    </BaseIcon>
  );
}

export function GamesIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 4.5h8l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V6A1.5 1.5 0 0 1 7.5 4.5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 4.5V8h3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M8.5 11h7M8.5 14h7M8.5 17h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </BaseIcon>
  );
}

export function CoachIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4 13.9 8.1 18 10l-4.1 1.9L12 16l-1.9-4.1L6 10l4.1-1.9L12 4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M18.5 4.5 19 6l1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5ZM5.5 15.5 6 17l1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" fill="currentColor" />
    </BaseIcon>
  );
}

export function TrainingIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" fill="currentColor" r="1.25" />
      <path d="M12 2.5v3M21.5 12h-3M12 18.5v3M5.5 12h-3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </BaseIcon>
  );
}

export function ReportIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 18.5h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M7.5 16V11M12 16V7.5M16.5 16v-5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="m7.5 9.5 4-3 5 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </BaseIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 7.5h14M5 16.5h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <circle cx="9" cy="7.5" fill="currentColor" r="2" />
      <circle cx="15" cy="16.5" fill="currentColor" r="2" />
    </BaseIcon>
  );
}

export function NotesIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 4.5h10A1.5 1.5 0 0 1 18.5 6v12A1.5 1.5 0 0 1 17 19.5H7A1.5 1.5 0 0 1 5.5 18V6A1.5 1.5 0 0 1 7 4.5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </BaseIcon>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.5 19a6.5 6.5 0 0 1 13 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </BaseIcon>
  );
}

export function LeakIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4.5 20 19.5H4L12 4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 9v4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <circle cx="12" cy="16.5" fill="currentColor" r="1" />
    </BaseIcon>
  );
}

export function GameFeedIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 6.5h12M6 12h12M6 17.5h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <circle cx="17.5" cy="17.5" fill="currentColor" r="1.4" />
    </BaseIcon>
  );
}

export function FavoriteIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path
        d="m12 4 2.45 4.97L20 9.78l-4 3.9.94 5.5L12 16.6 7.06 19.2 8 13.68l-4-3.9 5.55-.81L12 4Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </BaseIcon>
  );
}

export function ResultWinIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 6.5h10l-1 4.5a5 5 0 0 1-4 3.8V18h3" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M8 20h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M7 7.5H5.5A1.5 1.5 0 0 0 4 9v.5A2.5 2.5 0 0 0 6.5 12H8m9-4.5h1.5A1.5 1.5 0 0 1 20 9v.5A2.5 2.5 0 0 1 17.5 12H16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </BaseIcon>
  );
}

export function ResultLossIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </BaseIcon>
  );
}

export function ResultDrawIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4.5" y="6" width="6.5" height="12" rx="1.75" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="6" width="6.5" height="12" rx="1.75" stroke="currentColor" strokeWidth="1.8" />
      <path d="M13 12h-2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </BaseIcon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.75v2.5M12 18.75v2.5M21.25 12h-2.5M5.25 12h-2.5M18.54 5.46l-1.76 1.77M7.22 16.78l-1.76 1.76M18.54 18.54l-1.76-1.76M7.22 7.22 5.46 5.46"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </BaseIcon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path
        d="M18.5 14.25A6.75 6.75 0 0 1 9.75 5.5a7.75 7.75 0 1 0 8.75 8.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </BaseIcon>
  );
}
