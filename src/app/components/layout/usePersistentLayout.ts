"use client";

import { useCallback, useState } from "react";

type PersistentOptions<T> = {
  parse?: (raw: string) => T;
  serialize?: (value: T) => string;
};

export const usePersistentLayout = <T,>(
  key: string,
  defaultValue: T,
  options: PersistentOptions<T> = {},
) => {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return defaultValue;
    }
    const stored = window.localStorage.getItem(key);
    if (stored === null) {
      return defaultValue;
    }
    try {
      return options.parse ? options.parse(stored) : (JSON.parse(stored) as T);
    } catch {
      return defaultValue;
    }
  });

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
    [key, options],
  );

  return [value, setPersisted] as const;
};
