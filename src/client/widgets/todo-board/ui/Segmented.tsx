"use client";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface SegmentedProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5 rounded-full bg-tint p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-1.5 text-[13px] leading-none font-semibold ${
              active ? "bg-bg text-fg shadow-[0_1px_2px_var(--faint)]" : "text-muted hover:text-fg"
            }`}
          >
            {option.label}
            {option.count !== undefined && <span className="ml-1 font-normal text-muted">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
