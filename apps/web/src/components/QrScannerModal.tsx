"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import jsQR from "jsqr";
import { Modal } from "./ui/Modal";
import { AlertTriangleIcon, CameraIcon, QrCodeIcon, UploadIcon } from "./ui/Icons";

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

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setPreviewImage(null);
      setErrorMessage(null);
    }
  }, [isOpen, stopCamera]);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          <QrCodeIcon size={20} />
          <span>Statutory QR Code Authenticator</span>
        </span>
      }
      footer={
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="qr-tabs" role="tablist" aria-label="QR scanning input method">
        <button
          id="qr-tab-upload"
          type="button"
          role="tab"
          aria-selected={activeTab === "UPLOAD"}
          aria-controls="qr-panel-upload"
          className={`qr-tab-btn ${activeTab === "UPLOAD" ? "active" : ""}`}
          onClick={() => {
            stopCamera();
            setActiveTab("UPLOAD");
          }}
        >
          <UploadIcon size={16} />
          <span>Upload QR Image</span>
        </button>

        <button
          id="qr-tab-camera"
          type="button"
          role="tab"
          aria-selected={activeTab === "CAMERA"}
          aria-controls="qr-panel-camera"
          className={`qr-tab-btn ${activeTab === "CAMERA" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("CAMERA");
            void startCamera();
          }}
        >
          <CameraIcon size={16} />
          <span>Live Camera Scanner</span>
        </button>
      </div>

      {errorMessage && (
        <div className="alert alert-error" role="alert">
          <AlertTriangleIcon size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {activeTab === "UPLOAD" && (
        <div id="qr-panel-upload" role="tabpanel" aria-labelledby="qr-tab-upload">
          <p className="form-help" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
            Upload a photo, screenshot, or scan of an official Punjab Form P.F.T-1 Notice, Form
            P.F.T-2 Challan, or Form P.F.T-5 Clearance Certificate:
          </p>

          <label className="qr-upload-dropzone" htmlFor="qr-image-upload-input">
            <QrCodeIcon size={36} />
            <span
              style={{
                fontWeight: 600,
                color: "var(--color-brand-900)",
                fontSize: "0.95rem",
                marginTop: "0.5rem"
              }}
            >
              Click to select QR Code image file
            </span>
            <span className="form-help" style={{ marginTop: "0.25rem" }}>
              Supports PNG, JPG, JPEG, WEBP
            </span>
            <input
              id="qr-image-upload-input"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>

          {isProcessing && (
            <div
              role="status"
              style={{
                marginTop: "1rem",
                textAlign: "center",
                color: "var(--color-brand-900)",
                fontWeight: 600
              }}
            >
              Scanning image for standard ISO/IEC 18004 QR code...
            </div>
          )}

          {previewImage && !isProcessing && (
            <div style={{ marginTop: "1rem", textAlign: "center" }}>
              <span className="detail-field-label">Uploaded Preview:</span>
              <img
                src={previewImage}
                alt="QR Code Upload Preview"
                style={{
                  maxHeight: "140px",
                  maxWidth: "100%",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border)"
                }}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === "CAMERA" && (
        <div id="qr-panel-camera" role="tabpanel" aria-labelledby="qr-tab-camera">
          <p className="form-help" style={{ fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            Point device camera at the official document QR code:
          </p>

          <div className="qr-camera-viewport">
            <video
              ref={videoRef}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover"
              }}
            />

            <div className="qr-reticle" aria-hidden="true" />

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
                  onClick={() => void startCamera()}
                  className="btn-primary"
                  style={{ display: "block", margin: "0.5rem auto 0" }}
                >
                  Enable Camera
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
