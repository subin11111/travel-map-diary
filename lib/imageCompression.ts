export type CompressedImageResult = {
  file: File;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  mimeType: string;
  didCompress: boolean;
};

type CompressOptions = {
  maxWidthOrHeight?: number;
  quality?: number;
  skipBelowBytes?: number;
};

const DEFAULT_MAX_WIDTH_OR_HEIGHT = 1600;
const DEFAULT_QUALITY = 0.85;
const DEFAULT_SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
const MAX_ORIGINAL_FALLBACK_BYTES = 5 * 1024 * 1024;
const OUTPUT_MIME_TYPE = "image/jpeg";

const MESSAGE_CANVAS_BLOB_FAILED =
  "\uC774\uBBF8\uC9C0 \uC555\uCD95 \uACB0\uACFC\uB97C \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
const MESSAGE_HEIC_UNSUPPORTED =
  "HEIC \uC774\uBBF8\uC9C0\uB294 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uBCC0\uD658\uC774 \uC81C\uD55C\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4. JPG \uB610\uB294 PNG\uB85C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.";
const MESSAGE_GIF_UNSUPPORTED =
  "GIF\uB294 \uC555\uCD95 \uBCC0\uD658\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. 5MB \uC774\uD558 GIF \uB610\uB294 JPG/PNG\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.";
const MESSAGE_DECODE_FAILED =
  "\uC774\uBBF8\uC9C0\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. JPG \uB610\uB294 PNG \uD30C\uC77C\uB85C \uB2E4\uC2DC \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.";
const MESSAGE_CANVAS_FAILED =
  "\uC774\uBBF8\uC9C0 \uC555\uCD95\uC744 \uC704\uD55C Canvas\uB97C \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";

export class ImageCompressionError extends Error {
  code: "unsupported-format" | "too-large" | "decode-failed" | "canvas-failed";

  constructor(
    code: ImageCompressionError["code"],
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ImageCompressionError";
    this.code = code;
  }
}

function isHeicLike(file: File) {
  const name = file.name.toLowerCase();

  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

function isGif(file: File) {
  return file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
}

function createOutputFileName(originalName: string) {
  const baseName = originalName.replace(/\.[^.]+$/, "") || "photo";

  return `${baseName}.jpg`;
}

async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to HTMLImageElement decoding for browsers with partial support.
    }
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function calculateTargetSize(width: number, height: number, maxWidthOrHeight: number) {
  const longestSide = Math.max(width, height);

  if (longestSide <= maxWidthOrHeight) {
    return { width, height };
  }

  const scale = maxWidthOrHeight / longestSide;

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new ImageCompressionError("canvas-failed", MESSAGE_CANVAS_BLOB_FAILED));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)}KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export async function compressImageBeforeUpload(
  file: File,
  options: CompressOptions = {}
): Promise<CompressedImageResult> {
  if (isHeicLike(file)) {
    throw new ImageCompressionError("unsupported-format", MESSAGE_HEIC_UNSUPPORTED);
  }

  if (isGif(file)) {
    if (file.size > MAX_ORIGINAL_FALLBACK_BYTES) {
      throw new ImageCompressionError("unsupported-format", MESSAGE_GIF_UNSUPPORTED);
    }

    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      width: 0,
      height: 0,
      mimeType: file.type || "image/gif",
      didCompress: false,
    };
  }

  if (file.size > MAX_ORIGINAL_BYTES) {
    console.warn("[ImageCompression] original image is larger than recommended.", {
      name: file.name,
      size: file.size,
    });
  }

  let image: CanvasImageSource & { width: number; height: number };

  try {
    image = await loadImage(file);
  } catch (error) {
    if (file.size <= MAX_ORIGINAL_FALLBACK_BYTES) {
      return {
        file,
        originalSize: file.size,
        compressedSize: file.size,
        width: 0,
        height: 0,
        mimeType: file.type || "application/octet-stream",
        didCompress: false,
      };
    }

    throw new ImageCompressionError("decode-failed", MESSAGE_DECODE_FAILED, { cause: error });
  }

  const maxWidthOrHeight = options.maxWidthOrHeight ?? DEFAULT_MAX_WIDTH_OR_HEIGHT;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const skipBelowBytes = options.skipBelowBytes ?? DEFAULT_SKIP_BELOW_BYTES;
  const originalWidth = image.width;
  const originalHeight = image.height;
  const targetSize = calculateTargetSize(originalWidth, originalHeight, maxWidthOrHeight);
  const canSkipCompression =
    file.size <= skipBelowBytes &&
    targetSize.width === originalWidth &&
    targetSize.height === originalHeight;

  if (canSkipCompression) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      width: originalWidth,
      height: originalHeight,
      mimeType: file.type || "application/octet-stream",
      didCompress: false,
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetSize.width;
  canvas.height = targetSize.height;
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    throw new ImageCompressionError("canvas-failed", MESSAGE_CANVAS_FAILED);
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetSize.width, targetSize.height);
  context.drawImage(image, 0, 0, targetSize.width, targetSize.height);

  const blob = await canvasToBlob(canvas, OUTPUT_MIME_TYPE, quality);
  const compressedFile = new File([blob], createOutputFileName(file.name), {
    type: OUTPUT_MIME_TYPE,
    lastModified: Date.now(),
  });
  const shouldUseCompressed = compressedFile.size < file.size;

  return {
    file: shouldUseCompressed ? compressedFile : file,
    originalSize: file.size,
    compressedSize: shouldUseCompressed ? compressedFile.size : file.size,
    width: targetSize.width,
    height: targetSize.height,
    mimeType: shouldUseCompressed ? OUTPUT_MIME_TYPE : file.type,
    didCompress: shouldUseCompressed,
  };
}
