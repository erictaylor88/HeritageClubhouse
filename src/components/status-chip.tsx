import { STATUS_META, type CourseStatus } from "@/lib/courses";

/**
 * A small status swatch whose ring STYLE (solid/dashed/dotted) encodes status
 * redundantly with color, so status reads without relying on hue (design spec
 * §9). Used wherever a status needs a compact glyph.
 */
export function StatusSwatch({
  status,
  className = "size-2.5",
}: {
  status: CourseStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      aria-hidden
      className={`shrink-0 rounded-full border-2 ${className}`}
      style={{ borderColor: `var(${meta.cssVar})`, borderStyle: meta.ring }}
    />
  );
}

/**
 * A pill chip pairing the status label with its ring-style swatch on a tinted
 * ground (design spec §8.5) — never color-only.
 */
export function StatusChip({
  status,
  className = "",
}: {
  status: CourseStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={{
        color: `var(${meta.cssVar})`,
        backgroundColor: `color-mix(in srgb, var(${meta.cssVar}) 14%, transparent)`,
      }}
    >
      <StatusSwatch status={status} />
      {meta.label}
    </span>
  );
}
