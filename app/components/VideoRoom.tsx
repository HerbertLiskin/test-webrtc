'use client';

import { useState, useRef, useEffect } from 'react';
import { db } from '@/app/firebase/config';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  DocumentReference,
  DocumentSnapshot,
} from 'firebase/firestore';

// STUN servers help the browser find its public IP
const iceServers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
};

export default function VideoRoom() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [roomId, setRoomId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [status, setStatus] = useState('Idle'); // Idle, Creating, Joining, Connected

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);

  // Initialize Local Stream
  useEffect(() => {
    async function startWebcam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error accessing webcam:', err);
        setStatus('Error: Could not access camera/mic');
      }
    }
    startWebcam();
  }, []);

  // Helper: Create Peer Connection
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(iceServers);

    // 1. Handle Local ICE Candidates
    // When the browser finds a path (candidate), we need to send it to the other peer via Firestore
    pc.onicecandidate = (event) => {
      // Logic handled in createRoom/joinRoom specifically to know WHICH collection to add to
      // We will attach the specific handler later
      console.log('New ICE candidate:', event.candidate);
    };

    // 2. Handle Remote Stream
    // When the other peer sends their video track
    pc.ontrack = (event) => {
      console.log('Received remote track');
      event.streams[0].getTracks().forEach((track) => {
        if (remoteStream) {
          remoteStream.addTrack(track);
        } else {
          setRemoteStream(event.streams[0]);
        }
      });
    };

    // Add local tracks to the connection
    localStream?.getTracks().forEach((track) => {
      pc.addTrack(track, localStream!);
    });

    return pc;
  };

  // --- CREATE ROOM (Caller) ---
  const createRoom = async () => {
    setStatus('Creating Room...');
    try {
      // 1. Create PC
      const pc = createPeerConnection();
      peerConnection.current = pc;

      // 2. Create Room Reference in Firestore
      const roomRef = doc(collection(db, 'rooms'));
      
      // 3. Handle ICE Candidates: Save caller's candidates to 'callerCandidates' subcollection
      const callerCandidatesCollection = collection(roomRef, 'callerCandidates');
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(callerCandidatesCollection, event.candidate.toJSON());
        }
      };

      // 4. Create Offer
      const offerDescription = await pc.createOffer();
      await pc.setLocalDescription(offerDescription);

      // 5. Save Offer to Firestore
      const roomWithOffer = {
        offer: {
          type: offerDescription.type,
          sdp: offerDescription.sdp,
        },
      };
      await setDoc(roomRef, roomWithOffer);
      setRoomId(roomRef.id);
      setStatus('Waiting for someone to join...');

      // 6. Listen for Remote Answer
      onSnapshot(roomRef, (snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
          const answer = new RTCSessionDescription(data.answer);
          pc.setRemoteDescription(answer);
          setStatus('Connected!');
        }
      });

      // 7. Listen for Callee ICE Candidates
      const calleeCandidatesCollection = collection(roomRef, 'calleeCandidates');
      onSnapshot(calleeCandidatesCollection, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            await pc.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });
    } catch (err) {
      console.error(err);
      setStatus(`Error creating room: ${(err as Error).message}`);
    }
  };

  // --- JOIN ROOM (Callee) ---
  const joinRoom = async () => {
    if (!joinId) return;
    setStatus('Joining Room...');
    try {
      // 1. Create PC
      const pc = createPeerConnection();
      peerConnection.current = pc;

      // 2. Get Room Ref
      const roomRef = doc(db, 'rooms', joinId);
      const roomSnapshot = await getDoc(roomRef);

      if (!roomSnapshot.exists()) {
        setStatus('Room not found');
        return;
      }

      // 3. Handle ICE Candidates: Save callee's candidates to 'calleeCandidates' subcollection
      const calleeCandidatesCollection = collection(roomRef, 'calleeCandidates');
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(calleeCandidatesCollection, event.candidate.toJSON());
        }
      };

      // 4. Set Remote Description (Offer from Caller)
      const data = roomSnapshot.data();
      const offer = data?.offer;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // 5. Create Answer
      const answerDescription = await pc.createAnswer();
      await pc.setLocalDescription(answerDescription);

      // 6. Save Answer to Firestore
      const roomWithAnswer = {
        answer: {
          type: answerDescription.type,
          sdp: answerDescription.sdp,
        },
      };
      await updateDoc(roomRef, roomWithAnswer);

      // 7. Listen for Caller ICE Candidates
      const callerCandidatesCollection = collection(roomRef, 'callerCandidates');
      onSnapshot(callerCandidatesCollection, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            await pc.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });

      setRoomId(joinId);
      setStatus('Connected!');
    } catch (err) {
      console.error(err);
      setStatus(`Error joining room: ${(err as Error).message}`);
    }
  };

  // Update remote video ref when stream changes
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="flex flex-col items-center p-10 min-h-screen bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-8">WebRTC Fire Demo</h1>
      
      <div className="flex gap-4 mb-8">
        <button 
          onClick={createRoom} 
          disabled={status !== 'Idle' && status !== 'Error: Could not access camera/mic'}
          className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-semibold disabled:opacity-50"
        >
          Create Room
        </button>
        
        <div className="flex">
          <input 
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="Enter Room ID"
            className="px-4 py-2 rounded-l-lg bg-gray-800 border border-gray-700 focus:outline-none"
          />
          <button 
            onClick={joinRoom}
            disabled={status !== 'Idle' && status !== 'Error: Could not access camera/mic'}
            className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-r-lg font-semibold disabled:opacity-50"
          >
            Join
          </button>
        </div>
      </div>

      <p className="mb-8 text-xl text-yellow-400">Status: {status}</p>

      {roomId && (
        <div className="mb-8 bg-gray-800 p-4 rounded-lg">
          <p className="text-gray-400 text-sm mb-1">Room ID (share this):</p>
          <p className="font-mono text-xl select-all">{roomId}</p>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-8 w-full max-w-6xl">
        <div className="relative group">
          <h3 className="absolute top-4 left-4 z-10 bg-black/50 px-2 py-1 rounded">You</h3>
          <video 
            ref={localVideoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-[500px] h-[375px] bg-black rounded-xl border-2 border-gray-700 object-cover"
          />
        </div>
        
        <div className="relative group">
          <h3 className="absolute top-4 left-4 z-10 bg-black/50 px-2 py-1 rounded">Remote</h3>
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="w-[500px] h-[375px] bg-black rounded-xl border-2 border-gray-700 object-cover"
          />
        </div>
      </div>
    </div>
  );
}
