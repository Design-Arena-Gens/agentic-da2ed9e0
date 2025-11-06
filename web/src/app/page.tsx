"use client";

import Image from "next/image";
import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Settings = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  clarity: number;
  fade: number;
};

const DEFAULT_SETTINGS: Settings = {
  brightness: 12,
  contrast: 18,
  saturation: 16,
  warmth: 6,
  clarity: 28,
  fade: 6,
};

type SettingKey = keyof Settings;

const clampChannel = (value: number) =>
  Math.min(255, Math.max(0, Math.round(value)));

const applyClarityKernel = (
  input: Uint8ClampedArray,
  width: number,
  height: number,
  clarity: number,
) => {
  const output = new Uint8ClampedArray(input.length);
  const amount = Math.max(0, clarity) * 0.55;
  const kernel = [
    0,
    -amount,
    0,
    -amount,
    1 + amount * 4,
    -amount,
    0,
    -amount,
    0,
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const clampedX = Math.min(width - 1, Math.max(0, x + kx));
          const clampedY = Math.min(height - 1, Math.max(0, y + ky));
          const idx = (clampedY * width + clampedX) * 4;
          const weight = kernel[(ky + 1) * 3 + (kx + 1)];

          r += input[idx] * weight;
          g += input[idx + 1] * weight;
          b += input[idx + 2] * weight;
          a += input[idx + 3] * weight;
        }
      }

      const destIndex = (y * width + x) * 4;
      output[destIndex] = clampChannel(r);
      output[destIndex + 1] = clampChannel(g);
      output[destIndex + 2] = clampChannel(b);
      output[destIndex + 3] = clampChannel(a);
    }
  }

  return output;
};

