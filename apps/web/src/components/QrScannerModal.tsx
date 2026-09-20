"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import jsQR from "jsqr";

interface QrScannerModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onScan: (decodedPayload: string) => void;
}

export function QrScannerModal({ isOpen, onClose, onScan }: QrScannerModalProps) {
  const [activeTab, setActiveTab] = useState<"UPLOAD" | "CAMERA">("UPLOAD");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  const handleScanSuccess = useCallback(
    (payload: string) => {
      stopCamera();
      onScan(payload);
      onClose();
    },
    [onScan, onClose, stopCamera]
  );

  // Clean up camera on unmount or modal close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setPreviewImage(null);
      setErrorMessage(null);
    }
  }, [isOpen, stopCamera]);

  // Image file upload scanner
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setPreviewImage(img.src);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          setErrorMessage("Failed to initialize canvas context.");
          setIsProcessing(false);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);

        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert"
        });

        if (code && code.data) {
          handleScanSuccess(code.data);
        } else {
          // Retry with attemptBoth if inverted
          const retryCode = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth"
          });
          if (retryCode && retryCode.data) {
            handleScanSuccess(retryCode.data);
          } else {
            setErrorMessage(
              "No valid statutory QR code detected in the selected image. Please ensure good lighting and that the QR finder patterns are visible."
            );
          }
        }
        setIsProcessing(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Live video frame scanner loop
  const scanVideoFrame = useCallback(() => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanVideoFrame);
      return;
    }

    const video = videoRef.current;
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvasRef.current = canvas;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert"
      });

      if (code && code.data) {
        handleScanSuccess(code.data);
        return;
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanVideoFrame);
  }, [handleScanSuccess]);

  // Start live webcam / phone camera
  const startCamera = async () => {
    setErrorMessage(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera streaming is not supported on this browser device.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        setIsCameraActive(true);
        animationFrameRef.current = requestAnimationFrame(scanVideoFrame);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to access device camera.";
      setErrorMessage(
        `${message} (You can also upload an image of the QR code using the Upload tab).`
      );
      setIsCameraActive(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem"
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
    >
      <div
        className="modal-card"
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          maxWidth: "32rem",
          width: "100%",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
          overflow: "hidden",
          border: "1px solid #cbd5e1"
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #0d3822 0%, #14532d 100%)",
            color: "#ffffff",
            padding: "1rem 1.25rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.25rem" }}>📷</span>
            <h3 id="qr-scanner-title" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
              Statutory QR Code Authenticator
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#ffffff",
              fontSize: "1.25rem",
              cursor: "pointer",
              padding: "0.25rem 0.5rem"
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab Selector */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc"
          }}
        >
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab("UPLOAD");
            }}
            style={{
              flex: 1,
              padding: "0.75rem",
              border: "none",
              background: activeTab === "UPLOAD" ? "#ffffff" : "transparent",
              borderBottom: activeTab === "UPLOAD" ? "2px solid #0d3822" : "none",
              fontWeight: activeTab === "UPLOAD" ? 700 : 500,
              color: activeTab === "UPLOAD" ? "#0d3822" : "#64748b",
              cursor: "pointer"
            }}
          >
            📁 Upload QR Image
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("CAMERA");
              startCamera();
            }}
            style={{
              flex: 1,
              padding: "0.75rem",
              border: "none",
              background: activeTab === "CAMERA" ? "#ffffff" : "transparent",
              borderBottom: activeTab === "CAMERA" ? "2px solid #0d3822" : "none",
              fontWeight: activeTab === "CAMERA" ? 700 : 500,
              color: activeTab === "CAMERA" ? "#0d3822" : "#64748b",
              cursor: "pointer"
            }}
          >
            🎥 Live Camera Scanner
          </button>
        </div>

        <div style={{ padding: "1.25rem" }}>
          {errorMessage && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                padding: "0.75rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                marginBottom: "1rem"
              }}
            >
              ⚠️ {errorMessage}
            </div>
          )}

          {activeTab === "UPLOAD" && (
            <div>
              <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0 0 1rem" }}>
                Upload a photo, screenshot, or scan of an official Punjab Form P.F.T-1 Notice, Form
                P.F.T-2 Challan, or Form P.F.T-5 Clearance Certificate:
              </p>

              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px dashed #cbd5e1",
                  borderRadius: "8px",
                  padding: "2rem 1rem",
                  background: "#f8fafc",
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "border-color 0.2s ease"
                }}
              >
                <span style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🖼️</span>
                <span style={{ fontWeight: 600, color: "#0d3822", fontSize: "0.95rem" }}>
                  Click to select QR Code image file
                </span>
                <span style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                  Supports PNG, JPG, JPEG, WEBP
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </label>

              {isProcessing && (
                <div
                  style={{
                    marginTop: "1rem",
                    textAlign: "center",
                    color: "#0d3822",
                    fontWeight: 600
                  }}
                >
                  Scanning image for standard ISO/IEC 18004 QR code...
                </div>
              )}

              {previewImage && !isProcessing && (
                <div style={{ marginTop: "1rem", textAlign: "center" }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "#64748b",
                      display: "block",
                      marginBottom: "0.25rem"
                    }}
                  >
                    Uploaded Preview:
                  </span>
                  <img
                    src={previewImage}
                    alt="QR Code Upload Preview"
                    style={{
                      maxHeight: "140px",
                      maxWidth: "100%",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1"
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === "CAMERA" && (
            <div>
              <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0 0 0.75rem" }}>
                Point device camera at the official document QR code:
              </p>

              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "260px",
                  background: "#0f172a",
                  borderRadius: "8px",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <video
                  ref={videoRef}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover"
                  }}
                />

                {/* Target reticle */}
                <div
                  style={{
                    position: "absolute",
                    width: "180px",
                    height: "180px",
                    border: "2px solid #10b981",
                    borderRadius: "12px",
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                    pointerEvents: "none"
                  }}
                />

                {!isCameraActive && (
                  <div
                    style={{
                      position: "absolute",
                      color: "#ffffff",
                      textAlign: "center",
                      padding: "1rem"
                    }}
                  >
                    <span>Camera inactive</span>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="btn-primary"
                      style={{ marginTop: "0.5rem", display: "block", margin: "0.5rem auto 0" }}
                    >
                      Enable Camera
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            padding: "0.75rem 1.25rem",
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem"
          }}
        >
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
