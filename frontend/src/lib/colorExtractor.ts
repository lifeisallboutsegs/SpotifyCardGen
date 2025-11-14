export async function extractAverageColor(
  imageUrl: string
): Promise<{ r: number; g: number; b: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 20; 
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve({ r: 139, g: 139, b: 139 });
          return;
        }

        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;

        const colorCount = new Map<string, { count: number; r: number; g: number; b: number }>();

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const key = `${r}-${g}-${b}`;

          if (colorCount.has(key)) {
            colorCount.get(key)!.count++;
          } else {
            colorCount.set(key, { count: 1, r, g, b });
          }
        }

        let mostFrequent = { count: 0, r: 139, g: 139, b: 139 };
        for (const [, value] of colorCount) {
          if (value.count > mostFrequent.count) {
            mostFrequent = value;
          }
        }

        resolve({ r: mostFrequent.r, g: mostFrequent.g, b: mostFrequent.b });
      } catch {
        resolve({ r: 139, g: 139, b: 139 });
      }
    };

    img.onerror = () => {
      resolve({ r: 139, g: 139, b: 139 });
    };

    img.src = imageUrl;
  });
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

export function getVibrantColor(rgb: { r: number; g: number; b: number }) {
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const vibriantSaturation = Math.min(s * 1.3, 1);
  const adjustedLightness = Math.max(0.15, Math.min(l * 0.6, 0.35));

  return hslToRgb(h, vibriantSaturation, adjustedLightness);
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function rgbToCss(r: number, g: number, b: number): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function getContrastingTextColor(rgb: {
  r: number;
  g: number;
  b: number;
}): string {
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}
