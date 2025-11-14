import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { io, type Socket } from "socket.io-client";
import { useAppSelector } from "@/store/hooks";
import { Button } from "@/components/ui/button";
import {
  Music,
  Play,
  Pause,
  Disc3,
  Users,
  Clock,
  ExternalLink,
} from "lucide-react";
import axios from "axios";
import {
  extractAverageColor,
  getVibrantColor,
  rgbToHex,
  getContrastingTextColor,
} from "@/lib/colorExtractor";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

interface PlaybackUpdate {
  isPlaying: boolean;
  progress?: number;
  duration?: number;
  track?: {
    name: string;
    artists: string;
    album: string;
    image: string;
    uri: string;
  };
  timestamp?: number;
  estimated?: boolean;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { images: Array<{ url: string }> };
  external_urls: { spotify: string };
  uri: string;
}

interface SpotifyArtist {
  id: string;
  name: string;
  images: Array<{ url: string }>;
  external_urls: { spotify: string };
  uri: string;
}

export default function GeneratePage() {
  const navigate = useNavigate();
  const { session } = useAppSelector((state) => state.auth);
  const [playback, setPlayback] = useState<PlaybackUpdate | null>(null);
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [recentlyPlayed, setRecentlyPlayed] = useState<SpotifyTrack[]>([]);
  const [topArtists, setTopArtists] = useState<SpotifyArtist[]>([]);
  const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [accentColor, setAccentColor] = useState<string>("#1DB954");
  const [accentTextColor, setAccentTextColor] = useState<string>("#ffffff");
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());
  const playbackRef = useRef<PlaybackUpdate | null>(null);

  useEffect(() => {
    if (!session) {
      navigate({ to: "/" });
      return;
    }
  }, [session, navigate]);

  const fetchLyrics = async (artist: string, track: string) => {
    try {
      const response = await axios.get(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(track)}`
      );
      if (response.data.lyrics) {
        setLyrics(response.data.lyrics);
      } else {
        setLyrics(null);
      }
    } catch (error) {
      console.error("Error fetching lyrics:", error);
      setLyrics(null);
    }
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_BASE_URL}/api/data`, {
          params: { session },
        });

        if (response.data.recentlyPlayed) {
          setRecentlyPlayed(response.data.recentlyPlayed.slice(0, 6));
        }
        if (response.data.topArtists) {
          setTopArtists(response.data.topArtists.slice(0, 6));
        }
        if (response.data.topTracks) {
          setTopTracks(response.data.topTracks.slice(0, 5));
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
      } finally {
        setLoading(false);
      }
    };

    if (session) {
      fetchUserData();
    }
  }, [session]);

  useEffect(() => {
    const animate = () => {
      if (playbackRef.current?.isPlaying) {
        const now = Date.now();
        const timeSinceUpdate = now - lastUpdateRef.current;

        if (playbackRef.current.progress !== undefined) {
          const newProgress = playbackRef.current.progress + timeSinceUpdate;
          const maxProgress = playbackRef.current.duration || newProgress;
          const clampedProgress = Math.min(newProgress, maxProgress);
          setSmoothProgress(clampedProgress);
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    const newSocket = io(API_BASE_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    newSocket.on("connect", () => {
      console.log("Connected to WebSocket");
      newSocket.emit("start-playback-sync", { session });
    });

    newSocket.on("playback-update", (data: PlaybackUpdate) => {
      playbackRef.current = data;
      setPlayback(data);
      setSmoothProgress(data.progress || 0);
      lastUpdateRef.current = Date.now();
      setError(null);

      if (data.track) {
        fetchLyrics(data.track.artists, data.track.name);
        if (data.track.image) {
          extractAverageColor(data.track.image).then((rgb) => {
            const vibrantRgb = getVibrantColor(rgb);
            const hexColor = rgbToHex(vibrantRgb.r, vibrantRgb.g, vibrantRgb.b);
            const textColor = getContrastingTextColor(vibrantRgb);
            setAccentColor(hexColor);
            setAccentTextColor(textColor);
          });
        }
      }
    });

    newSocket.on("error", (err: { message: string; needsReauth?: boolean }) => {
      console.error("Socket error:", err.message);
      if (err.needsReauth) {
        navigate({ to: "/" });
      }
      setError(err.message);
    });

    newSocket.on("disconnect", () => {
      console.log("Disconnected from WebSocket");
    });

    setSocket(newSocket);

    return () => {
      if (newSocket.connected) {
        newSocket.emit("stop-playback-sync");
        newSocket.disconnect();
      }
    };
  }, [session, navigate]);

  const handleBackToLogin = () => {
    if (socket?.connected) {
      socket.emit("stop-playback-sync");
      socket.disconnect();
    }
    navigate({ to: "/" });
  };

  const formatTime = (ms: number | undefined): string => {
    if (!ms) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const spotifyURIToURL = (uri: string): string => {
    return uri
      .replace("spotify:", "https://open.spotify.com/")
      .replace(/:/g, "/");
  };

  const handleOpenSpotify = (uri: string) => {
    window.open(spotifyURIToURL(uri), "_blank");
  };

  return (
    <div className="min-h-screen bg-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-white">Your Music</h1>
            <p className="text-sm text-gray-400 mt-1">Currently playing from Spotify</p>
          </div>
          <Button
            onClick={handleBackToLogin}
            size="sm"
            className="bg-gray-900 text-white border border-gray-800 hover:bg-gray-800"
          >
            Back
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900 bg-opacity-20 border border-red-700 rounded-lg">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center space-y-4">
              <Disc3 className="h-12 w-12 text-white mx-auto animate-spin opacity-50" />
              <p className="text-gray-400">Loading your music data...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {playback?.track ? (
                <div className="bg-gray-900 rounded-2xl p-8 space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        ► NOW PLAYING
                      </p>
                      <h2 className="text-3xl md:text-5xl font-black text-white leading-tight">
                        {playback.track.name}
                      </h2>
                      <p className="text-lg text-gray-300">
                        {playback.track.artists}
                      </p>
                      <p className="text-sm text-gray-500">
                        {playback.track.album}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {playback.isPlaying ? (
                        <Pause className="h-8 w-8 text-white" />
                      ) : (
                        <Play className="h-8 w-8 text-gray-500" />
                      )}
                    </div>
                  </div>

                  {playback.track.image && (
                    <div className="flex justify-center">
                      <div
                        className="relative cursor-pointer group"
                        onClick={() => handleOpenSpotify(playback.track?.uri || "")}
                      >
                        <img
                          src={playback.track.image}
                          alt={playback.track.name}
                          className="w-64 h-64 rounded-2xl shadow-2xl object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-30 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ExternalLink className="h-10 w-10 text-white" />
                        </div>
                      </div>
                    </div>
                  )}

                  {playback.progress !== undefined && playback.duration && (
                    <div className="space-y-3">
                      <div className="w-full bg-gray-800 rounded-full h-1 overflow-hidden">
                        <div
                          className="h-1 rounded-full transition-all"
                          style={{
                            width: `${(smoothProgress / playback.duration) * 100}%`,
                            backgroundColor: accentColor,
                            willChange: "width",
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 font-semibold">
                        <span>{formatTime(smoothProgress)}</span>
                        <span>{formatTime(playback.duration)}</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => handleOpenSpotify(playback.track?.uri || "")}
                    className="w-full font-bold py-3 rounded-full transition-all text-black hover:opacity-90"
                    style={{
                      backgroundColor: accentColor,
                    }}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <ExternalLink className="h-4 w-4" />
                      Open in Spotify
                    </div>
                  </button>
                </div>
              ) : (
                <div className="bg-gray-900 rounded-2xl p-8 text-center space-y-3">
                  <Music className="h-12 w-12 text-gray-700 mx-auto" />
                  <p className="text-gray-500">No track currently playing</p>
                </div>
              )}

              <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: accentColor }}>
                <div className="p-8 space-y-4">
                  <div className="flex items-center gap-2">
                    <Music className="h-5 w-5" style={{ color: accentTextColor }} />
                    <h3 className="text-lg font-bold" style={{ color: accentTextColor }}>
                      LYRICS
                    </h3>
                  </div>

                  <div className="bg-black bg-opacity-20 rounded-xl p-6 max-h-96 overflow-y-auto">
                    {lyrics ? (
                      <p
                        className="text-sm leading-relaxed whitespace-pre-wrap font-medium"
                        style={{ color: accentTextColor }}
                      >
                        {lyrics}
                      </p>
                    ) : (
                      <p
                        className="text-center py-8 text-sm opacity-75"
                        style={{ color: accentTextColor }}
                      >
                        Lyrics not available for this track
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 rounded-2xl p-8 space-y-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-white" />
                  <h3 className="text-lg font-bold text-white uppercase tracking-widest">
                    Recently Played
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {recentlyPlayed.map((track) => (
                    <div
                      key={track.id}
                      className="group cursor-pointer bg-gray-800 hover:bg-gray-700 rounded-xl p-4 transition-all space-y-3"
                      onClick={() => handleOpenSpotify(track.uri)}
                    >
                      {track.album.images[0] && (
                        <div className="relative">
                          <img
                            src={track.album.images[0].url}
                            alt={track.name}
                            className="w-full aspect-square object-cover rounded-lg group-hover:opacity-80 transition-opacity"
                          />
                          <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 rounded-lg transition-opacity flex items-center justify-center">
                            <ExternalLink className="h-6 w-6 text-white opacity-0 group-hover:opacity-100" />
                          </div>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {track.name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {track.artists[0]?.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-gray-900 rounded-2xl p-8 space-y-6">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-white" />
                  <h3 className="text-lg font-bold text-white uppercase tracking-widest">
                    Top Artists
                  </h3>
                </div>

                <div className="space-y-3">
                  {topArtists.map((artist) => (
                    <div
                      key={artist.id}
                      className="group cursor-pointer flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-all"
                      onClick={() => handleOpenSpotify(artist.uri)}
                    >
                      {artist.images[0] && (
                        <img
                          src={artist.images[0].url}
                          alt={artist.name}
                          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {artist.name}
                        </p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-gray-500 group-hover:text-white transition-colors flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 rounded-2xl p-8 space-y-6">
                <div className="flex items-center gap-2">
                  <Disc3 className="h-5 w-5 text-white" />
                  <h3 className="text-lg font-bold text-white uppercase tracking-widest">
                    Top Tracks
                  </h3>
                </div>

                <div className="space-y-2">
                  {topTracks.map((track, index) => (
                    <div
                      key={track.id}
                      className="group cursor-pointer flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-all"
                      onClick={() => handleOpenSpotify(track.uri)}
                    >
                      <span className="text-xs font-black text-gray-500 w-5 text-center">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {track.name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {track.artists[0]?.name}
                        </p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-gray-500 group-hover:text-white transition-colors flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
