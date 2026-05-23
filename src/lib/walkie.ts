import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Listener = (state: WalkieState) => void;

export interface Peer {
  id: string;
  name: string;
  speaking: boolean;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
}

export interface WalkieState {
  connected: boolean;
  channel: string;
  myId: string;
  myName: string;
  peers: Map<string, { name: string; speaking: boolean }>;
  transmitting: boolean;
  lastError?: string;
}

const ICE: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export class Walkie {
  private rt: RealtimeChannel | null = null;
  private peers = new Map<string, Peer>();
  private localStream: MediaStream | null = null;
  private listeners = new Set<Listener>();
  private state: WalkieState = {
    connected: false,
    channel: "",
    myId: crypto.randomUUID(),
    myName: "",
    peers: new Map(),
    transmitting: false,
  };

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.state);
    return () => this.listeners.delete(l);
  }

  private emit() {
    const snap: WalkieState = { ...this.state, peers: new Map(this.state.peers) };
    this.listeners.forEach((l) => l(snap));
  }

  private syncPeers() {
    this.state.peers.clear();
    for (const [id, p] of this.peers) {
      this.state.peers.set(id, { name: p.name, speaking: p.speaking });
    }
  }

  async join(channelName: string, displayName: string) {
    await this.leave();
    this.state.channel = channelName;
    this.state.myName = displayName;
    this.state.lastError = undefined;

    // Acquire mic up-front (needs HTTPS + user gesture)
    try {
      const md =
        (typeof navigator !== "undefined" && navigator.mediaDevices) ||
        // legacy / webview fallbacks
        ((): MediaDevices | undefined => {
          type LegacyGUM = (
            c: MediaStreamConstraints,
            s: (s: MediaStream) => void,
            e: (e: unknown) => void,
          ) => void;
          const n = navigator as unknown as {
            getUserMedia?: LegacyGUM;
            webkitGetUserMedia?: LegacyGUM;
            mozGetUserMedia?: LegacyGUM;
          };
          const legacy = n.getUserMedia || n.webkitGetUserMedia || n.mozGetUserMedia;
          if (!legacy) return undefined;
          return {
            getUserMedia: (c: MediaStreamConstraints) =>
              new Promise<MediaStream>((res, rej) => legacy.call(navigator, c, res, rej)),
          } as MediaDevices;
        })();

      if (!md || !md.getUserMedia) {
        const insecure = typeof window !== "undefined" && window.location.protocol !== "https:" && window.location.hostname !== "localhost";
        throw new Error(
          insecure
            ? "Microphone requires HTTPS. Open this site over https:// or use localhost."
            : "Microphone API not available. If you're inside an in-app browser (Facebook, Instagram, TikTok), tap the ••• menu and choose 'Open in Chrome/Safari'.",
        );
      }

      this.localStream = await md
        .getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        .catch(async (e) => {
          const err = e as { name?: string };
          // Mic busy → wait briefly and retry once with a minimal constraint set
          if (err?.name === "NotReadableError" || err?.name === "AbortError") {
            await new Promise((r) => setTimeout(r, 700));
            return md.getUserMedia({ audio: true });
          }
          throw e;
        });
      // Start muted
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = false));
    } catch (e) {
      const err = e as { name?: string; message?: string };
      let msg = err.message || "Could not access microphone";
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        msg = "Microphone permission denied. Enable it in your browser site settings and reload.";
      } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        msg = "No microphone detected on this device.";
      } else if (err.name === "NotReadableError" || err.name === "AbortError") {
        msg = "Microphone is busy in another app or tab. Close other apps using the mic (Zoom, Meet, WhatsApp, other browser tabs), then try Join again.";
      }
      this.state.lastError = msg;
      this.emit();
      throw new Error(msg);
    }

    const channelKey = `walkie:${channelName.trim().toLowerCase()}`;
    this.rt = supabase.channel(channelKey, {
      config: { presence: { key: this.state.myId } },
    });

    this.rt
      .on("presence", { event: "sync" }, () => {
        const all = this.rt!.presenceState() as Record<string, Array<{ name: string; id: string }>>;
        const ids = new Set<string>();
        for (const [, metas] of Object.entries(all)) {
          for (const m of metas) {
            if (m.id !== this.state.myId) ids.add(m.id);
          }
        }
        // Remove gone peers
        for (const [id] of this.peers) {
          if (!ids.has(id)) this.removePeer(id);
        }
        // Add new peers (deterministic: lower id initiates)
        for (const [, metas] of Object.entries(all)) {
          for (const m of metas) {
            if (m.id === this.state.myId) continue;
            if (!this.peers.has(m.id)) {
              this.addPeer(m.id, m.name, this.state.myId < m.id);
            } else {
              const p = this.peers.get(m.id)!;
              if (p.name !== m.name) {
                p.name = m.name;
              }
            }
          }
        }
        this.syncPeers();
        this.emit();
      })
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        this.handleSignal(payload as SignalMsg);
      })
      .on("broadcast", { event: "speaking" }, ({ payload }) => {
        const { from, speaking } = payload as { from: string; speaking: boolean };
        const p = this.peers.get(from);
        if (p) {
          p.speaking = speaking;
          this.syncPeers();
          this.emit();
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await this.rt!.track({ id: this.state.myId, name: this.state.myName });
          this.state.connected = true;
          this.emit();
        }
      });
  }

  private addPeer(id: string, name: string, initiator: boolean) {
    const pc = new RTCPeerConnection(ICE);
    const audio = new Audio();
    audio.autoplay = true;
    (audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true;

    this.localStream?.getAudioTracks().forEach((t) => pc.addTrack(t, this.localStream!));

    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0];
      audio.play().catch(() => {});
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send({ kind: "ice", to: id, from: this.state.myId, candidate: e.candidate.toJSON() });
      }
    };

    const peer: Peer = { id, name, speaking: false, pc, audio };
    this.peers.set(id, peer);

    if (initiator) {
      (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.send({ kind: "offer", to: id, from: this.state.myId, sdp: offer });
      })();
    }
  }

  private removePeer(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.audio.srcObject = null;
    this.peers.delete(id);
  }

  private async handleSignal(msg: SignalMsg) {
    if (msg.to !== this.state.myId) return;
    let p = this.peers.get(msg.from);
    if (!p && msg.kind === "offer") {
      this.addPeer(msg.from, "…", false);
      p = this.peers.get(msg.from)!;
    }
    if (!p) return;

    if (msg.kind === "offer") {
      await p.pc.setRemoteDescription(msg.sdp);
      const answer = await p.pc.createAnswer();
      await p.pc.setLocalDescription(answer);
      this.send({ kind: "answer", to: msg.from, from: this.state.myId, sdp: answer });
    } else if (msg.kind === "answer") {
      await p.pc.setRemoteDescription(msg.sdp);
    } else if (msg.kind === "ice") {
      try {
        await p.pc.addIceCandidate(msg.candidate);
      } catch {
        /* ignore */
      }
    }
  }

  private send(msg: SignalMsg) {
    this.rt?.send({ type: "broadcast", event: "signal", payload: msg });
  }

  startTalking() {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = true));
    this.state.transmitting = true;
    this.rt?.send({
      type: "broadcast",
      event: "speaking",
      payload: { from: this.state.myId, speaking: true },
    });
    this.emit();
  }

  stopTalking() {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = false));
    this.state.transmitting = false;
    this.rt?.send({
      type: "broadcast",
      event: "speaking",
      payload: { from: this.state.myId, speaking: false },
    });
    this.emit();
  }

  async leave() {
    for (const [id] of this.peers) this.removePeer(id);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    if (this.rt) {
      await supabase.removeChannel(this.rt);
      this.rt = null;
    }
    this.state.connected = false;
    this.state.transmitting = false;
    this.state.peers.clear();
    this.emit();
  }
}

type SignalMsg =
  | { kind: "offer"; to: string; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; to: string; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; to: string; from: string; candidate: RTCIceCandidateInit };

export const walkie = new Walkie();
