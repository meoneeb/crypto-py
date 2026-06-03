"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function SymbolCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (symbol: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadSymbols = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/futures/symbols?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (res.ok) setSymbols(data.symbols ?? []);
    } catch {
      setSymbols([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => loadSymbols(query), 200);
    return () => clearTimeout(timer);
  }, [open, query, loadSymbols]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const displayValue = open ? query : value;

  const options = useMemo(() => {
    if (!query.trim()) return symbols;
    const q = query.trim().toUpperCase();
    return symbols.filter((s) => s.includes(q));
  }, [symbols, query]);

  function selectSymbol(s: string) {
    onChange(s);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative text-sm">
      <span className="text-zinc-400">Symbol</span>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Search e.g. BTC, ETH…"
        className="mt-1 block w-44 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 uppercase"
        value={displayValue}
        onChange={(e) => {
          setQuery(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => {
          setQuery(value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
          if (e.key === "Enter" && options.length === 1) {
            e.preventDefault();
            selectSymbol(options[0]!);
          }
        }}
      />
      {open ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-xl"
        >
          {loading ? (
            <li className="px-3 py-2 text-zinc-500">Loading…</li>
          ) : options.length ? (
            options.map((s) => (
              <li key={s} role="option" aria-selected={s === value}>
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left hover:bg-zinc-800 ${
                    s === value ? "bg-zinc-800/80 text-sky-300" : "text-zinc-200"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSymbol(s)}
                >
                  {s}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-zinc-500">No symbols found</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
