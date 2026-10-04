import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal typing for the (not yet in lib.dom) BarcodeDetector API.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

export function isCameraScanSupported(): boolean {
  return typeof window !== 'undefined' && !!getDetectorCtor() && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Camera QR scanning with the browser's native BarcodeDetector (Chrome/Edge/
 * Android). No extra dependency; where unsupported, callers fall back to
 * manual/USB-scanner code entry. Each distinct value is reported once per
 * 3 s so a code held in front of the camera doesn't fire repeatedly.
 */
export function useQrCamera(onCode: (value: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastRef = useRef<{ value: string; at: number } | null>(null);
  const onCodeRef = useRef(onCode);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  const stop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const Ctor = getDetectorCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera scanning is not supported in this browser. Type or scan the code into the box instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setActive(true);
      const detector = new Ctor({ formats: ['qr_code'] });
      timerRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue;
          if (!value) return;
          const now = Date.now();
          if (lastRef.current && lastRef.current.value === value && now - lastRef.current.at < 3000) return;
          lastRef.current = { value, at: now };
          onCodeRef.current(value);
        } catch {
          /* transient detect errors are ignored */
        }
      }, 350);
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Camera permission was denied.' : 'Could not start the camera.');
      stop();
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { videoRef, active, error, start, stop };
}
