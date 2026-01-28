
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-black text-white">
      <h1 className="mb-12 text-4xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
        WebRTC Experiments
      </h1>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Link 
          href="/video-chat"
          className="group relative flex h-64 w-64 flex-col items-center justify-center rounded-2xl border border-gray-700 bg-gray-900 p-6 transition-all hover:border-blue-500 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/20"
        >
          <div className="mb-4 text-6xl">📹</div>
          <h2 className="text-2xl font-bold text-gray-100 group-hover:text-blue-400">Video Chat</h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            Basic 1-on-1 WebRTC video conferencing
          </p>
        </Link>
        
        <Link 
          href="/eye-tracking"
          className="group relative flex h-64 w-64 flex-col items-center justify-center rounded-2xl border border-gray-700 bg-gray-900 p-6 transition-all hover:border-green-500 hover:scale-105 hover:shadow-xl hover:shadow-green-500/20"
        >
          <div className="mb-4 text-6xl">👁️</div>
          <h2 className="text-2xl font-bold text-gray-100 group-hover:text-green-400">Eye Tracking</h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            Real-time face mesh and eye gaze estimation via MediaPipe
          </p>
        </Link>
      </div>
    </main>
  );
}
