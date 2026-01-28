
import Link from "next/link";
import VideoRoom from "../components/VideoRoom";

export default function VideoChatPage() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-gray-900 p-8 text-white">
      <div className="flex w-full justify-start">
        <Link 
            href="/" 
            className="rounded bg-gray-700 px-6 py-2 font-semibold text-white transition-colors hover:bg-gray-600"
        >
            &larr; Back to Home
        </Link>
      </div>

      <div className="w-full flex-1 flex flex-col items-center justify-center">
        <VideoRoom />
      </div>
    </main>
  );
}
