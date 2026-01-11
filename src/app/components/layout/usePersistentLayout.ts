"use client";

import { useCallback, useEffect, useState } from "react";

type PersistentOptions<T> = {
  parse?: (raw: string) => T;
  serialize?: (value: T) => string;
};

export const usePersistentLayout = <T,>(
  key: string,
  defaultValue: T,
  options: PersistentOptions<T> = {},
) => {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(key);
    if (stored === null) {
      return;
    }
    try {
      const parsed = options.parse
        ? options.parse(stored)
        : (JSON.parse(stored) as T);
      setValue(parsed);
    } catch {
      // ignore corrupted values
    }
  }, [key, options.parse]);

  const setPersisted = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
        if (typeof window !== "undefined") {
          const serialized = options.serialize
            ? options.serialize(resolved)
            : JSON.stringify(resolved);
          window.localStorage.setItem(key, serialized);
        }
        return resolved;
      });
    },
    [key, options.serialize],
  );

  return [value, setPersisted] as const;
};
