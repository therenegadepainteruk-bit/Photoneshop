import React, { useState, useEffect, useRef } from "react";
import { 
  Upload, 
  Sparkles, 
  SlidersHorizontal, 
  Layers, 
  Trash2, 
  Download, 
  RefreshCw, 
  Eye, 
  Check, 
  AlertTriangle, 
  Info, 
  ImageIcon, 
  FileImage, 
  CheckCircle2, 
  Scissors, 
  Sliders, 
  Sun, 
  Contrast, 
  HelpCircle,
  Maximize,
  Grid,
  ChevronDown
} from "lucide-react";

export interface ProcessSettings {
  brightness: number;       // -100 to 100
  contrast: number;         // -100 to 100
  midtones: number;         // 0.2 to 3.0 (gamma)
  smartClean: boolean;      // smart adaptive binarization
  smartSensitivity: number; // local threshold weight (0 to 100)
  globalThreshold: number;  // 0 to 255 for standard binarization
  removeStrayPixels: boolean;
  strayThreshold: number;   // max island size in pixels to erase (e.g. 1 to 100)
  cleanBlackSpecks: boolean;
  cleanWhiteHoles: boolean;
  halftoneEnabled: boolean;
  halftoneShape: "round" | "square" | "line" | "ellipse";
  halftoneFrequency: number; // grid cell size in pixels (2 to 24px)
  halftoneAngle: number;     // 0 to 90 degrees
  halftoneSensitivity: number; // scaling factor for dots
  invert: boolean;
  transparentBg: boolean;
  plastisolEnabled: boolean;
  plastisolIntensity: number;
  newspaperEnabled: boolean;
  newspaperIntensity: number;
}

export interface SeparationPlate {
  id: string; // "C", "M", "Y", "K" or "1", "2", etc.
  name: string;
  colorHex: string;
  filmDataUrl: string;
  colorizedDataUrl: string;
  inkCoverage: number;
  angle: number;
}

const rgbToHex = (r: number, g: number, b: number): string => {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
};

const hexToRgb = (hex: string): { r: number, g: number, b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

const createPrng = (seed: number) => {
  let h = seed | 0;
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let imul = Math.imul(h ^ (h >>> 15), h | 1);
    imul = (imul + Math.imul(imul ^ (imul >>> 7), imul | 61)) | 0;
    return ((imul ^ (imul >>> 14)) >>> 0) / 4294967296;
  };
};

