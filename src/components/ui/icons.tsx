import type { SVGProps } from 'react';

/**
 * Geometric outline icons, 24px grid with a 1.75px stroke, per the brand kit's
 * icon rules. Hand-rolled rather than pulled from a package so the set stays
 * exactly as large as the product needs.
 *
 * Icons are decorative by default; every call site pairs them with a text label
 * or an aria-label on the interactive element.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'size'> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h4l3 7 4-14 3 7h4" />
    </Icon>
  );
}

export function RowsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M3 15h18" />
    </Icon>
  );
}

export function StarIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Icon {...props} fill={filled ? 'currentColor' : 'none'}>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z" />
    </Icon>
  );
}

export function PieIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3a9 9 0 1 0 9 9h-9z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
    </Icon>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5z" />
      <path d="m4 12 8 4.3 8-4.3M4 16.4l8 4.3 8-4.3" />
    </Icon>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A2 2 0 0 1 6 3.5h13v15H6a2 2 0 0 0-2 2z" />
      <path d="M8 8h7M8 11.5h7" />
    </Icon>
  );
}

export function TrendUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.5 16.5 6-6 4 4 7-7" />
      <path d="M15.5 7.5h5v5" />
    </Icon>
  );
}

export function TrendDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.5 7.5 6 6 4-4 7 7" />
      <path d="M15.5 16.5h5v-5" />
    </Icon>
  );
}

export function SortIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4v16M7 20l-3-3M7 20l3-3" />
      <path d="M17 20V4M17 4l-3 3M17 4l3 3" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9.5 6 6 6-6" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16l-6.2 7.2V19l-3.6-2v-3.8z" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 19 6v5.5c0 4-3 7.2-7 9-4-1.8-7-5-7-9V6z" />
    </Icon>
  );
}
