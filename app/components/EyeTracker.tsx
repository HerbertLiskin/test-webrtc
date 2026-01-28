
"use client";

import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export default function EyeTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [webcamRunning, setWebcamRunning] = useState(false);

  // Initialize MediaPipe Face Landmarker
  useEffect(() => {
    const initLandmarker = async () => {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU",
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
      setFaceLandmarker(landmarker);
    };

    initLandmarker();
  }, []);

  // Animation Loop Effect
  useEffect(() => {
    if (webcamRunning && faceLandmarker && videoRef.current && canvasRef.current) {
        let isActive = true;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        const predictWebcam = async () => {
            if (!isActive) return;
            
            if (video.videoWidth === 0 || video.videoHeight === 0) {
                requestRef.current = requestAnimationFrame(predictWebcam);
                return;
            }

            // Set canvas size to match video
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }

            if (ctx) {
                const startTimeMs = performance.now();
                const results = faceLandmarker.detectForVideo(video, startTimeMs);

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Draw results
                if (results.faceLandmarks) {
                    for (const landmarks of results.faceLandmarks) {
                        
                        // Helper to get bounding box with padding
                        const getBoundingBox = (indices: number[]) => {
                            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                            indices.forEach(idx => {
                                const point = landmarks[idx];
                                if(point.x < minX) minX = point.x;
                                if(point.y < minY) minY = point.y;
                                if(point.x > maxX) maxX = point.x;
                                if(point.y > maxY) maxY = point.y;
                            });
                            
                            // Add padding
                            const width = maxX - minX;
                            const height = maxY - minY;
                            const paddingX = width * 0.5;
                            const paddingY = height * 1.5;

                            return { 
                                x: minX - paddingX / 2, 
                                y: minY - paddingY / 2, 
                                w: width + paddingX, 
                                h: height + paddingY 
                            };
                        }

                        // Approximate eye indices (using Face Mesh map)
                        const leftEyeIndices = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
                        const rightEyeIndices = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

                        const leftBox = getBoundingBox(leftEyeIndices);
                        const rightBox = getBoundingBox(rightEyeIndices);
                        
                        // Draw Green Rectangles
                        ctx.strokeStyle = "#00FF00";
                        ctx.lineWidth = 2;
                        
                        ctx.strokeRect(
                            leftBox.x * canvas.width, 
                            leftBox.y * canvas.height, 
                            leftBox.w * canvas.width, 
                            leftBox.h * canvas.height
                        );
                        
                        ctx.strokeRect(
                            rightBox.x * canvas.width, 
                            rightBox.y * canvas.height, 
                            rightBox.w * canvas.width, 
                            rightBox.h * canvas.height
                        );

                        // Draw Gaze Arrows (Vector from Eye Center to Iris Center)
                        const drawGazeArrow = (irisIdx: number, eyeBox: {x: number, y: number, w: number, h: number}) => {
                            const iris = landmarks[irisIdx];
                            const irisPx = { x: iris.x * canvas.width, y: iris.y * canvas.height };
                            
                            const eyeCenterPx = {
                                x: (eyeBox.x + eyeBox.w / 2) * canvas.width,
                                y: (eyeBox.y + eyeBox.h / 2) * canvas.height
                            };

                            const dx = irisPx.x - eyeCenterPx.x;
                            const dy = irisPx.y - eyeCenterPx.y;
                            
                            const scale = 10; 
                            const endX = irisPx.x + dx * scale;
                            const endY = irisPx.y + dy * scale;
                            
                            ctx.beginPath();
                            ctx.moveTo(irisPx.x, irisPx.y);
                            ctx.lineTo(endX, endY);
                            ctx.strokeStyle = "red";
                            ctx.lineWidth = 3;
                            ctx.stroke();
                            
                            // Arrow head
                            const angle = Math.atan2(endY - irisPx.y, endX - irisPx.x);
                            const headLen = 10;
                            ctx.beginPath();
                            ctx.moveTo(endX, endY);
                            ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
                            ctx.moveTo(endX, endY);
                            ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
                            ctx.stroke();
                        }
                        
                        drawGazeArrow(468, leftBox);
                        drawGazeArrow(473, rightBox);
                    }
                }

                requestRef.current = requestAnimationFrame(predictWebcam);
            }
        };

        requestRef.current = requestAnimationFrame(predictWebcam);

        return () => {
            isActive = false;
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }
  }, [webcamRunning, faceLandmarker]);

  const enableCam = async () => {
    if (!faceLandmarker) return;

    if (webcamRunning) {
      setWebcamRunning(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setWebcamRunning(true);
      }
    } catch (err) {
      console.error("Error accessing webcam:", err);
    }
  };

  return (
    <div className="relative flex flex-col items-center gap-4 p-4">
      <h2 className="text-xl font-bold">Eye Tracking Experiment</h2>
      
      {!faceLandmarker && <p>Loading MediaPipe model...</p>}
      
      <div className="relative overflow-hidden rounded-xl border border-gray-700 bg-black shadow-2xl">
        <video 
            ref={videoRef} 
            className="block" 
            style={{ width: "640px", height: "480px" }}
            autoPlay 
            playsInline
            muted
        />
        <canvas 
            ref={canvasRef}
            className="absolute left-0 top-0 z-10"
            style={{ width: "640px", height: "480px" }}
        />
      </div>

      <button
        onClick={enableCam}
        disabled={!faceLandmarker}
        className="rounded bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {webcamRunning ? "Stop Tracking" : "Start Tracking"}
      </button>
    </div>
  );
}