const applyVintageEffects = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  currentSettings: ProcessSettings
) => {
  if (!currentSettings.newspaperEnabled && !currentSettings.plastisolEnabled) {
    return;
  }

  // Use a stable seed based on image size to keep textures consistent for this image
  const prng = createPrng(w * h + 9747);

  const imgData = ctx.getImageData(0, 0, w, h);
  const pixels = imgData.data;
  const len = pixels.length;
  const npEnabled = currentSettings.newspaperEnabled && !currentSettings.transparentBg;
  const npIntensity = currentSettings.newspaperIntensity || 50;

  // 1. Newspaper Pulp Grain & Color Shift (pixel pass)
  if (npEnabled) {
    for (let i = 0; i < len; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      // If background / white pixel
      if (r > 240 && g > 240 && b > 240 && a > 15) {
        const x = (i / 4) % w;
        const y = Math.floor((i / 4) / w);

        // Fast deterministic sine-based noise (very fast, looks like fine paper pulp grain)
        const noiseVal = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const noise = (noiseVal - Math.floor(noiseVal) - 0.5) * 14 * (npIntensity / 100);

        // Aged paper cream tint
        pixels[i] = Math.max(215, Math.min(255, 244 + noise));
        pixels[i + 1] = Math.max(205, Math.min(255, 238 + noise - 4));
        pixels[i + 2] = Math.max(185, Math.min(255, 218 + noise - 10));
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  // 2. Vintage Paper Fibers (organic fuzz / dust hairs)
  if (npEnabled) {
    ctx.save();
    ctx.strokeStyle = "rgba(110, 95, 80, 0.15)";
    ctx.lineWidth = 0.55;
    const fiberCount = Math.floor((w * h) / 1000) * (npIntensity / 100);
    for (let f = 0; f < fiberCount; f++) {
      const fx = prng() * w;
      const fy = prng() * h;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(
        fx + (prng() - 0.5) * 8,
        fy + (prng() - 0.5) * 8,
        fx + (prng() - 0.5) * 12,
        fy + (prng() - 0.5) * 12
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Worn Plastisol Cracks
  if (currentSettings.plastisolEnabled) {
    ctx.save();

    if (currentSettings.transparentBg) {
      // Erase directly into transparent output
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0, 0, 0, 1.0)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      if (currentSettings.newspaperEnabled) {
        ctx.strokeStyle = "#f4eeda"; // Match newsprint background
      } else {
        ctx.strokeStyle = "#ffffff"; // Match clean white background
      }
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const intensity = currentSettings.plastisolIntensity || 50;
    
    // Large, jagged principal fractures
    const numCrackClusters = Math.max(1, Math.floor(intensity / 15));
    for (let c = 0; c < numCrackClusters; c++) {
      const startX = prng() * w;
      const startY = prng() * h;

      let x = startX;
      let y = startY;

      ctx.lineWidth = 0.7 + prng() * 1.5;

      ctx.beginPath();
      ctx.moveTo(x, y);

      const steps = 30 + Math.floor(prng() * 50);
      const angle = prng() * Math.PI * 2;
      let dx = Math.cos(angle);
      let dy = Math.sin(angle);

      for (let s = 0; s < steps; s++) {
        x += dx * 5 + (prng() - 0.5) * 7;
        y += dy * 5 + (prng() - 0.5) * 7;

        const turn = (prng() - 0.5) * 0.45;
        const newAngle = Math.atan2(dy, dx) + turn;
        dx = Math.cos(newAngle);
        dy = Math.sin(newAngle);

        ctx.lineTo(x, y);

        // Branching secondary fractures
        if (prng() < 0.12) {
          const branchAngle = Math.atan2(dy, dx) + (prng() < 0.5 ? 0.75 : -0.75);
          let bx = x;
          let by = y;
          ctx.moveTo(bx, by);
          const branchSteps = 8 + Math.floor(prng() * 12);
          for (let bs = 0; bs < branchSteps; bs++) {
            bx += Math.cos(branchAngle) * 4 + (prng() - 0.5) * 3;
            by += Math.sin(branchAngle) * 4 + (prng() - 0.5) * 3;
            ctx.lineTo(bx, by);
          }
          ctx.moveTo(x, y); // Back to main branch
        }
      }
      ctx.stroke();
    }

    // High-frequency horizontal micro-striations (classic t-shirt print stretching)
    const numMicroCracks = Math.max(4, Math.floor(intensity / 8));
    for (let m = 0; m < numMicroCracks; m++) {
      const mx = prng() * w;
      const my = prng() * h;
      
      ctx.lineWidth = 0.4 + prng() * 0.8;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      
      let x = mx;
      let y = my;
      const msteps = 8 + Math.floor(prng() * 12);
      for (let s = 0; s < msteps; s++) {
        x += 4 + (prng() - 0.5) * 2;
        y += (prng() - 0.5) * 1.5;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }
};

export default function PhotoneshopStudio() {
  // Image states
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [originalWidth, setOriginalWidth] = useState<number>(0);
  const [originalHeight, setOriginalHeight] = useState<number>(0);
  const [processWidth, setProcessWidth] = useState<number>(0);
  const [processHeight, setProcessHeight] = useState<number>(0);
  
  // Controls
  const [settings, setSettings] = useState<ProcessSettings>({
    brightness: 0,
    contrast: 20,
    midtones: 1.0,
    smartClean: true,
    smartSensitivity: 35,
    globalThreshold: 140,
    removeStrayPixels: true,
    strayThreshold: 15,
    cleanBlackSpecks: true,
    cleanWhiteHoles: true,
    halftoneEnabled: true,
    halftoneShape: "round",
    halftoneFrequency: 8,
    halftoneAngle: 22.5,
    halftoneSensitivity: 100,
    invert: false,
    transparentBg: false,
    plastisolEnabled: false,
    plastisolIntensity: 45,
    newspaperEnabled: false,
    newspaperIntensity: 50
  });

  // UI state
  const [activeTab, setActiveTab] = useState<"compare" | "halftone" | "cleaned" | "original" | "separation">("compare");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDebouncing, setIsDebouncing] = useState<boolean>(false);
  const debounceTimeoutRef = useRef<any>(null);

  // Accordion UI state for the collapsible control panels
  const [expandedSections, setExpandedSections] = useState({
    levels: true,
    cleanup: false,
    halftone: true,
    vintage: false,
    separations: false
  });

  const [processingTime, setProcessingTime] = useState<number>(0);
  const [pixelsRemovedCount, setPixelsRemovedCount] = useState<number>(0);
  const [activePrintablePercent, setActivePrintablePercent] = useState<number>(0);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [scalePreset, setScalePreset] = useState<"standard" | "high" | "print">("high");

  // Color Separation States
  const [sepMode, setSepMode] = useState<"cmyk" | "spot">("cmyk");
  const [spotCount, setSpotCount] = useState<number>(3);
  const [selectedSepPlate, setSelectedSepPlate] = useState<string>("all");
  const [separatedPlates, setSeparatedPlates] = useState<SeparationPlate[]>([]);
  const [sepBackground, setSepBackground] = useState<"white" | "black" | "transparent">("white");

  // Canvas refs
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cleanedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const halftoneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const separationCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hidden offscreen image
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Set the resolution size based on preset and original size
  const getTargetDimensions = (origW: number, origH: number, preset: string) => {
    let maxDim = 800;
    if (preset === "preview") maxDim = 320;
    else if (preset === "high") maxDim = 1200;
    else if (preset === "print") maxDim = 1800;

    const ratio = origW / origH;
    if (origW > maxDim || origH > maxDim) {
      if (ratio > 1) {
        return { w: maxDim, h: Math.round(maxDim / ratio) };
      } else {
        return { w: Math.round(maxDim * ratio), h: maxDim };
      }
    }
    return { w: origW, h: origH };
  };

  // 1. Generate Custom Stencil Gorilla Sample Artwork
  const handleLoadSample = () => {
    setIsProcessing(true);
    // Create a canvas to draw a screenprint poster mimicking the gorilla artwork
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fill background with light paper gray scan texture
    ctx.fillStyle = "#f5f5f4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw scanning shadow gradient/grunge overlay (simulating scanned paper noise)
    const shadowGrad = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 200,
      canvas.width / 2, canvas.height / 2, 700
    );
    shadowGrad.addColorStop(0, "rgba(230, 225, 220, 0.1)");
    shadowGrad.addColorStop(1, "rgba(130, 130, 130, 0.45)"); // Dark edges like the scanned paper
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw some paper fiber/scanning scanner stripes
    ctx.strokeStyle = "rgba(110, 110, 110, 0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.height; i += 3) {
      if (Math.random() > 0.8) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }
    }

    // Add some paint splotches and messy textures (grunge noise)
    ctx.fillStyle = "rgba(40, 40, 40, 0.25)";
    for (let i = 0; i < 250; i++) {
      const rx = Math.random() * canvas.width;
      const ry = Math.random() * canvas.height;
      const rSize = Math.random() * 4 + 1;
      ctx.beginPath();
      ctx.arc(rx, ry, rSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Add large brushy grunge blobs around the canvas edges
    ctx.fillStyle = "rgba(80, 80, 80, 0.15)";
    for (let i = 0; i < 8; i++) {
      const bx = Math.random() * canvas.width;
      const by = Math.random() * canvas.height;
      const bRad = Math.random() * 150 + 50;
      ctx.beginPath();
      ctx.arc(bx, by, bRad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Gorilla Silhouette / Mask with gradients
    // Central chest & head composition
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 - 50;

    // Head backing shadow
    ctx.fillStyle = "rgba(20, 20, 20, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, 220, 0, Math.PI * 2);
    ctx.fill();

    // Body/Shoulders
    ctx.beginPath();
    ctx.moveTo(cx - 400, cy + 300);
    ctx.bezierCurveTo(cx - 350, cy - 100, cx - 250, cy - 250, cx, cy - 230);
    ctx.bezierCurveTo(cx + 250, cy - 250, cx + 350, cy - 100, cx + 400, cy + 300);
    ctx.closePath();
    ctx.fill();

    // Draw facial structure in grey tones (which will halftone beautiful circles!)
    // Eyebrows
    ctx.fillStyle = "#333333";
    ctx.beginPath();
    ctx.moveTo(cx - 120, cy - 60);
    ctx.lineTo(cx, cy - 20);
    ctx.lineTo(cx + 120, cy - 60);
    ctx.lineTo(cx + 80, cy - 90);
    ctx.lineTo(cx, cy - 50);
    ctx.lineTo(cx - 80, cy - 90);
    ctx.closePath();
    ctx.fill();

    // Brow ridge highlights
    ctx.fillStyle = "#888888";
    ctx.beginPath();
    ctx.arc(cx - 50, cy - 60, 35, 0, Math.PI * 2);
    ctx.arc(cx + 50, cy - 60, 35, 0, Math.PI * 2);
    ctx.fill();

    // Glowing intense white eyes (like the scanned gorilla image!)
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(cx - 55, cy - 60, 22, 12, -0.1, 0, Math.PI * 2);
    ctx.ellipse(cx + 55, cy - 60, 22, 12, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Nose bridge and nostrils
    ctx.fillStyle = "#1e1e1e";
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy - 50);
    ctx.lineTo(cx + 30, cy - 50);
    ctx.lineTo(cx + 40, cy + 30);
    ctx.lineTo(cx - 40, cy + 30);
    ctx.closePath();
    ctx.fill();

    // Nose bulb & highlights
    ctx.fillStyle = "#555555";
    ctx.beginPath();
    ctx.arc(cx, cy + 10, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.arc(cx - 18, cy + 18, 12, 0, Math.PI * 2);
    ctx.arc(cx + 18, cy + 18, 12, 0, Math.PI * 2);
    ctx.fill();

    // Mouth / Snout
    ctx.fillStyle = "#121212";
    ctx.beginPath();
    ctx.moveTo(cx - 110, cy + 60);
    ctx.bezierCurveTo(cx - 80, cy + 10, cx + 80, cy + 10, cx + 110, cy + 60);
    ctx.lineTo(cx + 90, cy + 110);
    ctx.lineTo(cx - 90, cy + 110);
    ctx.closePath();
    ctx.fill();

    // Mouth line
    ctx.strokeStyle = "#444444";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx - 70, cy + 70);
    ctx.quadraticCurveTo(cx, cy + 90, cx + 70, cy + 70);
    ctx.stroke();

    // Cheekbones (grey shade for halftone rendering)
    ctx.fillStyle = "#666666";
    ctx.beginPath();
    ctx.ellipse(cx - 150, cy + 10, 45, 20, 0.4, 0, Math.PI * 2);
    ctx.ellipse(cx + 150, cy + 10, 45, 20, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Beard / Chin fur details
    ctx.fillStyle = "#4a4a4a";
    ctx.beginPath();
    ctx.moveTo(cx - 100, cy + 110);
    ctx.lineTo(cx - 150, cy + 180);
    ctx.lineTo(cx - 60, cy + 140);
    ctx.lineTo(cx, cy + 220);
    ctx.lineTo(cx + 60, cy + 140);
    ctx.lineTo(cx + 150, cy + 180);
    ctx.lineTo(cx + 100, cy + 110);
    ctx.closePath();
    ctx.fill();

    // Draw stencil frame cutouts and grunge lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 14;
    // Bottom cutouts
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(cx - 180, canvas.height - 110, 240, 80, 40);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 160, canvas.height - 70, 45, 0, Math.PI * 2);
    ctx.fill();

    // Draw Red Stencil Screenprint crosshair and target circles (just like the image!)
    ctx.strokeStyle = "#b91c1c";
    ctx.lineWidth = 2.5;
    const tx = canvas.width - 120;
    const ty = 140;
    ctx.beginPath();
    ctx.arc(tx, ty, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - 30, ty); ctx.lineTo(tx + 30, ty);
    ctx.moveTo(tx, ty - 30); ctx.lineTo(tx, ty + 30);
    ctx.stroke();
    // Inner X in target
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx - 10, ty - 10); ctx.lineTo(tx + 10, ty + 10);
    ctx.moveTo(tx + 10, ty - 10); ctx.lineTo(tx - 10, ty + 10);
    ctx.stroke();

    // Draw typography text headers
    ctx.textBaseline = "middle";
    
    // Top Right: "SILVERBACK TRAINING DIVISION EST MMXVI"
    ctx.fillStyle = "#2d3748";
    ctx.font = "bold 15px 'JetBrains Mono', Courier, monospace";
    ctx.letterSpacing = "2px";
    ctx.fillText("SILVERBACK", canvas.width - 240, 100);
    ctx.fillText("TRAINING", canvas.width - 240, 120);
    ctx.fillText("DIVISION", canvas.width - 240, 140);
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillText("EST MMXVI", canvas.width - 240, 160);

    // Bottom Left typography
    ctx.fillStyle = "#2d3748";
    ctx.font = "bold 21px 'JetBrains Mono', Courier, monospace";
    ctx.fillText("BUILT THROUGH PRESSURE", 50, canvas.height - 230);
    
    // Horizontal accent line
    ctx.strokeStyle = "#991b1b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(50, canvas.height - 210);
    ctx.lineTo(240, canvas.height - 210);
    ctx.stroke();

    ctx.font = "14px 'JetBrains Mono', Courier, monospace";
    ctx.fillText("WORLDWIDE TRAINING", 50, canvas.height - 180);
    ctx.fillText("NO EXCUSES", 50, canvas.height - 160);

    // Draw gorilla logo symbol at the bottom cutout
    ctx.fillStyle = "#334155";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("SILVERBACK", cx - 110, canvas.height - 85);
    ctx.font = "8px sans-serif";
    ctx.fillText("TRAINING DIVISION", cx - 115, canvas.height - 70);

    // Add stray noise pixels (dots) around the edges of text and gorilla
    // This provides a perfect test case for the "Stray Pixel Cleanup" engine!
    ctx.fillStyle = "rgba(10, 10, 10, 0.9)";
    for (let i = 0; i < 400; i++) {
      const sx = Math.random() * canvas.width;
      const sy = Math.random() * canvas.height;
      const sW = Math.random() > 0.5 ? 1 : 2;
      const sH = Math.random() > 0.5 ? 1 : 2;
      // Scatter in margins/shadow areas
      if (sy < 400 || sy > 900 || sx < 300 || sx > 900) {
        ctx.fillRect(sx, sy, sW, sH);
      }
    }

    // Set the image sources
    const dataUrl = canvas.toDataURL("image/png");
    setImageSrc(dataUrl);
    setImageName("silverback_scanned_gorilla.png");
    setOriginalWidth(canvas.width);
    setOriginalHeight(canvas.height);

    // Create an image element to trigger loading
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      imgRef.current = img;
      runProcessingPipeline(img, canvas.width, canvas.height, settings);
    };
  };

  // Run the full smart clean + stray pixel + halftone pipeline
  const runProcessingPipeline = (
    img: HTMLImageElement,
    origW: number,
    origH: number,
    currentSettings: ProcessSettings,
    isPreview = false
  ) => {
    if (!img) return;
    setIsProcessing(true);
    const start = performance.now();

    // Determine target render resolution
    const { w, h } = getTargetDimensions(origW, origH, isPreview ? "preview" : scalePreset);
    setProcessWidth(w);
    setProcessHeight(h);

    // 1. Setup offscreen canvases
    const origCanvas = originalCanvasRef.current;
    const cleanCanvas = cleanedCanvasRef.current;
    const halfCanvas = halftoneCanvasRef.current;

    if (!origCanvas || !cleanCanvas || !halfCanvas) {
      setIsProcessing(false);
      return;
    }

    // Match dimensions
    origCanvas.width = w;
    origCanvas.height = h;
    cleanCanvas.width = w;
    cleanCanvas.height = h;
    halfCanvas.width = w;
    halfCanvas.height = h;

    const ctxOrig = origCanvas.getContext("2d");
    const ctxClean = cleanCanvas.getContext("2d");
    const ctxHalf = halfCanvas.getContext("2d");

    if (!ctxOrig || !ctxClean || !ctxHalf) {
      setIsProcessing(false);
      return;
    }

    // Draw loaded image to original canvas
    ctxOrig.drawImage(img, 0, 0, w, h);
    
    // Fetch pixel array
    const originalImgData = ctxOrig.getImageData(0, 0, w, h);
    const pixels = originalImgData.data;
    const length = pixels.length;

    // Allocate array for cleaned pixel data
    const cleanedImgData = ctxClean.createImageData(w, h);
    const cleanPixels = cleanedImgData.data;

    // --- PHASE 1: LEVELS, CONTRAST & SMART CLEAN BINARIZATION ---
    // Calculate adaptive box-blur local average threshold map if smartClean is active
    let localAvgMap: Uint8ClampedArray | null = null;
    if (currentSettings.smartClean) {
      // 1. First build standard grayscale map
      const grayscaleMap = new Uint8ClampedArray(w * h);
      for (let i = 0; i < length; i += 4) {
        const idx = i / 4;
        let gray = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
        if (currentSettings.invert) {
          gray = 255 - gray;
        }
        grayscaleMap[idx] = gray;
      }
      
      // Calculate local box blur (approximate 25px sliding window filter)
      localAvgMap = boxBlurGrayscale(grayscaleMap, w, h, 14);
    }

    let activeInkCount = 0;

    for (let i = 0; i < length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      // Convert to baseline grayscale
      let gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

      if (currentSettings.invert) {
        gray = 255 - gray;
      }

      // Apply brightness (-100 to 100)
      if (currentSettings.brightness !== 0) {
        gray += Math.round(currentSettings.brightness * 2.55);
      }

      // Apply contrast (-100 to 100)
      if (currentSettings.contrast !== 0) {
        const factor = (259 * (currentSettings.contrast + 255)) / (255 * (259 - currentSettings.contrast));
        gray = Math.round(factor * (gray - 128) + 128);
      }

      // Apply gamma / midtones correction
      if (currentSettings.midtones !== 1.0) {
        gray = Math.round(255 * Math.pow(Math.max(0, Math.min(255, gray)) / 255, 1 / currentSettings.midtones));
      }

      // Clamp values
      gray = Math.max(0, Math.min(255, gray));

      // Binarize
      let binaryVal = 255; // White background
      if (currentSettings.smartClean && localAvgMap) {
        const idx = i / 4;
        const localAvg = localAvgMap[idx];
        // Adaptive local threshold: if pixel is darker than local neighborhood average with sensitivity offset
        // Low sensitivity = strict background removal; High sensitivity = keep more subtle shadows
        const thresholdVal = localAvg * (1 - (currentSettings.smartSensitivity / 200));
        binaryVal = gray < thresholdVal ? 0 : 255;
      } else {
        // Global cut-off thresholding
        binaryVal = gray < currentSettings.globalThreshold ? 0 : 255;
      }

      // Handle raw transparency (if original pixel is transparent, force white for processing)
      if (a < 10) {
        binaryVal = 255;
      }

      // Fill Cleaned pixels (RGB are equal, Alpha is 255)
      cleanPixels[i] = binaryVal;
      cleanPixels[i + 1] = binaryVal;
      cleanPixels[i + 2] = binaryVal;
      cleanPixels[i + 3] = 255;
    }

    // --- PHASE 2: STRAY PIXEL BFS FLOOD FILL CLEANUP ---
    let removedSpecks = 0;

    if (currentSettings.removeStrayPixels && currentSettings.strayThreshold > 0) {
      // Clean stray black islands on white canvas (dust specks)
      if (currentSettings.cleanBlackSpecks) {
        const visited = new Uint8Array(w * h);
        const maxIslandSize = currentSettings.strayThreshold;

        for (let y = 0; y < h; y++) {
          const rowOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = rowOffset + x;
            const pixelVal = cleanPixels[idx * 4]; // Since R=G=B, check R

            if (pixelVal === 0 && visited[idx] === 0) { // Black pixel, unvisited
              // BFS Queue
              const queue: number[] = [idx];
              visited[idx] = 1;
              
              const component: number[] = [];
              let head = 0;
              let isBorderConnected = false;

              while (head < queue.length) {
                const curr = queue[head++];
                component.push(curr);

                if (component.length > maxIslandSize) {
                  break; // Too large to be a stray speck, abort BFS trace
                }

                const cy = Math.floor(curr / w);
                const cx = curr % w;

                // Border protection
                if (cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) {
                  isBorderConnected = true;
                }

                // Check 8 neighbors
                for (let dy = -1; dy <= 1; dy++) {
                  const ny = cy + dy;
                  if (ny >= 0 && ny < h) {
                    const nRow = ny * w;
                    for (let dx = -1; dx <= 1; dx++) {
                      if (dx === 0 && dy === 0) continue;
                      const nx = cx + dx;
                      if (nx >= 0 && nx < w) {
                        const nIdx = nRow + nx;
                        if (cleanPixels[nIdx * 4] === 0 && visited[nIdx] === 0) {
                          visited[nIdx] = 1;
                          queue.push(nIdx);
                        }
                      }
                    }
                  }
                }
              }

              // If island size is below size limit and not tied to canvas borders, wash it out to white!
              if (component.length <= maxIslandSize && !isBorderConnected) {
                removedSpecks += component.length;
                for (const cIdx of component) {
                  cleanPixels[cIdx * 4] = 255;
                  cleanPixels[cIdx * 4 + 1] = 255;
                  cleanPixels[cIdx * 4 + 2] = 255;
                }
                // Also wipe remaining indices in queue
                for (let k = head; k < queue.length; k++) {
                  visited[queue[k]] = 1;
                }
              }
            }
          }
        }
      }

      // Clean stray white holes inside black canvas (pepper specks)
      if (currentSettings.cleanWhiteHoles) {
        const visited = new Uint8Array(w * h);
        const maxIslandSize = currentSettings.strayThreshold;

        for (let y = 0; y < h; y++) {
          const rowOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = rowOffset + x;
            const pixelVal = cleanPixels[idx * 4];

            if (pixelVal === 255 && visited[idx] === 0) { // White pixel, unvisited
              const queue: number[] = [idx];
              visited[idx] = 1;

              const component: number[] = [];
              let head = 0;
              let isBorderConnected = false;

              while (head < queue.length) {
                const curr = queue[head++];
                component.push(curr);

                if (component.length > maxIslandSize) {
                  break;
                }

                const cy = Math.floor(curr / w);
                const cx = curr % w;

                if (cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) {
                  isBorderConnected = true;
                }

                for (let dy = -1; dy <= 1; dy++) {
                  const ny = cy + dy;
                  if (ny >= 0 && ny < h) {
                    const nRow = ny * w;
                    for (let dx = -1; dx <= 1; dx++) {
                      if (dx === 0 && dy === 0) continue;
                      const nx = cx + dx;
                      if (nx >= 0 && nx < w) {
                        const nIdx = nRow + nx;
                        if (cleanPixels[nIdx * 4] === 255 && visited[nIdx] === 0) {
                          visited[nIdx] = 1;
                          queue.push(nIdx);
                        }
                      }
                    }
                  }
                }
              }

              // Fill tiny isolated holes inside black structures back to solid Black!
              if (component.length <= maxIslandSize && !isBorderConnected) {
                removedSpecks += component.length;
                for (const cIdx of component) {
                  cleanPixels[cIdx * 4] = 0;
                  cleanPixels[cIdx * 4 + 1] = 0;
                  cleanPixels[cIdx * 4 + 2] = 0;
                }
                for (let k = head; k < queue.length; k++) {
                  visited[queue[k]] = 1;
                }
              }
            }
          }
        }
      }
    }

    // Write binarized cleaned image data back to canvas
    ctxClean.putImageData(cleanedImgData, 0, 0);

    // Calculate active printable ink surface percentage
    for (let i = 0; i < length; i += 4) {
      if (cleanPixels[i] === 0) {
        activeInkCount++;
      }
    }
    setActivePrintablePercent(Math.round((activeInkCount / (w * h)) * 100));
    setPixelsRemovedCount(removedSpecks);

    // --- PHASE 3: REAL ROTATED GRID BITMAP HALFTONE ENGINE ---
    if (currentSettings.halftoneEnabled) {
      const halftoneImgData = ctxHalf.createImageData(w, h);
      const halfPixels = halftoneImgData.data;

      // Mathematically pre-calculate rotated grid parameters
      const angleRad = (currentSettings.halftoneAngle * Math.PI) / 180;
      const cosAngle = Math.cos(angleRad);
      const sinAngle = Math.sin(angleRad);
      const gridSize = currentSettings.halftoneFrequency; // spacing in pixels

      // Loop through every pixel to resolve its Rotated Grid coordinate
      for (let y = 0; y < h; y++) {
        const rowOffset = y * w;
        for (let x = 0; x < w; x++) {
          const idx = (rowOffset + x) * 4;

          // 1. Get original grayscale value at this coordinate to determine dot thickness
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const origGray = 0.299 * r + 0.587 * g + 0.114 * b;
          
          let grayVal = origGray;
          if (currentSettings.invert) {
            grayVal = 255 - grayVal;
          }

          // Apply local adjustments (contrast, midtones) on halftone calculation
          if (currentSettings.brightness !== 0) {
            grayVal += Math.round(currentSettings.brightness * 2.55);
          }
          if (currentSettings.contrast !== 0) {
            const factor = (259 * (currentSettings.contrast + 255)) / (255 * (259 - currentSettings.contrast));
            grayVal = Math.round(factor * (grayVal - 128) + 128);
          }
          if (currentSettings.midtones !== 1.0) {
            grayVal = Math.round(255 * Math.pow(Math.max(0, Math.min(255, grayVal)) / 255, 1 / currentSettings.midtones));
          }
          grayVal = Math.max(0, Math.min(255, grayVal));

          // Ink darkness coverage (1.0 = Pure Black Ink, 0.0 = Blank White Paper)
          let inkDarkness = 1.0 - (grayVal / 255);

          // Apply sensitivity factor slider to choke or spread dots
          inkDarkness = Math.min(Math.max(inkDarkness * (currentSettings.halftoneSensitivity / 100), 0), 1);

          // 2. Perform grid rotation mapping
          const u = x * cosAngle - y * sinAngle;
          const v = x * sinAngle + y * cosAngle;

          // Find center coordinate of the rotated grid cell this pixel falls into
          const uCell = Math.floor(u / gridSize) * gridSize + gridSize / 2;
          const vCell = Math.floor(v / gridSize) * gridSize + gridSize / 2;

          // Compute horizontal/vertical offsets from cell center
          const du = u - uCell;
          const dv = v - vCell;

          let paintInk = false;

          // Evaluate dot shape geometry bounds
          if (currentSettings.halftoneShape === "round") {
            const dist = Math.sqrt(du * du + dv * dv);
            const maxRadius = gridSize / 2;
            const targetRadius = maxRadius * Math.sqrt(inkDarkness); // Area is proportional to darkness
            paintInk = dist <= targetRadius;
          } 
          else if (currentSettings.halftoneShape === "square") {
            const side = gridSize * Math.sqrt(inkDarkness);
            paintInk = Math.abs(du) <= side / 2 && Math.abs(dv) <= side / 2;
          } 
          else if (currentSettings.halftoneShape === "line") {
            const thickness = gridSize * inkDarkness;
            paintInk = Math.abs(du) <= thickness / 2;
          } 
          else if (currentSettings.halftoneShape === "ellipse") {
            // High-fidelity elliptical diamond shape
            const distVal = Math.abs(du) + Math.abs(dv);
            paintInk = distVal <= (gridSize / 1.35) * inkDarkness;
          }

          // If source pixel was highly transparent in alpha channel, never ink it
          if (pixels[idx + 3] < 15) {
            paintInk = false;
          }

          if (paintInk) {
            // Draw pure black ink pixel
            halfPixels[idx] = 0;
            halfPixels[idx + 1] = 0;
            halfPixels[idx + 2] = 0;
            halfPixels[idx + 3] = 255;
          } else {
            if (currentSettings.transparentBg) {
              // Transparent background (for overlay testing)
              halfPixels[idx] = 255;
              halfPixels[idx + 1] = 255;
              halfPixels[idx + 2] = 255;
              halfPixels[idx + 3] = 0;
            } else {
              // Pure white background
              halfPixels[idx] = 255;
              halfPixels[idx + 1] = 255;
              halfPixels[idx + 2] = 255;
              halfPixels[idx + 3] = 255;
            }
          }
        }
      }
      ctxHalf.putImageData(halftoneImgData, 0, 0);
    } else {
      // If halftone is disabled, just paint the clean high-contrast black/white pixel map as final
      ctxHalf.drawImage(cleanCanvas, 0, 0);
    }

    // Apply Vintage Overlays (Newspaper and Worn Plastisol cracks)
    applyVintageEffects(ctxHalf, w, h, currentSettings);

    // --- PHASE 4: MOIRE-FREE COLOR SEPARATION ENGINE ---
    const platesList: SeparationPlate[] = [];
    
    if (sepMode === "cmyk") {
      const cmykNames = ["Cyan", "Magenta", "Yellow", "Black"];
      const cmykColors = ["#00ffff", "#ff00ff", "#ffff00", "#000000"];
      const cmykAngles = [15, 75, 0, 45]; // Anti-moiré separation angles
      
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = w;
      offscreenCanvas.height = h;
      const offCtx = offscreenCanvas.getContext("2d");
      
      if (offCtx) {
        for (let cIdx = 0; cIdx < 4; cIdx++) {
          const plateImgData = offCtx.createImageData(w, h);
          const platePixels = plateImgData.data;
          
          let inkCount = 0;
          const angleRad = (cmykAngles[cIdx] * Math.PI) / 180;
          const cosAngle = Math.cos(angleRad);
          const sinAngle = Math.sin(angleRad);
          const gridSize = currentSettings.halftoneFrequency;
          
          for (let y = 0; y < h; y++) {
            const rowOffset = y * w;
            for (let x = 0; x < w; x++) {
              const idx = (rowOffset + x) * 4;
              const rVal = pixels[idx] / 255;
              const gVal = pixels[idx + 1] / 255;
              const bVal = pixels[idx + 2] / 255;
              const aVal = pixels[idx + 3];
              
              // Calculate CMYK
              const kVal = 1 - Math.max(rVal, gVal, bVal);
              let cVal = kVal === 1 ? 0 : (1 - rVal - kVal) / (1 - kVal);
              let mVal = kVal === 1 ? 0 : (1 - gVal - kVal) / (1 - kVal);
              let yVal = kVal === 1 ? 0 : (1 - bVal - kVal) / (1 - kVal);
              
              cVal = Math.max(0, Math.min(1, cVal));
              mVal = Math.max(0, Math.min(1, mVal));
              yVal = Math.max(0, Math.min(1, yVal));
              const kClamped = Math.max(0, Math.min(1, kVal));
              
              let channelIntensity = 0;
              if (cIdx === 0) channelIntensity = cVal;
              else if (cIdx === 1) channelIntensity = mVal;
              else if (cIdx === 2) channelIntensity = yVal;
              else if (cIdx === 3) channelIntensity = kClamped;
              
              let inkDarkness = channelIntensity;
              inkDarkness = Math.min(Math.max(inkDarkness * (currentSettings.halftoneSensitivity / 100), 0), 1);
              
              let paintInk = false;
              if (currentSettings.halftoneEnabled) {
                const u = x * cosAngle - y * sinAngle;
                const v = x * sinAngle + y * cosAngle;
                const uCell = Math.floor(u / gridSize) * gridSize + gridSize / 2;
                const vCell = Math.floor(v / gridSize) * gridSize + gridSize / 2;
                const du = u - uCell;
                const dv = v - vCell;
                
                if (currentSettings.halftoneShape === "round") {
                  const dist = Math.sqrt(du * du + dv * dv);
                  const maxRadius = gridSize / 2;
                  const targetRadius = maxRadius * Math.sqrt(inkDarkness);
                  paintInk = dist <= targetRadius;
                } else if (currentSettings.halftoneShape === "square") {
                  const side = gridSize * Math.sqrt(inkDarkness);
                  paintInk = Math.abs(du) <= side / 2 && Math.abs(dv) <= side / 2;
                } else if (currentSettings.halftoneShape === "line") {
                  const thickness = gridSize * inkDarkness;
                  paintInk = Math.abs(du) <= thickness / 2;
                } else if (currentSettings.halftoneShape === "ellipse") {
                  const distVal = Math.abs(du) + Math.abs(dv);
                  paintInk = distVal <= (gridSize / 1.35) * inkDarkness;
                }
              } else {
                paintInk = inkDarkness > (currentSettings.globalThreshold / 255);
              }
              
              if (aVal < 15) {
                paintInk = false;
              }
              
              if (paintInk) {
                inkCount++;
                platePixels[idx] = 0;
                platePixels[idx + 1] = 0;
                platePixels[idx + 2] = 0;
                platePixels[idx + 3] = 255;
              } else {
                platePixels[idx] = 255;
                platePixels[idx + 1] = 255;
                platePixels[idx + 2] = 255;
                platePixels[idx + 3] = 255;
              }
            }
          }
          
          offCtx.putImageData(plateImgData, 0, 0);
          const filmUrl = offscreenCanvas.toDataURL("image/png");
          
          const colorizedImgData = offCtx.createImageData(w, h);
          const colPixels = colorizedImgData.data;
          const targetColorHex = cmykColors[cIdx];
          const rgb = hexToRgb(targetColorHex) || { r: 0, g: 0, b: 0 };
          
          for (let i = 0; i < length; i += 4) {
            if (platePixels[i] === 0) {
              colPixels[i] = rgb.r;
              colPixels[i + 1] = rgb.g;
              colPixels[i + 2] = rgb.b;
              colPixels[i + 3] = 255;
            } else {
              colPixels[i] = 255;
              colPixels[i + 1] = 255;
              colPixels[i + 2] = 255;
              colPixels[i + 3] = currentSettings.transparentBg ? 0 : 255;
            }
          }
          offCtx.putImageData(colorizedImgData, 0, 0);
          const colorizedUrl = offscreenCanvas.toDataURL("image/png");
          
          platesList.push({
            id: cmykNames[cIdx][0],
            name: cmykNames[cIdx],
            colorHex: targetColorHex,
            filmDataUrl: filmUrl,
            colorizedDataUrl: colorizedUrl,
            inkCoverage: Math.round((inkCount / (w * h)) * 100),
            angle: cmykAngles[cIdx]
          });
        }
      }
    } else {
      const centroids: number[][] = [];
      const samplePixels: number[][] = [];
      const sampleStep = Math.max(1, Math.floor(pixels.length / (4 * 1000)));
      
      for (let i = 0; i < pixels.length; i += 4 * sampleStep) {
        if (pixels[i + 3] > 15) {
          samplePixels.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
        }
      }
      
      if (samplePixels.length > 0) {
        for (let c = 0; c < spotCount; c++) {
          const index = Math.floor((c * samplePixels.length) / spotCount);
          centroids.push([...samplePixels[index]]);
        }
        
        for (let iter = 0; iter < 8; iter++) {
          const clusters: number[][][] = Array.from({ length: spotCount }, () => []);
          for (const p of samplePixels) {
            let minDist = Infinity;
            let nearestIdx = 0;
            for (let c = 0; c < spotCount; c++) {
              const d = Math.hypot(p[0] - centroids[c][0], p[1] - centroids[c][1], p[2] - centroids[c][2]);
              if (d < minDist) {
                minDist = d;
                nearestIdx = c;
              }
            }
            clusters[nearestIdx].push(p);
          }
          
          for (let c = 0; c < spotCount; c++) {
            if (clusters[c].length > 0) {
              const sum = clusters[c].reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
              centroids[c] = [
                Math.round(sum[0] / clusters[c].length),
                Math.round(sum[1] / clusters[c].length),
                Math.round(sum[2] / clusters[c].length)
              ];
            }
          }
        }
        
        centroids.sort((a, b) => {
          const lumA = 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2];
          const lumB = 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2];
          return lumA - lumB;
        });
        
        const offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = w;
        offscreenCanvas.height = h;
        const offCtx = offscreenCanvas.getContext("2d");
        
        if (offCtx) {
          // Pre-calculate nearest centroid indices for all pixels once using fast squared distance
          const pixelCentroidIndices = new Uint8Array(w * h);
          for (let y = 0; y < h; y++) {
            const rowOffset = y * w;
            for (let x = 0; x < w; x++) {
              const pIdx = rowOffset + x;
              const idx = pIdx * 4;
              const aVal = pixels[idx + 3];
              if (aVal >= 15) {
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                let minDistSq = Infinity;
                let nearestIdx = 0;
                for (let c = 0; c < spotCount; c++) {
                  const dr = r - centroids[c][0];
                  const dg = g - centroids[c][1];
                  const db = b - centroids[c][2];
                  const distSq = dr * dr + dg * dg + db * db;
                  if (distSq < minDistSq) {
                    minDistSq = distSq;
                    nearestIdx = c;
                  }
                }
                pixelCentroidIndices[pIdx] = nearestIdx;
              } else {
                pixelCentroidIndices[pIdx] = 255; // background / transparent
              }
            }
          }

          for (let cIdx = 0; cIdx < spotCount; cIdx++) {
            const plateImgData = offCtx.createImageData(w, h);
            const platePixels = plateImgData.data;
            const targetCentroid = centroids[cIdx];
            
            let inkCount = 0;
            const spotAngle = (cIdx * 22.5) % 90;
            const angleRad = (spotAngle * Math.PI) / 180;
            const cosAngle = Math.cos(angleRad);
            const sinAngle = Math.sin(angleRad);
            const gridSize = currentSettings.halftoneFrequency;
            
            for (let y = 0; y < h; y++) {
              const rowOffset = y * w;
              for (let x = 0; x < w; x++) {
                const idx = (rowOffset + x) * 4;
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                
                const isNearest = pixelCentroidIndices[rowOffset + x] === cIdx;
                
                let paintInk = false;
                if (isNearest) {
                  const localGray = 0.299 * r + 0.587 * g + 0.114 * b;
                  let inkDarkness = 1.0 - (localGray / 255);
                  inkDarkness = Math.min(Math.max(inkDarkness * (currentSettings.halftoneSensitivity / 100), 0), 1);
                  
                  if (currentSettings.halftoneEnabled) {
                    const u = x * cosAngle - y * sinAngle;
                    const v = x * sinAngle + y * cosAngle;
                    const uCell = Math.floor(u / gridSize) * gridSize + gridSize / 2;
                    const vCell = Math.floor(v / gridSize) * gridSize + gridSize / 2;
                    const du = u - uCell;
                    const dv = v - vCell;
                    
                    if (currentSettings.halftoneShape === "round") {
                      const dist = Math.sqrt(du * du + dv * dv);
                      const maxRadius = gridSize / 2;
                      const targetRadius = maxRadius * Math.sqrt(inkDarkness);
                      paintInk = dist <= targetRadius;
                    } else if (currentSettings.halftoneShape === "square") {
                      const side = gridSize * Math.sqrt(inkDarkness);
                      paintInk = Math.abs(du) <= side / 2 && Math.abs(dv) <= side / 2;
                    } else if (currentSettings.halftoneShape === "line") {
                      const thickness = gridSize * inkDarkness;
                      paintInk = Math.abs(du) <= thickness / 2;
                    } else if (currentSettings.halftoneShape === "ellipse") {
                      const distVal = Math.abs(du) + Math.abs(dv);
                      paintInk = distVal <= (gridSize / 1.35) * inkDarkness;
                    }
                  } else {
                    paintInk = true;
                  }
                }
                
                if (paintInk) {
                  inkCount++;
                  platePixels[idx] = 0;
                  platePixels[idx + 1] = 0;
                  platePixels[idx + 2] = 0;
                  platePixels[idx + 3] = 255;
                } else {
                  platePixels[idx] = 255;
                  platePixels[idx + 1] = 255;
                  platePixels[idx + 2] = 255;
                  platePixels[idx + 3] = 255;
                }
              }
            }
            
            offCtx.putImageData(plateImgData, 0, 0);
            const filmUrl = offscreenCanvas.toDataURL("image/png");
            
            const colorizedImgData = offCtx.createImageData(w, h);
            const colPixels = colorizedImgData.data;
            const targetHex = rgbToHex(targetCentroid[0], targetCentroid[1], targetCentroid[2]);
            
            for (let i = 0; i < length; i += 4) {
              if (platePixels[i] === 0) {
                colPixels[i] = targetCentroid[0];
                colPixels[i + 1] = targetCentroid[1];
                colPixels[i + 2] = targetCentroid[2];
                colPixels[i + 3] = 255;
              } else {
                colPixels[i] = 255;
                colPixels[i + 1] = 255;
                colPixels[i + 2] = 255;
                colPixels[i + 3] = currentSettings.transparentBg ? 0 : 255;
              }
            }
            offCtx.putImageData(colorizedImgData, 0, 0);
            const colorizedUrl = offscreenCanvas.toDataURL("image/png");
            
            platesList.push({
              id: `${cIdx + 1}`,
              name: `Spot ${cIdx + 1}`,
              colorHex: targetHex,
              filmDataUrl: filmUrl,
              colorizedDataUrl: colorizedUrl,
              inkCoverage: Math.round((inkCount / (w * h)) * 100),
              angle: spotAngle
            });
          }
        }
      }
    }
    setSeparatedPlates(platesList);

    const end = performance.now();
    setProcessingTime(Math.round(end - start));
    setIsProcessing(false);
  };

  // Helper box-blur average map implementation for O(N) local binarization
  const boxBlurGrayscale = (
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    radius: number
  ): Uint8ClampedArray => {
    const blurred = new Uint8ClampedArray(width * height);
    const temp = new Uint32Array(width * height);

    // Horizontal cumulative window sum pass
    for (let y = 0; y < height; y++) {
      let sum = 0;
      const rowOffset = y * width;
      for (let x = -radius; x < width + radius; x++) {
        const val = pixels[rowOffset + Math.min(Math.max(x, 0), width - 1)];
        sum += val;
        if (x >= radius) {
          temp[rowOffset + (x - radius)] = sum;
          sum -= pixels[rowOffset + Math.min(Math.max(x - 2 * radius, 0), width - 1)];
        }
      }
    }

    // Vertical cumulative window sum pass
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -radius; y < height + radius; y++) {
        const rowOffset = Math.min(Math.max(y, 0), height - 1) * width;
        sum += temp[rowOffset + x];
        if (y >= radius) {
          blurred[(y - radius) * width + x] = Math.round(sum / ((2 * radius + 1) * (2 * radius + 1)));
          sum -= temp[Math.min(Math.max(y - 2 * radius, 0), height - 1) * width + x];
        }
      }
    }

    return blurred;
  };

  // Handle image upload drag & drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadUploadedFile(e.target.files[0]);
    }
  };

  const loadUploadedFile = (file: File) => {
    setImageName(file.name);
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImageSrc(dataUrl);

      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        imgRef.current = img;
        setOriginalWidth(img.naturalWidth);
        setOriginalHeight(img.naturalHeight);
        runProcessingPipeline(img, img.naturalWidth, img.naturalHeight, settings);
      };
    };
    reader.readAsDataURL(file);
  };

  // Trigger pipeline re-run when sliders/settings update
  const updateSetting = <K extends keyof ProcessSettings>(key: K, value: ProcessSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);

    // Continuous slider controls that benefit from real-time low-res preview & debounced high-res final renders
    const isContinuous = [
      "brightness",
      "contrast",
      "midtones",
      "smartSensitivity",
      "globalThreshold",
      "strayThreshold",
      "halftoneFrequency",
      "halftoneAngle",
      "halftoneSensitivity",
      "plastisolIntensity",
      "newspaperIntensity"
    ].includes(key as string);

    if (imgRef.current) {
      if (isContinuous) {
        setIsDebouncing(true);
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }

        // 1. Instantly trigger a lightweight low-res preview rendering (max 320px) for real-time responsiveness!
        runProcessingPipeline(imgRef.current, originalWidth, originalHeight, updated, true);

        // 2. Debounce the final, heavy high-fidelity render (e.g. 1200px / 1800px)
        debounceTimeoutRef.current = setTimeout(() => {
          if (imgRef.current) {
            runProcessingPipeline(imgRef.current, originalWidth, originalHeight, updated, false);
          }
          setIsDebouncing(false);
        }, 150); // 150ms debounce threshold
      } else {
        // Discrete options (toggles, checkboxes, shapes) trigger the high-res render instantly!
        setIsDebouncing(false);
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
        runProcessingPipeline(imgRef.current, originalWidth, originalHeight, updated, false);
      }
    }
  };

  // Force re-run on resolution preset change
  useEffect(() => {
    if (imgRef.current) {
      runProcessingPipeline(imgRef.current, originalWidth, originalHeight, settings);
    }
  }, [scalePreset]);

  // Force re-run on separation mode or spot count changes
  useEffect(() => {
    if (imgRef.current) {
      runProcessingPipeline(imgRef.current, originalWidth, originalHeight, settings);
    }
  }, [sepMode, spotCount]);

  // Handle drawing single isolated plate or composite overlay onto separationCanvasRef
  useEffect(() => {
    const canvas = separationCanvasRef.current;
    if (!canvas || separatedPlates.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = processWidth;
    canvas.height = processHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (sepBackground === "white") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (sepBackground === "black") {
      ctx.fillStyle = "#0a0a0c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (selectedSepPlate === "all") {
      let loadedCount = 0;
      const images: HTMLImageElement[] = [];

      separatedPlates.forEach((plate, idx) => {
        const img = new Image();
        img.src = plate.colorizedDataUrl;
        img.onload = () => {
          images[idx] = img;
          loadedCount++;
          if (loadedCount === separatedPlates.length) {
            for (let i = 0; i < separatedPlates.length; i++) {
              if (images[i]) {
                ctx.drawImage(images[i], 0, 0);
              }
            }
          }
        };
      });
    } else {
      const targetPlate = separatedPlates.find(p => p.id === selectedSepPlate);
      if (targetPlate) {
        const img = new Image();
        img.src = sepBackground === "transparent" ? targetPlate.colorizedDataUrl : targetPlate.filmDataUrl;
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
        };
      }
    }
  }, [separatedPlates, selectedSepPlate, sepBackground, processWidth, processHeight]);

  const handleDownloadAllPlates = () => {
    separatedPlates.forEach((plate, idx) => {
      setTimeout(() => {
        const link = document.createElement("a");
        const baseName = imageName.replace(/\.[^/.]+$/, "");
        link.download = `${baseName}_plate_${plate.name}_film.png`;
        link.href = plate.filmDataUrl;
        link.click();
      }, idx * 300);
    });
  };

  // Clean-up and delete image state
  const handleReset = () => {
    setImageSrc(null);
    setImageName("");
    setOriginalWidth(0);
    setOriginalHeight(0);
    setProcessWidth(0);
    setProcessHeight(0);
    setPixelsRemovedCount(0);
    setActivePrintablePercent(0);
    setSeparatedPlates([]);
    setSelectedSepPlate("all");
  };

  // Download high-resolution processed halftone image
  const handleDownloadImage = () => {
    const canvas = halftoneCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    const formattedName = imageName.replace(/\.[^/.]+$/, "");
    link.download = `${formattedName}_halftoned_${settings.halftoneShape}_${settings.halftoneFrequency}px.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div id="photoneshop-studio-panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl h-full flex flex-col justify-between">
      <div className="space-y-5 flex-1 flex flex-col min-h-0">
        
        {/* Header toolbar */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-slate-850">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 bg-teal-500/10 rounded-lg text-teal-400">
                <Grid className="w-4 h-4 text-teal-400" />
              </span>
              <span className="text-xs text-teal-400 font-bold uppercase tracking-wider">Screenprint Separation Module</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-950 text-emerald-400 border border-emerald-950">
                Active 1-Bit Engine
              </span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-100 mt-1 flex items-center gap-2">
              <span>Photoneshop Studio</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-semibold">
              Prepare low-contrast scans or vector outlines into clean, high-fidelity film positive halftones.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadSample}
              disabled={isProcessing}
              className="px-3 py-2 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-teal-500/20"
              title="Load custom screenprint gorilla design to test halftone"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load Gorilla Scanned Art</span>
            </button>

            {imageSrc && (
              <button
                onClick={handleReset}
                className="p-2 hover:bg-slate-800 border border-slate-850 text-slate-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer"
                title="Wipe canvas and upload a new design"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Studio Layout */}
        {!imageSrc ? (
          /* Empty / Upload View */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[450px]">
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`max-w-xl w-full p-10 border-2 border-dashed rounded-3xl transition-all flex flex-col items-center justify-center gap-4 ${
                dragActive 
                  ? "border-teal-400 bg-teal-950/10 shadow-lg shadow-teal-500/5" 
                  : "border-slate-800 bg-slate-950/20 hover:border-slate-700 hover:bg-slate-950/40"
              }`}
            >
              <div className="w-14 h-14 bg-slate-950 border border-slate-850 rounded-2xl flex items-center justify-center text-teal-400 shadow-inner">
                <Upload className="w-7 h-7" />
              </div>
              
              <div>
                <h4 className="text-sm font-bold text-slate-200">Upload Screenprint Artwork</h4>
                <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                  Drag and drop your file here, or click to browse. We support PNG, JPG, JPEG, and WebP raster scans.
                </p>
              </div>

              <label className="px-4 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-slate-400" />
                <span>Select Raster Scan File</span>
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleFileChange} 
                />
              </label>

              <div className="flex items-center gap-2 py-1 max-w-xs w-full">
                <div className="h-[1px] bg-slate-850 flex-1" />
                <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">or try immediately</span>
                <div className="h-[1px] bg-slate-850 flex-1" />
              </div>

              <button
                onClick={handleLoadSample}
                className="py-2.5 px-5 bg-gradient-to-r from-teal-500/20 to-blue-500/20 hover:from-teal-500/30 hover:to-blue-500/30 text-teal-400 border border-teal-500/30 font-extrabold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-950/15"
              >
                <Sparkles className="w-4 h-4 animate-pulse text-teal-400" />
                <span>Generate & Load Scanned Gorilla Poster</span>
              </button>
            </div>
            
            <div className="mt-8 flex items-center gap-2.5 bg-slate-950/40 border border-slate-850 px-4 py-3 rounded-2xl max-w-md text-left">
              <Info className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                <span className="text-slate-300 font-bold">Why 1-Bit Halftoning?</span> Screenprinters require solid pure-color films to burn screens. This module lets you convert gray gradients into clean round dot clusters or parallel print lines instantly.
              </p>
            </div>
          </div>
        ) : (
          /* Active Studio Workstation */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 items-stretch">
            
            {/* Left Control Panel Column */}
            <div className="lg:col-span-5 space-y-4 overflow-y-auto pr-1 h-[530px] custom-scrollbar">
              
              {/* Image info & resolution selector */}
              <div className="bg-slate-950/50 border border-slate-850 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileImage className="w-4 h-4 text-teal-400" />
                    <span className="text-xs font-bold text-slate-300 truncate max-w-[140px]" title={imageName}>{imageName}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono font-bold">
                    Raw: {originalWidth}×{originalHeight} px
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Processing Resolution
                  </label>
                  <div className="flex gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setScalePreset("standard")}
                      className={`px-2 py-1 text-[9px] font-bold rounded-md cursor-pointer transition-colors ${
                        scalePreset === "standard" ? "bg-teal-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
                      }`}
                      title="Max 800px width - Fastest processing"
                    >
                      Std (800)
                    </button>
                    <button
                      onClick={() => setScalePreset("high")}
                      className={`px-2 py-1 text-[9px] font-bold rounded-md cursor-pointer transition-colors ${
                        scalePreset === "high" ? "bg-teal-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
                      }`}
                      title="Max 1200px width - Recommended blend"
                    >
                      High (1200)
                    </button>
                    <button
                      onClick={() => setScalePreset("print")}
                      className={`px-2 py-1 text-[9px] font-bold rounded-md cursor-pointer transition-colors ${
                        scalePreset === "print" ? "bg-teal-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
                      }`}
                      title="Max 1800px width - Extreme sharpness for print negatives"
                    >
                      Print (1800)
                    </button>
                  </div>
                </div>
              </div>

              {/* 1. Smart Clean Levels Engine */}
              <div className="bg-slate-950/40 border border-slate-850/80 rounded-2xl p-4 space-y-4">
                <div 
                  className="flex items-center justify-between cursor-pointer select-none group"
                  onClick={() => setExpandedSections(prev => ({ ...prev, levels: !prev.levels }))}
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-250 ${expandedSections.levels ? "rotate-180 text-teal-400" : ""}`} />
                    <Sparkles className="w-4 h-4 text-yellow-400 group-hover:scale-110 transition-transform" />
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider group-hover:text-white transition-colors">1. Smart Clean Engine</h4>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={settings.smartClean}
                        onChange={(e) => updateSetting("smartClean", e.target.checked)}
                      />
                      <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-teal-500 peer-checked:after:bg-slate-950"></div>
                    </label>
                  </div>
                </div>

                {expandedSections.levels && (
                  <div className="space-y-4 animate-fade-in">
                    <p className="text-[10px] text-slate-500 leading-normal font-semibold">
                      {settings.smartClean 
                        ? "Using 25px Box Blur Local Average to isolate artwork silhouettes from paper scanning shadow/noise." 
                        : "Using absolute global thresholding map."}
                    </p>

                    {settings.smartClean ? (
                      /* Smart Clean Sensitivity Sliders */
                      <div className="space-y-3 pt-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="font-bold text-slate-400">Adaptive Clean Sensitivity</span>
                          <span className="font-mono text-teal-400 font-bold">{settings.smartSensitivity}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="10" 
                          max="90" 
                          value={settings.smartSensitivity}
                          onChange={(e) => updateSetting("smartSensitivity", parseInt(e.target.value))}
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
                        />
                        <div className="flex justify-between text-[8px] text-slate-600 font-bold uppercase">
                          <span>More Detail</span>
                          <span>Stricter Scan Clean</span>
                        </div>
                      </div>
                    ) : (
                      /* Standard Global Threshold */
                      <div className="space-y-3 pt-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="font-bold text-slate-400">Global Threshold Cut-off</span>
                          <span className="font-mono text-teal-400 font-bold">{settings.globalThreshold} / 255</span>
                        </div>
                        <input 
                          type="range" 
                          min="10" 
                          max="240" 
                          value={settings.globalThreshold}
                          onChange={(e) => updateSetting("globalThreshold", parseInt(e.target.value))}
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
                        />
                        <div className="flex justify-between text-[8px] text-slate-600 font-bold uppercase">
                          <span>Keep Faint Grays</span>
                          <span>Pure Whites Only</span>
                        </div>
                      </div>
                    )}

                    {/* Brightness, Contrast & Midtones Controls */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-900">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-bold text-slate-400">
                          <span>Contrast</span>
                          <span className="font-mono text-slate-300">{settings.contrast}</span>
                        </div>
                        <input 
                          type="range" 
                          min="-50" 
                          max="100" 
                          value={settings.contrast}
                          onChange={(e) => updateSetting("contrast", parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-850 rounded appearance-none cursor-pointer accent-slate-400"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-bold text-slate-400">
                          <span>Brightness</span>
                          <span className="font-mono text-slate-300">{settings.brightness}</span>
                        </div>
                        <input 
                          type="range" 
                          min="-50" 
                          max="50" 
                          value={settings.brightness}
                          onChange={(e) => updateSetting("brightness", parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-850 rounded appearance-none cursor-pointer accent-slate-400"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400">
                        <span>Midtones (Gamma Curve)</span>
                        <span className="font-mono text-slate-300">{settings.midtones.toFixed(2)}x</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.3" 
                        max="2.5" 
                        step="0.05"
                        value={settings.midtones}
                        onChange={(e) => updateSetting("midtones", parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-850 rounded appearance-none cursor-pointer accent-slate-400"
                      />
                    </div>

                    {/* Invert */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-900/60">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invert Graphic Tonal Values</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={settings.invert}
                          onChange={(e) => updateSetting("invert", e.target.checked)}
                        />
                        <div className="w-7 h-3.5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-teal-500 peer-checked:after:bg-slate-950"></div>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Stray Pixel Cleanup Engine */}
              <div className="bg-slate-950/40 border border-slate-850/80 rounded-2xl p-4 space-y-3.5">
                <div 
                  className="flex items-center justify-between cursor-pointer select-none group"
                  onClick={() => setExpandedSections(prev => ({ ...prev, cleanup: !prev.cleanup }))}
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-250 ${expandedSections.cleanup ? "rotate-180 text-teal-400" : ""}`} />
                    <Scissors className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider group-hover:text-white transition-colors">2. Stray Pixel Cleanup</h4>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={settings.removeStrayPixels}
                        onChange={(e) => updateSetting("removeStrayPixels", e.target.checked)}
                      />
                      <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-teal-500 peer-checked:after:bg-slate-950"></div>
                    </label>
                  </div>
                </div>

                {expandedSections.cleanup && (
                  <div className="space-y-4 animate-fade-in">
                    <p className="text-[10px] text-slate-500 leading-normal font-semibold">
                      A non-recursive Connected BFS island detector that finds and deletes tiny speckles of isolated ink or fills accidental air bubbles.
                    </p>

                    {settings.removeStrayPixels && (
                      <div className="space-y-4 pt-1">
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px]">
                            <span className="font-bold text-slate-400">Speckle Size Limit (Pixels)</span>
                            <span className="font-mono text-emerald-400 font-bold">≤ {settings.strayThreshold} px</span>
                          </div>
                          <input 
                            type="range" 
                            min="2" 
                            max="80" 
                            value={settings.strayThreshold}
                            onChange={(e) => updateSetting("strayThreshold", parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                          />
                          <div className="flex justify-between text-[8px] text-slate-600 font-bold uppercase">
                            <span>Specks Only</span>
                            <span>Dust & Noise Islands</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-900">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-semibold text-slate-400">Wipe Black Specks</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={settings.cleanBlackSpecks}
                                onChange={(e) => updateSetting("cleanBlackSpecks", e.target.checked)}
                              />
                              <div className="w-6 h-3 bg-slate-850 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-slate-400 after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-semibold text-slate-400">Fill White Holes</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={settings.cleanWhiteHoles}
                                onChange={(e) => updateSetting("cleanWhiteHoles", e.target.checked)}
                              />
                              <div className="w-6 h-3 bg-slate-850 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-slate-400 after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. REAL Bitmap Halftone Separation Engine */}
              <div className="bg-slate-950/40 border border-slate-850/80 rounded-2xl p-4 space-y-4">
                <div 
                  className="flex items-center justify-between cursor-pointer select-none group"
                  onClick={() => setExpandedSections(prev => ({ ...prev, halftone: !prev.halftone }))}
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-250 ${expandedSections.halftone ? "rotate-180 text-teal-400" : ""}`} />
                    <Grid className="w-4 h-4 text-teal-400 group-hover:scale-110 transition-transform" />
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider group-hover:text-white transition-colors">3. REAL Bitmap Halftone</h4>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={settings.halftoneEnabled}
                        onChange={(e) => updateSetting("halftoneEnabled", e.target.checked)}
                      />
                      <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-teal-500 peer-checked:after:bg-slate-950"></div>
                    </label>
                  </div>
                </div>

                {expandedSections.halftone && (
                  <div className="space-y-4 animate-fade-in">
                    <p className="text-[10px] text-slate-500 leading-normal font-semibold">
                      Generates true pixel-level rotated grid halftones. Outputs exact 1-bit solid black film layout for stencil burning.
                    </p>

                    {settings.halftoneEnabled && (
                      <div className="space-y-4 pt-1">
                        
                        {/* Pattern Shapes */}
                        <div className="space-y-2">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Halftone Dot Geometry</label>
                          <div className="grid grid-cols-4 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-850">
                            {(["round", "square", "line", "ellipse"] as const).map((sh) => (
                              <button
                                key={sh}
                                onClick={() => updateSetting("halftoneShape", sh)}
                                className={`py-1.5 px-1 rounded-lg text-[9px] font-bold cursor-pointer capitalize transition-all ${
                                  settings.halftoneShape === sh 
                                    ? "bg-teal-500 text-slate-950" 
                                    : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                                }`}
                              >
                                {sh}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Dot Frequency */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px]">
                            <span className="font-bold text-slate-400">Dot Size / Grid Interval</span>
                            <span className="font-mono text-teal-400 font-bold">
                              {settings.halftoneFrequency}px (approx. {Math.round(200 / settings.halftoneFrequency)} LPI)
                            </span>
                          </div>
                          <input 
                            type="range" 
                            min="2" 
                            max="24" 
                            value={settings.halftoneFrequency}
                            onChange={(e) => updateSetting("halftoneFrequency", parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
                          />
                          <div className="flex justify-between text-[8px] text-slate-600 font-bold uppercase">
                            <span>Extremely Fine ({settings.halftoneFrequency === 2 ? "Foil" : "Fine"})</span>
                            <span>Coarse/Large ({settings.halftoneFrequency === 24 ? "Retro" : "Bold"})</span>
                          </div>
                        </div>

                        {/* Rotated Angle */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px]">
                            <span className="font-bold text-slate-400">Rotated Moire-Prevention Angle</span>
                            <span className="font-mono text-teal-400 font-bold">{settings.halftoneAngle}°</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="90" 
                            step="4.5"
                            value={settings.halftoneAngle}
                            onChange={(e) => updateSetting("halftoneAngle", parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
                          />
                          <div className="flex justify-between text-[8px] text-slate-600 font-bold uppercase">
                            <span>Horizontal (0°)</span>
                            <span>Screenprint (22.5° / 45°)</span>
                            <span>Vertical (90°)</span>
                          </div>
                        </div>

                        {/* Sensitivity / Dot Choke */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px]">
                            <span className="font-bold text-slate-400">Dot Sensitivity (Gain)</span>
                            <span className="font-mono text-teal-400 font-bold">{settings.halftoneSensitivity}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="30" 
                            max="200" 
                            value={settings.halftoneSensitivity}
                            onChange={(e) => updateSetting("halftoneSensitivity", parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
                          />
                          <div className="flex justify-between text-[8px] text-slate-600 font-bold uppercase">
                            <span>Choke (Thinner)</span>
                            <span>Bleed (Thicker)</span>
                          </div>
                        </div>

                        {/* Transparent output background */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Transparent Background positive</span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={settings.transparentBg}
                              onChange={(e) => updateSetting("transparentBg", e.target.checked)}
                            />
                            <div className="w-7 h-3.5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-teal-500 peer-checked:after:bg-slate-950"></div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Vintage Ink & Paper Finish */}
              <div className="bg-slate-950/40 border border-slate-850/80 rounded-2xl p-4 space-y-4">
                <div 
                  className="flex items-center justify-between cursor-pointer select-none group"
                  onClick={() => setExpandedSections(prev => ({ ...prev, vintage: !prev.vintage }))}
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-250 ${expandedSections.vintage ? "rotate-180 text-teal-400" : ""}`} />
                    <Sparkles className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider group-hover:text-white transition-colors">4. Vintage Ink & Paper</h4>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-950/40 text-amber-400 border border-amber-905/40">
                    Aged Look
                  </span>
                </div>

                {expandedSections.vintage && (
                  <div className="space-y-4 animate-fade-in">
                    <p className="text-[10px] text-slate-500 leading-normal font-semibold">
                      Give your digital screenprint an authentic physical print finish with aged paper texture and distressed cracked ink.
                    </p>

                    <div className="space-y-4 pt-1">
                      {/* Aged Newsprint Paper */}
                      <div className="space-y-2.5 bg-slate-900/30 p-2.5 rounded-xl border border-slate-850">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-300">Aged Newsprint Paper</span>
                            <span className="text-[8px] text-slate-500 font-semibold">Replaces white with warm pulp paper grain</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={settings.newspaperEnabled}
                              onChange={(e) => updateSetting("newspaperEnabled", e.target.checked)}
                              disabled={settings.transparentBg}
                            />
                            <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-slate-950 peer-disabled:opacity-40"></div>
                          </label>
                        </div>

                        {settings.newspaperEnabled && !settings.transparentBg && (
                          <div className="space-y-2 animate-fade-in border-t border-slate-850/60 pt-2 mt-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="font-bold text-slate-400">Pulp & Grain Weight</span>
                              <span className="font-mono text-amber-400 font-bold">{settings.newspaperIntensity}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="10" 
                              max="100" 
                              value={settings.newspaperIntensity}
                              onChange={(e) => updateSetting("newspaperIntensity", parseInt(e.target.value))}
                              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                            />
                            <div className="flex justify-between text-[8px] text-slate-600 font-bold uppercase">
                              <span>Subtle Tint</span>
                              <span>Heavy Fiber Pulp</span>
                            </div>
                          </div>
                        )}
                        {settings.transparentBg && (
                          <p className="text-[8px] text-amber-500/80 font-bold italic pt-0.5">
                            * Incompatible with Transparent Background option
                          </p>
                        )}
                      </div>

                      {/* Worn Plastisol Effect */}
                      <div className="space-y-2.5 bg-slate-900/30 p-2.5 rounded-xl border border-slate-850">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-300">Worn Plastisol Cracked Ink</span>
                            <span className="text-[8px] text-slate-500 font-semibold">Fractures solid ink layers on t-shirts</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={settings.plastisolEnabled}
                              onChange={(e) => updateSetting("plastisolEnabled", e.target.checked)}
                            />
                            <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-slate-950"></div>
                          </label>
                        </div>

                        {settings.plastisolEnabled && (
                          <div className="space-y-2 animate-fade-in border-t border-slate-850/60 pt-2 mt-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="font-bold text-slate-400">Distress & Crack Density</span>
                              <span className="font-mono text-amber-400 font-bold">{settings.plastisolIntensity}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="10" 
                              max="100" 
                              value={settings.plastisolIntensity}
                              onChange={(e) => updateSetting("plastisolIntensity", parseInt(e.target.value))}
                              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                            />
                            <div className="flex justify-between text-[8px] text-slate-600 font-bold uppercase">
                              <span>Washed once</span>
                              <span>Vintage Thrift Find</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Interactive Moire-Free Color Separations */}
              <div className="bg-slate-950/40 border border-slate-850/80 rounded-2xl p-4 space-y-4">
                <div 
                  className="flex items-center justify-between cursor-pointer select-none group"
                  onClick={() => setExpandedSections(prev => ({ ...prev, separations: !prev.separations }))}
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-250 ${expandedSections.separations ? "rotate-180 text-teal-400" : ""}`} />
                    <Layers className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform" />
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider group-hover:text-white transition-colors">5. Color Separation Suite</h4>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-pink-950/40 text-pink-400 border border-pink-900/40">
                    Pro Separation
                  </span>
                </div>

                {expandedSections.separations && (
                  <div className="space-y-4 animate-fade-in">
                    <p className="text-[10px] text-slate-500 leading-normal font-semibold">
                      Split your graphic into screenprint film positive plates. Prevents print patterns or halftone interference using custom-oriented grid angles.
                    </p>

                    <div className="space-y-3.5">
                      <div className="space-y-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Separation Technique</label>
                        <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-850">
                          <button
                            onClick={() => {
                              setSepMode("cmyk");
                              setActiveTab("separation");
                            }}
                            className={`py-1.5 px-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              sepMode === "cmyk" 
                                ? "bg-gradient-to-r from-pink-500 to-teal-500 text-slate-950 font-black" 
                                : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                            }`}
                          >
                            CMYK Process
                          </button>
                          <button
                            onClick={() => {
                              setSepMode("spot");
                              setActiveTab("separation");
                            }}
                            className={`py-1.5 px-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              sepMode === "spot" 
                                ? "bg-gradient-to-r from-emerald-500 to-blue-500 text-slate-950 font-black" 
                                : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                            }`}
                          >
                            Spot Color (K-Means)
                          </button>
                        </div>
                      </div>

                      {sepMode === "spot" && (
                        <div className="space-y-2.5 animate-fade-in bg-slate-950/20 p-2.5 rounded-xl border border-slate-850">
                          <div className="flex justify-between text-[10px]">
                            <span className="font-bold text-slate-400">Target Color Plates</span>
                            <span className="font-mono text-emerald-400 font-bold">{spotCount} ink colors</span>
                          </div>
                          <div className="flex gap-1.5">
                            {[2, 3, 4, 5, 6].map(num => (
                              <button
                                key={num}
                                onClick={() => setSpotCount(num)}
                                className={`flex-1 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                  spotCount === num 
                                    ? "bg-emerald-500 text-slate-950" 
                                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                                }`}
                              >
                                {num}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <button
                        onClick={() => setActiveTab("separation")}
                        className="w-full py-2 bg-gradient-to-r from-pink-500/15 via-purple-500/15 to-teal-500/15 hover:from-pink-500/25 hover:to-teal-500/25 border border-pink-500/25 text-pink-300 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-pink-950/10"
                      >
                        <Layers className="w-4 h-4 text-pink-400 animate-pulse" />
                        <span>Open Separation Plate Editor</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main Stage Output Display Column */}
            <div className="lg:col-span-7 flex flex-col min-h-0 bg-slate-950/40 border border-slate-850 rounded-2xl overflow-hidden shadow-inner h-[530px]">
              
              {/* Display Tabs Toolbar */}
              <div className="px-4 py-2 border-b border-slate-850 bg-slate-900/60 backdrop-blur flex items-center justify-between text-xs font-semibold text-slate-400">
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-850">
                  <button
                    onClick={() => setActiveTab("compare")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeTab === "compare" ? "bg-slate-800 text-teal-400 shadow-sm" : "hover:text-slate-200"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-teal-400" />
                    <span>Side-by-Side</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("halftone")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeTab === "halftone" ? "bg-slate-800 text-teal-400 shadow-sm" : "hover:text-slate-200"
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5 text-teal-400" />
                    <span>Bitmap Halftone</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("cleaned")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeTab === "cleaned" ? "bg-slate-800 text-teal-400 shadow-sm" : "hover:text-slate-200"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                    <span>Cleaned Silhouette</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("separation")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeTab === "separation" ? "bg-slate-800 text-pink-400 shadow-sm" : "hover:text-slate-200"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-pink-400" />
                    <span className="text-pink-300 font-extrabold">Separation Plates</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("original")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeTab === "original" ? "bg-slate-800 text-teal-400 shadow-sm" : "hover:text-slate-200"
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-teal-400" />
                    <span>Original</span>
                  </button>
                </div>

                <div className="text-[10px] text-slate-500 font-mono hidden sm:block font-bold">
                  Active Frame: {processWidth}×{processHeight} px
                </div>
              </div>

              {/* Workstation Canvas Board */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 flex items-center justify-center relative bg-slate-950/70 border-b border-slate-850">
                
                {isProcessing && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 z-30">
                    <RefreshCw className="w-8 h-8 text-teal-400 animate-spin" />
                    <p className="text-xs font-bold text-slate-300">Rendering 1-Bit Film Separations...</p>
                    <p className="text-[10px] text-slate-500 font-medium">Analyzing tonal pixel weights & solving BFS component islands...</p>
                  </div>
                )}

                {/* Sub-Canvases based on Active Tab */}
                
                {/* 1. SIDE-BY-SIDE COMPARE */}
                <div className={`w-full h-full flex gap-4 ${activeTab === "compare" ? "flex" : "hidden"}`}>
                  <div className="flex-1 flex flex-col items-center justify-center space-y-1.5 border border-slate-850 p-2 rounded-2xl bg-slate-900/10">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      Original Scan Tones
                    </span>
                    <div className="flex-1 flex items-center justify-center overflow-hidden max-h-[380px] w-full p-1">
                      <canvas ref={originalCanvasRef} className="max-w-full max-h-full rounded-lg object-contain shadow-md" />
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center space-y-1.5 border border-slate-850 p-2 rounded-2xl bg-slate-900/10">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1">
                      <Grid className="w-3 h-3 text-teal-400" />
                      <span>Bitmap Film Positive</span>
                    </span>
                    <div className="flex-1 flex items-center justify-center overflow-hidden max-h-[380px] w-full p-1">
                      <canvas ref={halftoneCanvasRef} className="max-w-full max-h-full rounded-lg object-contain shadow-md" />
                    </div>
                  </div>
                </div>

                {/* 2. ONLY BITMAP HALFTONE */}
                <div className={`w-full h-full flex items-center justify-center ${activeTab === "halftone" ? "block" : "hidden"}`}>
                  <canvas ref={halftoneCanvasRef} className="max-w-full max-h-[400px] rounded-xl object-contain shadow-2xl border border-slate-850" />
                </div>

                {/* 3. ONLY CLEANED OUTLINE */}
                <div className={`w-full h-full flex items-center justify-center ${activeTab === "cleaned" ? "block" : "hidden"}`}>
                  <canvas ref={cleanedCanvasRef} className="max-w-full max-h-[400px] rounded-xl object-contain shadow-2xl border border-slate-850" />
                </div>

                {/* 4. SEPARATION PLATES SUITE */}
                <div className={`w-full h-full flex flex-col md:flex-row gap-4 items-stretch ${activeTab === "separation" ? "flex" : "hidden"}`}>
                  {/* Plates list panel */}
                  <div className="w-full md:w-[220px] bg-slate-900/40 border border-slate-850 rounded-xl p-3 flex flex-col justify-between space-y-3 shrink-0 text-left">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                        <span className="text-xs font-black text-slate-200 uppercase tracking-wider">Separation Channels</span>
                        <div className="flex gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-850">
                          {(["white", "black", "transparent"] as const).map(bg => (
                            <button
                              key={bg}
                              onClick={() => setSepBackground(bg)}
                              className={`w-4 h-4 rounded-md transition-all cursor-pointer ${
                                sepBackground === bg 
                                  ? "ring-2 ring-pink-500 scale-105" 
                                  : "opacity-60"
                              }`}
                              style={{
                                backgroundColor: bg === "white" ? "#ffffff" : bg === "black" ? "#0a0a0c" : "transparent",
                                backgroundImage: bg === "transparent" ? "linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)" : "none",
                                backgroundSize: "4px 4px"
                              }}
                              title={`Preview on ${bg} base`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5 max-h-[190px] overflow-y-auto custom-scrollbar">
                        {/* Composite option */}
                        <button
                          onClick={() => setSelectedSepPlate("all")}
                          className={`w-full p-2 rounded-lg flex items-center gap-2 border transition-all text-left cursor-pointer ${
                            selectedSepPlate === "all"
                              ? "bg-pink-500/10 border-pink-500/40 text-pink-300 font-bold"
                              : "bg-slate-950/20 border-slate-850 hover:bg-slate-800 text-slate-400"
                          }`}
                        >
                          <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-cyan-400 via-magenta-400 to-yellow-400 border border-slate-700" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold truncate">Composite Print Proof</p>
                            <p className="text-[8px] opacity-75">All plates overlaid</p>
                          </div>
                        </button>

                        {separatedPlates.map(plate => {
                          const isActive = selectedSepPlate === plate.id;
                          return (
                            <button
                              key={plate.id}
                              onClick={() => setSelectedSepPlate(plate.id)}
                              className={`w-full p-2 rounded-lg flex items-center gap-2 border transition-all text-left cursor-pointer ${
                                isActive
                                  ? "bg-pink-500/10 border-pink-500/40 text-pink-300 font-bold"
                                  : "bg-slate-950/20 border-slate-850 hover:bg-slate-800 text-slate-400"
                              }`}
                            >
                              <div className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" style={{ backgroundColor: plate.colorHex }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <p className="text-[10px] font-bold truncate">{plate.name}</p>
                                  <span className="text-[8px] text-slate-500 font-mono">{plate.angle}°</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <div className="h-1 bg-slate-800 rounded-full flex-1 overflow-hidden">
                                    <div className="h-full bg-pink-500" style={{ width: `${plate.inkCoverage}%` }} />
                                  </div>
                                  <span className="text-[8px] text-slate-400 shrink-0 font-mono">{plate.inkCoverage}%</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      onClick={handleDownloadAllPlates}
                      className="w-full py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold rounded-lg text-[10px] flex items-center justify-center gap-1 transition-colors border border-slate-750 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download All Film Positives</span>
                    </button>
                  </div>

                  {/* Main separation viewport */}
                  <div className="flex-1 flex flex-col items-center justify-center bg-slate-950/20 border border-slate-850 p-2 rounded-xl relative overflow-hidden">
                    <span className="absolute top-2 left-2 text-[8px] font-mono uppercase tracking-widest text-pink-400 bg-pink-950/20 px-1.5 py-0.5 rounded border border-pink-900/20">
                      {selectedSepPlate === "all" ? "Simulated Screenprint Proof" : `${separatedPlates.find(p => p.id === selectedSepPlate)?.name || "Film Positive"} Plate`}
                    </span>
                    <div className="flex-1 flex items-center justify-center w-full max-h-[350px]">
                      <canvas ref={separationCanvasRef} className="max-w-full max-h-full rounded-lg object-contain shadow-2xl border border-slate-850" />
                    </div>
                  </div>
                </div>

                {/* 5. ONLY ORIGINAL */}
                <div className={`w-full h-full flex items-center justify-center ${activeTab === "original" ? "block" : "hidden"}`}>
                  <canvas ref={originalCanvasRef} className="max-w-full max-h-[400px] rounded-xl object-contain shadow-2xl border border-slate-850" />
                </div>
              </div>

              {/* Stats & Execution Times Footer */}
              <div className="px-4 py-2.5 bg-slate-900/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-[10px] font-semibold text-slate-500">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="flex items-center gap-1 text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                    <span>Processed in <span className="text-teal-400 font-bold">{processingTime}ms</span></span>
                  </span>
                  {pixelsRemovedCount > 0 && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Deleted <span className="font-bold">{pixelsRemovedCount}</span> stray noise specks</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-slate-400">
                    <span>Print Coverage: <span className="text-teal-400 font-bold">{activePrintablePercent}%</span></span>
                  </span>
                </div>

                <button
                  onClick={activeTab === "separation" 
                    ? (selectedSepPlate === "all" ? handleDownloadAllPlates : () => {
                        const target = separatedPlates.find(p => p.id === selectedSepPlate);
                        if (target) {
                          const link = document.createElement("a");
                          const baseName = imageName.replace(/\.[^/.]+$/, "");
                          link.download = `${baseName}_plate_${target.name}_film.png`;
                          link.href = target.filmDataUrl;
                          link.click();
                        }
                      })
                    : handleDownloadImage
                  }
                  disabled={isProcessing}
                  className="px-4 py-1.5 bg-gradient-to-r from-pink-500 to-teal-500 hover:from-pink-400 hover:to-teal-400 text-slate-950 font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-pink-950/20 active:scale-[0.98] self-end"
                >
                  <Download className="w-3.5 h-3.5 text-slate-950" />
                  <span>
                    {activeTab === "separation" 
                      ? (selectedSepPlate === "all" ? "Download Bulk Films" : `Download ${separatedPlates.find(p => p.id === selectedSepPlate)?.name || "Plate"} Film`) 
                      : "Download High-Res Separation PNG"
                    }
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
