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
  deleteDoc,
} from 'firebase/firestore';

// ... (keep iceServers same)
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
  const [availableRooms, setAvailableRooms] = useState<{ id: string; name: string }[]>([]);

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

  // Subscribe to available rooms (Lobby)
  useEffect(() => {
    const roomsCollection = collection(db, 'rooms');
    const unsubscribe = onSnapshot(roomsCollection, (snapshot) => {
      const rooms: { id: string; name: string }[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Only show rooms that are waiting for an answer (not full)
        if (data.offer && !data.answer) {
          rooms.push({ id: doc.id, name: `Room ${doc.id.slice(0, 5)}...` });
        }
      });
      setAvailableRooms(rooms);
    });

    return () => unsubscribe();
  }, []);

  // ... (keep createPeerConnection same)

  // ... (keep createPeerConnection implementation hidden for brevity, assume it is same)
  // Helper: Create Peer Connection
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(iceServers);

    pc.onicecandidate = (event) => {
      // Logic handled in specific functions
      console.log('New ICE candidate:', event.candidate);
    };

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

    localStream?.getTracks().forEach((track) => {
      pc.addTrack(track, localStream!);
    });

    return pc;
  };

  const cleanup = () => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    setRemoteStream(null);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  const hangUp = async () => {
    cleanup();
    setStatus('Hung up');
    
    // Delete room if we have an ID
    if (roomId) {
      try {
        await deleteDoc(doc(db, 'rooms', roomId));
        console.log('Room deleted');
      } catch (e) {
        console.error('Error deleting room:', e);
      }
      setRoomId('');
    }
    
    // Ideally, we would reload window or reset state completely to start over
    window.location.reload();
  };

  // --- CREATE ROOM (Caller) ---
  const createRoom = async () => {
    setStatus('Creating Room...');
    try {
      const pc = createPeerConnection();
      peerConnection.current = pc;

      const roomRef = doc(collection(db, 'rooms'));
      const callerCandidatesCollection = collection(roomRef, 'callerCandidates');
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(callerCandidatesCollection, event.candidate.toJSON());
        }
      };

      const offerDescription = await pc.createOffer();
      await pc.setLocalDescription(offerDescription);

      const roomWithOffer = {
        offer: {
          type: offerDescription.type,
          sdp: offerDescription.sdp,
        },
      };
      await setDoc(roomRef, roomWithOffer);
      setRoomId(roomRef.id);
      setStatus('Waiting for someone to join...');

      onSnapshot(roomRef, (snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
          const answer = new RTCSessionDescription(data.answer);
          pc.setRemoteDescription(answer);
          setStatus('Connected!');
        }
      });

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
  const joinRoom = async (idToJoin?: string) => {
    const currentJoinId = idToJoin || joinId;
    if (!currentJoinId) return;
    setStatus('Joining Room...');
    try {
      const pc = createPeerConnection();
      peerConnection.current = pc;

      const roomRef = doc(db, 'rooms', currentJoinId);
      const roomSnapshot = await getDoc(roomRef);

      if (!roomSnapshot.exists()) {
        setStatus('Room not found');
        return;
      }

      const calleeCandidatesCollection = collection(roomRef, 'calleeCandidates');
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(calleeCandidatesCollection, event.candidate.toJSON());
        }
      };

      const data = roomSnapshot.data();
      const offer = data?.offer;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answerDescription = await pc.createAnswer();
      await pc.setLocalDescription(answerDescription);

      const roomWithAnswer = {
        answer: {
          type: answerDescription.type,
          sdp: answerDescription.sdp,
        },
      };
      await updateDoc(roomRef, roomWithAnswer);

      const callerCandidatesCollection = collection(roomRef, 'callerCandidates');
      onSnapshot(callerCandidatesCollection, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            await pc.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });

      setRoomId(currentJoinId);
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
      
      <div className="flex flex-col gap-4 mb-8 w-full max-w-md">
        <div className="flex gap-4 justify-center">
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
              onClick={() => joinRoom()}
              disabled={status !== 'Idle' && status !== 'Error: Could not access camera/mic'}
              className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-r-lg font-semibold disabled:opacity-50"
            >
              Join
            </button>
          </div>
        </div>

        {roomId && (
          <button 
            onClick={hangUp}
            className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg font-semibold w-full"
          >
            Hang Up
          </button>
        )}

        {!roomId && availableRooms.length > 0 && (
          <div className="mt-4 w-full">
            <h3 className="text-gray-400 mb-2 text-center text-sm">Available Rooms (Click to Join):</h3>
            <div className="flex flex-col gap-2">
              {availableRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => joinRoom(room.id)}
                  className="bg-gray-800 hover:bg-gray-700 p-3 rounded-lg border border-gray-700 text-left flex justify-between items-center transition-colors"
                >
                  <span className="font-mono">{room.name}</span>
                  <span className="text-xs bg-green-900 text-green-300 px-2 py-1 rounded">Open</span>
                </button>
              ))}
            </div>
          </div>
        )}
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

