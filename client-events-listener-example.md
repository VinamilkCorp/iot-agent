# IoT Scale Agent

It's magic I know

### Types

```ts
// types/scale.ts

export type ScaleEvent =
  | { event: "connected"; path: string; baudRate: number }
  | { event: "weight"; weight: number; unit: string; model: string }
  | { event: "disconnected" }
  | { event: "error"; message: string };
```

```ts
const SSE_URL = "http://localhost:3000/events";
const SSE_EVENTS = ["connected", "weight", "disconnected", "error"] as const;

interface ScaleState {
  connected: boolean;
  weight: number | null;
  unit: string;
  model: string;
  error: string | null;
}

const initialState: ScaleState = {
  connected: false,
  weight: null,
  unit: "",
  model: "",
  error: null,
};

export function useScale() {
  const [state, setState] = useState<ScaleState>(initialState);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(SSE_URL);
    esRef.current = es;

    function handle(e: MessageEvent) {
      const data = JSON.parse(e.data) as ScaleEvent;

      switch (data.event) {
        case "connected":
          setState((s) => ({ ...s, connected: true, error: null }));
          break;
        case "weight":
          setState((s) => ({
            ...s,
            weight: data.weight,
            unit: data.unit,
            model: data.model,
          }));
          break;
        case "disconnected":
          setState({ ...initialState });
          break;
        case "error":
          setState((s) => ({ ...s, error: data.message }));
          break;
      }
    }

    SSE_EVENTS.forEach((event) => es.addEventListener(event, handle));

    return () => {
      SSE_EVENTS.forEach((event) => es.removeEventListener(event, handle));
      es.close();
    };
  }, []);

  return state;
}
```

### Usage

```tsx
// components/ScaleDisplay.tsx

import { useScale } from "../hooks/useScale";

export function ScaleDisplay() {
  const { connected, weight, unit, model, error } = useScale();

  if (error) return <p>Error: {error}</p>;
  if (!connected) return <p>Waiting for scale...</p>;

  return (
    <div>
      <p>Model: {model}</p>
      <p>
        Weight: {weight ?? "—"} {unit}
      </p>
    </div>
  );
}
```
