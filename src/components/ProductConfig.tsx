/** @jsxImportSource preact */
import { useSignal, useSignalEffect, useComputed } from "@preact/signals";
import { useRef, useCallback } from "preact/hooks";

const PACKS = [
  { count: 100, price: 4.99, perClip: "4.99¢" },
  { count: 200, price: 8.99, perClip: "3.60¢" },
  { count: 400, price: 19.99, perClip: "2.00¢" },
];

const FINISHES = [
  { id: "silver", label: "Silver", color: "#C0C0C0" },
  { id: "gold", label: "Gold", color: "#D4A44C" },
  { id: "black", label: "Black", color: "#2D2D2D" },
];

const tile =
  "aspect-square rounded-xl flex items-center justify-center transition-all duration-200";

/** Trigger haptic if available */
function haptic() {
  if (navigator.vibrate) {
    navigator.vibrate(8);
  }
}

/** Hook for horizontal swipe on a row of 3 items */
function useSwipeRow(
  signal: { value: number },
  count: number,
) {
  const startX = useRef(0);
  const swiping = useRef(false);

  const onTouchStart = useCallback((e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    swiping.current = true;
  }, []);

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!swiping.current) return;
      swiping.current = false;
      const dx = e.changedTouches[0].clientX - startX.current;
      if (Math.abs(dx) < 30) return; // too small
      if (dx < 0 && signal.value < count - 1) {
        signal.value += 1;
        haptic();
      } else if (dx > 0 && signal.value > 0) {
        signal.value -= 1;
        haptic();
      }
    },
    [signal, count],
  );

  return { onTouchStart, onTouchEnd };
}

export default function ProductConfig() {
  const selectedPack = useSignal(0);
  const selectedFinish = useSignal(0);
  const added = useSignal(false);

  const packSwipe = useSwipeRow(selectedPack, PACKS.length);
  const finishSwipe = useSwipeRow(selectedFinish, FINISHES.length);

  useSignalEffect(() => {
    const api = (window as any).__sceneAPI;
    if (api) {
      api.setFinish(FINISHES[selectedFinish.value].id);
      api.render();
    }
  });

  useSignalEffect(() => {
    const api = (window as any).__sceneAPI;
    if (api) {
      api.setPackSize(selectedPack.value);
      api.render();
    }
  });

  const pack = PACKS[selectedPack.value];
  const finish = FINISHES[selectedFinish.value];

  const handleAdd = () => {
    added.value = true;
    haptic();
    setTimeout(() => {
      added.value = false;
    }, 2000);
  };

  const select = (signal: { value: number }, i: number) => {
    if (signal.value !== i) {
      signal.value = i;
      haptic();
    }
  };

  // Indicator offset: each tile is 25% wide (1/4 of grid), gap is 0.5rem
  // We calculate translateX as a percentage of the row
  const packIndicatorStyle = useComputed(() => ({
    transform: `translateX(calc(${selectedPack.value * 100}% + ${selectedPack.value * 0.5}rem))`,
  }));

  // For finish row, offset by 1 column (label is col 0, colors are cols 1-3)
  const finishIndicatorStyle = useComputed(() => ({
    transform: `translateX(calc(${(selectedFinish.value + 1) * 100}% + ${(selectedFinish.value + 1) * 0.5}rem))`,
  }));

  return (
    <div class="w-full max-w-md mx-auto flex flex-col gap-2">
      {/* Row 1: Qty — 3 swipeable tiles + label */}
      <div
        class="grid grid-cols-4 gap-2 relative touch-pan-y"
        onTouchStart={packSwipe.onTouchStart}
        onTouchEnd={packSwipe.onTouchEnd}
      >
        {/* Sliding indicator */}
        <div
          class="absolute top-0 left-0 w-[calc(25%-0.375rem)] aspect-square rounded-xl border-2 border-accent pointer-events-none transition-transform duration-300 ease-out z-10"
          style={packIndicatorStyle.value}
        />

        {PACKS.map((p, i) => (
          <button
            key={p.count}
            onClick={() => select(selectedPack, i)}
            class={`${tile} border-2 ${
              i === selectedPack.value
                ? "bg-accent/5 border-transparent"
                : "bg-white border-stone-200"
            }`}
          >
            <span
              class="text-xl font-bold"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              {p.count}
            </span>
          </button>
        ))}
        <div class={`${tile} border-2 border-transparent flex-col gap-0.5`}>
          <span
            class="text-[10px] uppercase tracking-wider font-medium"
            style={{ color: "#57534E" }}
          >
            Qty
          </span>
          <span
            class="text-xs font-semibold"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            {pack.perClip}/ea
          </span>
        </div>
      </div>

      {/* Row 2: Color — label + 3 swipeable tiles */}
      <div
        class="grid grid-cols-4 gap-2 relative touch-pan-y"
        onTouchStart={finishSwipe.onTouchStart}
        onTouchEnd={finishSwipe.onTouchEnd}
      >
        {/* Sliding indicator */}
        <div
          class="absolute top-0 left-0 w-[calc(25%-0.375rem)] aspect-square rounded-xl border-2 border-accent pointer-events-none transition-transform duration-300 ease-out z-10"
          style={finishIndicatorStyle.value}
        />

        <div class={`${tile} border-2 border-transparent flex-col gap-0.5`}>
          <span
            class="text-[10px] uppercase tracking-wider font-medium"
            style={{ color: "#57534E" }}
          >
            Color
          </span>
          <span
            class="text-xs font-semibold"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            {finish.label}
          </span>
        </div>
        {FINISHES.map((f, i) => (
          <button
            key={f.id}
            onClick={() => select(selectedFinish, i)}
            class={`${tile} border-2 ${
              i === selectedFinish.value
                ? "border-transparent"
                : "border-stone-200"
            }`}
            style={{ background: f.color }}
          />
        ))}
      </div>

      {/* Row 3: Add to Cart */}
      <div class="grid grid-cols-4 gap-2">
        <button
          onClick={handleAdd}
          class="col-span-4 aspect-[4/1] rounded-xl text-white font-semibold text-base transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-3"
          style={{
            background: added.value ? "#16a34a" : "#2563EB",
            fontFamily: "Space Grotesk, sans-serif",
          }}
        >
          {added.value ? (
            "✓ Added"
          ) : (
            <>
              <span>Add to Cart</span>
              <span class="opacity-70">—</span>
              <span>${pack.price.toFixed(2)}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
