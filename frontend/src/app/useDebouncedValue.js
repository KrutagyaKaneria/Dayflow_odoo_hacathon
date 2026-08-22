import { useEffect, useState } from 'react';

// Extracted as a standalone hook (rather than inlined in DirectoryPage) so the debounce
// behavior itself is directly testable without needing to render the whole directory screen —
// see scripts/smoke-directory.mjs.
export function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