const downloadDataUrl = (uri: string, filename: string) => {
  const link = document.createElement("a");
  const trimmedName = filename.trim();
  const safeName = trimmedName.length ? trimmedName : "foto-e-rikthyer";
  link.href = uri;
  link.download = safeName.endsWith(".png")
    ? safeName
    : `${safeName.replace(/\.[^/.]+$/, "") || safeName}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  description?: string;
  onChange: (value: number) => void;
}

const SliderControl = ({
  label,
  value,
  min,
  max,
  step = 1,
  description,
  onChange,
}: SliderProps) => {
  return (
    <label className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/5 p-4 shadow-inner shadow-black/20 backdrop-blur">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-300">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(Number(event.target.value))
        }
        className="range accent-sky-400"
      />
      {description ? (
        <p className="text-xs leading-relaxed text-slate-400">{description}</p>
      ) : null}
    </label>
  );
};

export default function Home() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewDimensions, setPreviewDimensions] =
    useState<{ width: number; height: number } | null>(null);
  const [enhancedSrc, setEnhancedSrc] = useState<string | null>(null);
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [suggestedName, setSuggestedName] = useState("foto-e-rikthyer");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageDataRef = useRef<ImageData | null>(null);

  const hasImage = useMemo(() => Boolean(imageSrc), [imageSrc]);

  const applyEnhancements = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseImageDataRef.current;
    if (!canvas || !base) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    setProcessing(true);
    canvas.width = base.width;
    canvas.height = base.height;

    const working = new Uint8ClampedArray(base.data);
    const brightnessOffset = (settings.brightness / 100) * 255;
    const contrastValue = Math.min(98, settings.contrast);
    const contrastFactor =
      (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
    const saturationFactor = 1 + settings.saturation / 100;
    const warmthOffset = settings.warmth * 1.3;
    const fadeFactor = Math.max(0, settings.fade) / 100;

    for (let i = 0; i < working.length; i += 4) {
      let r = working[i];
      let g = working[i + 1];
      let b = working[i + 2];
      const a = working[i + 3];

      r = contrastFactor * (r - 128) + 128 + brightnessOffset;
      g = contrastFactor * (g - 128) + 128 + brightnessOffset;
      b = contrastFactor * (b - 128) + 128 + brightnessOffset;

      const gray = 0.2989 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * saturationFactor;
      g = gray + (g - gray) * saturationFactor;
      b = gray + (b - gray) * saturationFactor;

      r += warmthOffset;
      b -= warmthOffset;

      r = r + (255 - r) * fadeFactor;
      g = g + (255 - g) * fadeFactor;
      b = b + (255 - b) * fadeFactor;

      working[i] = clampChannel(r);
      working[i + 1] = clampChannel(g);
      working[i + 2] = clampChannel(b);
      working[i + 3] = clampChannel(a);
    }

    let finalPixels = working;

    if (settings.clarity > 0) {
      finalPixels = applyClarityKernel(
        working,
        base.width,
        base.height,
        settings.clarity / 100,
      );
    }

    const finalImage = new ImageData(finalPixels, base.width, base.height);
    ctx.putImageData(finalImage, 0, 0);
    setEnhancedSrc(canvas.toDataURL("image/png"));
    setProcessing(false);
  }, [settings]);

  useEffect(() => {
    if (!imageSrc) return;

    const image = new window.Image();
    image.onload = () => {
      const maxDimension = 1600;
      const largestSide = Math.max(image.width, image.height);
      const scale =
        largestSide > maxDimension ? maxDimension / largestSide : 1;
      const targetWidth = Math.round(image.width * scale);
      const targetHeight = Math.round(image.height * scale);

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = targetWidth;
      tempCanvas.height = targetHeight;
      const tempCtx = tempCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!tempCtx) {
        setError("Nuk arrita të përpunoj fotografinë. Provo përsëri.");
        return;
      }

      tempCtx.drawImage(image, 0, 0, targetWidth, targetHeight);
      baseImageDataRef.current = tempCtx.getImageData(
        0,
        0,
        targetWidth,
        targetHeight,
      );
      setPreviewSrc(tempCanvas.toDataURL("image/png"));
      setPreviewDimensions({ width: targetWidth, height: targetHeight });
      setSettings({ ...DEFAULT_SETTINGS });
      setProcessing(false);
    };
    image.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      applyEnhancements();
    });
    return () => cancelAnimationFrame(frame);
  }, [applyEnhancements]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Ju lutem zgjidhni një skedar fotografie (JPG, PNG, HEIC).");
      return;
    }

    setError(null);
    setProcessing(true);
    setPreviewDimensions(null);
    setPreviewSrc(null);
    setEnhancedSrc(null);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    setSuggestedName(`${baseName || "foto"}-e-rikthyer`);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setImageSrc(result);
      } else {
        setError("Nuk arrita të lexoj fotografinë.");
        setProcessing(false);
      }
    };
    reader.onerror = () => {
      setError("Diçka shkoi keq gjatë ngarkimit. Provo përsëri.");
      setProcessing(false);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = event.target.files ?? [];
    if (file) handleFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    const [file] = event.dataTransfer.files ?? [];
    if (file) handleFile(file);
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const updateSetting = (key: SettingKey, value: number) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleReset = () => setSettings({ ...DEFAULT_SETTINGS });

  const handleAutoEnhance = () => {
    setSettings({
      brightness: 18,
      contrast: 24,
      saturation: 20,
      warmth: 8,
      clarity: 36,
      fade: 4,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-16 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-12 sm:px-6 lg:px-10">
        <header className="space-y-5 text-center lg:text-left">
          <div className="mx-auto w-fit rounded-full border border-white/10 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-sky-300 shadow-lg shadow-sky-500/10 lg:mx-0">
            Enhancer Fotografish
          </div>
          <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">
            Rikthe shkëlqimin e fotografive të vjetra
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-300 lg:mx-0">
            Ngarko një fotografi të dashur dhe përdor kontrollin tonë të avancuar
            për ta pastruar, ndriçuar dhe kthyer ngjyrat e humbura. Çdo përpunim
            ndodh direkt në shfletuesin tënd.
          </p>
        </header>

        <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_370px]">
          <section className="flex min-h-[380px] flex-col justify-between gap-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur">
            {hasImage ? (
              <div className="flex flex-col gap-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <figure className="space-y-2 rounded-2xl bg-black/20 p-4">
                    <figcaption className="text-xs uppercase tracking-wide text-slate-300">
                      Para
                    </figcaption>
                    {previewSrc && previewDimensions ? (
                      <Image
                        src={previewSrc}
                        alt="Fotografia origjinale"
                        width={previewDimensions.width}
                        height={previewDimensions.height}
                        className="h-auto w-full rounded-xl border border-white/10 object-contain"
                        unoptimized
                      />
                    ) : (
                      <div className="grid h-64 place-items-center rounded-xl border border-dashed border-white/10 text-sm text-slate-400">
                        Duke përgatitur pamjen…
                      </div>
                    )}
                  </figure>
                  <figure className="space-y-2 rounded-2xl bg-black/30 p-4">
                    <figcaption className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-100">
                      <span>Pas përmirësimit</span>
                      {processing && (
                        <span className="animate-pulse text-[10px] font-semibold text-sky-300">
                          Duke përpunuar…
                        </span>
                      )}
                    </figcaption>
                    <div className="relative">
                      <canvas
                        ref={canvasRef}
                        className="h-auto w-full rounded-xl border border-sky-500/30 bg-black object-contain shadow-[0_0_35px_rgba(56,189,248,0.3)]"
                      />
                    </div>
                  </figure>
                </div>

                {error ? (
                  <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-slate-100 transition hover:border-white/40 hover:bg-white/10"
                  >
                    Rikthe vlerat standarde
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoEnhance}
                    className="rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
                  >
                    Auto përmirësim inteligjent
                  </button>
                  {enhancedSrc ? (
                    <button
                      type="button"
                      onClick={() =>
                        downloadDataUrl(enhancedSrc, `${suggestedName}.png`)
                      }
                      className="rounded-full border border-sky-400/60 px-5 py-2 text-sm font-semibold text-sky-200 transition hover:border-sky-300 hover:text-sky-100"
                    >
                      Shkarko versionin e ri
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <label
                htmlFor="photo-upload"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`relative flex h-full min-h-[360px] cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-sky-400/60 bg-black/30 p-8 text-center transition ${
                  dragActive ? "border-sky-300 bg-sky-500/10" : ""
                }`}
              >
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleInputChange}
                  className="hidden"
                />
                <div className="rounded-full border border-sky-400/40 bg-sky-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">
                  Hapi 1
                </div>
                <h2 className="text-2xl font-semibold text-white">
                  Zgjidh një fotografi të vjetër
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-slate-300">
                  Tërhiqe këtu ose kliko për ta zgjedhur nga kompjuteri. Nuk
                  ruajmë asnjë të dhënë – gjithçka përpunohet lokalisht në
                  shfletues.
                </p>
              </label>
            )}
          </section>

          <aside className="flex h-full flex-col gap-5 rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl shadow-black/40 backdrop-blur">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Kontrolli të avancuara
              </h2>
              <p className="text-sm leading-relaxed text-slate-300">
                Rregullo balancën e dritës, ngjyrave dhe mprehtësisë për ta
                përshtatur fotografinë siç dëshiron.
              </p>
            </div>

            {error && !hasImage ? (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <div className="grid gap-4">
              <SliderControl
                label="Ndriçimi"
                min={-40}
                max={60}
                value={settings.brightness}
                onChange={(value) => updateSetting("brightness", value)}
                description="Shpërndaje dritën në detajet e errëta pa humbur tonet origjinale."
              />
              <SliderControl
                label="Kontrasti"
                min={-30}
                max={60}
                value={settings.contrast}
                onChange={(value) => updateSetting("contrast", value)}
                description="Rikthe dallimin mes të zezave dhe të bardhave."
              />
              <SliderControl
                label="Ngopja"
                min={-20}
                max={50}
                value={settings.saturation}
                onChange={(value) => updateSetting("saturation", value)}
                description="Rigjallëro ngjyrat e zbehta pa e tepruar me tonalitete artificiale."
              />
              <SliderControl
                label="Ngrohtësia"
                min={-15}
                max={25}
                value={settings.warmth}
                onChange={(value) => updateSetting("warmth", value)}
                description="Balanco tonet mes blu dhe portokalli për ta rikthyer humorin e kohës."
              />
              <SliderControl
                label="Mprehtësia"
                min={0}
                max={60}
                value={settings.clarity}
                onChange={(value) => updateSetting("clarity", value)}
                description="Thekso konturet delikate dhe detajet e fytyrave."
              />
              <SliderControl
                label="Butësia e shiritave"
                min={0}
                max={40}
                value={settings.fade}
                onChange={(value) => updateSetting("fade", value)}
                description="Zbut vijat e ashpra për një përfundim filmik natyral."
              />
            </div>

            {enhancedSrc ? (
              <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-xs text-slate-300">
                <p className="font-semibold text-slate-100">
                  Këshillë për ruajtje:
                </p>
                <p>
                  Pas shkarkimit, mund ta shtypësh fotografinë ose ta ndash me
                  familjen. Foto e re ruhet në cilësi PNG për të shmangur
                  humbjet.
                </p>
              </div>
            ) : null}
          </aside>
        </main>
      </div>
    </div>
  );
}
