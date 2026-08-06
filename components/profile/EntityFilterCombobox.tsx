"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The Entity filter: a dropdown you can type into.
 *
 * A plain `<select>` was the obvious choice and the wrong one — a payer with thirty-odd
 * companies has to scroll a list to find one, and "NVIDIA" is faster to type than to
 * hunt. So: a text input that filters, with the full list shown until it is narrowed.
 *
 * "All entities" is a real option rather than an empty state, because it is the DEFAULT
 * and needs to be selectable again once a filter has been applied.
 */

export const ALL_ENTITIES = "";

type Option = { id: string; name: string };

export function EntityFilterCombobox({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  const selectedName =
    options.find((o) => o.id === value)?.name ?? (value ? "" : "All entities");

  const shown = useMemo(() => {
    const all: Option[] = [{ id: ALL_ENTITIES, name: "All entities" }, ...options];
    const needle = typed.trim().toLowerCase();
    return needle
      ? all.filter((o) => o.name.toLowerCase().includes(needle))
      : all;
  }, [options, typed]);

  const close = useCallback(() => {
    setOpen(false);
    // Drop what was typed: the input shows the SELECTION when closed, and leaving a
    // half-typed filter in it would claim a selection that was never made.
    setTyped("");
    setActive(0);
  }, []);

  // Declared above the effect that closes over it, not below: a `const` read before its
  // declaration is captured stale, so the listener would keep calling the first render's
  // copy.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open, close]);

  const pick = (option: Option) => {
    onChange(option.id);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return Math.max(0, Math.min(next, shown.length - 1));
      });
      return;
    }
    if (e.key === "Enter" && open && shown[active]) {
      e.preventDefault();
      pick(shown[active]);
    }
  };

  return (
    <div className="relative min-w-0" ref={ref}>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="entity-filter-list"
          aria-autocomplete="list"
          aria-label="Filter by entity"
          disabled={disabled}
          value={open ? typed : selectedName}
          placeholder={open ? "Type to search…" : "All entities"}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setTyped(e.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="w-full min-w-[13rem] cursor-pointer rounded-[10px] border border-[#E5E7EB] bg-white py-2.5 pl-4 pr-9 text-[15px] text-[#16202E] transition-colors placeholder:text-[#9CA3AF] focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 disabled:cursor-not-allowed disabled:bg-gray-50"
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7380]"
          aria-hidden
        >
          <span className="material-symbols-outlined text-[20px] leading-none">
            {open ? "search" : "expand_more"}
          </span>
        </span>
      </div>

      {open ? (
        <ul
          id="entity-filter-list"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-72 overflow-y-auto rounded-xl border border-[#E6EBED] bg-white py-1.5 shadow-[0_8px_24px_rgba(15,23,41,0.12)]"
        >
          {shown.length === 0 ? (
            <li className="px-4 py-2.5 text-[15px] text-[#9AA3AE]">No matches</li>
          ) : (
            shown.map((option, i) => {
              const isSelected = option.id === value;
              return (
                <li key={option.id || "all"} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(option)}
                    className={`block w-full px-4 py-2.5 text-left text-[15px] transition-colors ${
                      i === active ? "bg-[#F5F7FA]" : ""
                    } ${isSelected ? "font-semibold text-[#2E9B9B]" : "text-[#292E38]"}`}
                  >
                    {option.name}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
