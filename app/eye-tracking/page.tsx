
import Link from "next/link";
import EyeTracker from "../components/EyeTracker";

export default function EyeTrackingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-gray-900 p-8 text-white">
      <div className="flex w-full justify-start">
        <Link 
            href="/" 
            className="rounded bg-gray-700 px-6 py-2 font-semibold text-white transition-colors hover:bg-gray-600"
        >
            &larr; Back to Home
        </Link>
      </div>

      <h1 className="text-3xl font-bold">MediaPipe Face & Eye Tracking</h1>
      <p className="max-w-md text-center text-gray-400">
        This experiment uses MediaPipe Face Landmarker to detect facial features.
        We visualize bounding boxes around the eyes and estimate gaze direction based on iris position.
      </p>
      
      <EyeTracker />
    </div>
  );
}
