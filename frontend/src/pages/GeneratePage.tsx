import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { io, type Socket } from "socket.io-client";
import { useAppSelector } from "@/store/hooks";
import { useTheme } from "next-themes";
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

const LyricsViewer = ({
  lyrics = "",
  accentColor = "#243b1d",
  currentLine = 0,
}: {
  lyrics?: string;
  accentColor?: string;
  currentLine?: number;
}) => {
  const [activeLineIndex, setActiveLineIndex] = useState(currentLine);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lyricsThumbRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const updateLyricsThumb = (
    scrollEl: HTMLDivElement | null,
    thumbEl: HTMLDivElement | null
  ) => {
    if (!scrollEl || !thumbEl) return;
    const visible = scrollEl.clientHeight;
    const total = scrollEl.scrollHeight;
    if (total <= visible) {
      thumbEl.classList.remove("scrollbar-visible");
      return;
    }
    thumbEl.classList.add("scrollbar-visible");
    const ratio = visible / total;
    const thumbHeight = Math.max(24, Math.floor(visible * ratio));
    const maxTop = visible - thumbHeight;
    const scrollRatio = scrollEl.scrollTop / (total - visible);
    const top = Math.round(scrollRatio * maxTop);
    thumbEl.style.height = thumbHeight + "px";
    thumbEl.style.top = top + "px";
  };

  const attachLyricsDrag = (
    scrollEl: HTMLDivElement | null,
    thumbEl: HTMLDivElement | null
  ) => {
    if (!scrollEl || !thumbEl) return;
    let dragging = false;
    let startY = 0;
    let startScroll = 0;

    const onPointerDown = (e: MouseEvent | PointerEvent | TouchEvent) => {
      e.preventDefault();
      dragging = true;
      thumbEl.classList.add("dragging");
      if (e instanceof TouchEvent) {
        startY = e.touches[0].clientY;
      } else if ("clientY" in e) {
        startY = (e as MouseEvent).clientY;
      }
      startScroll = scrollEl.scrollTop;
      document.addEventListener("pointermove", onPointerMove as any);
      document.addEventListener("pointerup", onPointerUp as any);
      document.addEventListener(
        "touchmove",
        onPointerMove as any,
        { passive: false } as any
      );
      document.addEventListener("touchend", onPointerUp as any);
    };

    const onPointerMove = (ev: any) => {
      if (!dragging) return;
      ev.preventDefault();
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const delta = clientY - startY;
      const visible = scrollEl.clientHeight;
      const total = scrollEl.scrollHeight;
      const ratio = visible / total;
      const thumbHeight = Math.max(24, Math.floor(visible * ratio));
      const maxThumbTop = Math.max(1, visible - thumbHeight);
      const scrollable = Math.max(1, total - visible);
      const scrollDelta = (delta / maxThumbTop) * scrollable;
      const newScrollTop = Math.min(
        Math.max(0, startScroll + scrollDelta),
        scrollable
      );
      scrollEl.scrollTop = newScrollTop;

      const scrollRatio = newScrollTop / scrollable;
      const top = Math.round(scrollRatio * maxThumbTop);
      thumbEl.style.top = top + "px";
    };

    const onPointerUp = () => {
      dragging = false;
      thumbEl.classList.remove("dragging");
      document.removeEventListener("pointermove", onPointerMove as any);
      document.removeEventListener("pointerup", onPointerUp as any);
      document.removeEventListener("touchmove", onPointerMove as any);
      document.removeEventListener("touchend", onPointerUp as any);
    };

    thumbEl.addEventListener("pointerdown", onPointerDown as any);
    thumbEl.addEventListener(
      "touchstart",
      onPointerDown as any,
      { passive: false } as any
    );

    return () => {
      thumbEl.removeEventListener("pointerdown", onPointerDown as any);
      thumbEl.removeEventListener("touchstart", onPointerDown as any);
    };
  };

  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    const thumbEl = lyricsThumbRef.current;
    if (scrollEl && thumbEl) {
      const onScroll = () => updateLyricsThumb(scrollEl, thumbEl);
      const onResize = () => updateLyricsThumb(scrollEl, thumbEl);
      scrollEl.addEventListener("scroll", onScroll);
      window.addEventListener("resize", onResize);

      updateLyricsThumb(scrollEl, thumbEl);
      return () => {
        scrollEl.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
      };
    }
  }, []);

  useEffect(() => {
    const lyricsCleanup = attachLyricsDrag(
      scrollContainerRef.current,
      lyricsThumbRef.current
    );
    return () => {
      if (typeof lyricsCleanup === "function") lyricsCleanup();
    };
  }, []);

  const defaultLyricsText = `


Looks like you have to guess the lyrics for this song.\n

`;

  const lyricsText = lyrics || defaultLyricsText;
  const linesArray = lyricsText.split("\n");

  useEffect(() => {
    setActiveLineIndex(currentLine);
  }, [currentLine]);

  useEffect(() => {
    if (
      activeLineIndex >= 0 &&
      lineRefs.current[activeLineIndex] &&
      scrollContainerRef.current
    ) {
      const container = scrollContainerRef.current;
      const activeElement = lineRefs.current[activeLineIndex];

      if (activeElement) {
        const containerHeight = container.clientHeight;
        const elementTop = activeElement.offsetTop;
        const elementHeight = activeElement.clientHeight;

        container.scrollTo({
          top: elementTop - containerHeight / 2 + elementHeight / 2,
          behavior: "smooth",
        });
      }
    }
  }, [activeLineIndex]);

  const adjustSaturation = (color: string, amount: number): string => {
    const hex = color.replace("#", "");
    let r = parseInt(hex.substr(0, 2), 16);
    let g = parseInt(hex.substr(2, 2), 16);
    let b = parseInt(hex.substr(4, 2), 16);

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const avg = (max + min) / 2;

    r = Math.round(r + (avg - r) * amount);
    g = Math.round(g + (avg - g) * amount);
    b = Math.round(b + (avg - b) * amount);

    return `rgb(${r}, ${g}, ${b})`;
  };

  const getLineClasses = (text: string, index: number): string => {
    const isEmpty = text.trim() === "";
    const baseClasses =
      "py-1 px-8 transition-all duration-300 text-center leading-relaxed select-none";

    if (isEmpty) {
      return `${baseClasses} opacity-0 pointer-events-none`;
    }

    if (index === activeLineIndex) {
      return `${baseClasses} text-white text-5xl font-extrabold opacity-100`;
    }

    if (index < activeLineIndex) {
      return `${baseClasses} text-white/70 text-5xl font-extrabold opacity-50 cursor-pointer hover:opacity-70`;
    }

    return `${baseClasses} text-[#bad5b1] text-5xl font-extrabold opacity-40 cursor-pointer hover:opacity-60`;
  };

  const gradientColor1 = adjustSaturation(accentColor, 0.3);
  const gradientColor2 = adjustSaturation(accentColor, -0.2);

  return (
    <div
      className="w-full max-w-4xl mx-auto rounded-3xl shadow-2xl overflow-hidden relative backdrop-blur-xl"
      style={{
        background: `linear-gradient(135deg, ${gradientColor1} 0%, ${accentColor} 50%, ${gradientColor2} 100%)`,
      }}
    >
      <div
        className="absolute inset-0 backdrop-blur-3xl opacity-60 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 30% 50%, ${adjustSaturation(
            accentColor,
            0.5
          )} 0%, transparent 50%),
                     radial-gradient(circle at 70% 50%, ${adjustSaturation(
                       accentColor,
                       -0.3
                     )} 0%, transparent 50%)`,
        }}
      />

      <div
        className="absolute top-0 left-0 right-0 h-32 pointer-events-none z-20"
        style={{
          background: `linear-gradient(to bottom, ${accentColor}, transparent)`,
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none z-20"
        style={{
          background: `linear-gradient(to top, ${accentColor}, transparent)`,
        }}
      />

      <div className="custom-scroll-wrapper h-[500px] relative">
        <div
          ref={scrollContainerRef}
          className="relative overflow-y-auto overflow-x-hidden h-full custom-scroll z-10"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          <div className="py-5 px-3 min-h-full">
            {linesArray.map((line, index) => (
              <div
                key={index}
                ref={(el) => {
                  lineRefs.current[index] = el;
                }}
                className={getLineClasses(line, index)}
                onClick={() => {
                  if (line.trim() !== "") {
                    setActiveLineIndex(index);
                  }
                }}
              >
                {line || "\u00A0"}
              </div>
            ))}
          </div>
        </div>

        <div
          ref={lyricsThumbRef}
          className="custom-scrollbar-thumb"
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

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
  const { theme } = useTheme();
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
  const currentTrackUriRef = useRef<string | null>(null);
  const dataFetchedRef = useRef<boolean>(false);
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
      const response = await axios.get(`${API_BASE_URL}/api/lyrics`, {
        params: {
          songname: track,
          artist: artist,
        },
      });
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
      if (dataFetchedRef.current) return;
      dataFetchedRef.current = true;

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

    if (session && !dataFetchedRef.current) {
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

      if (data.track && data.track.uri !== currentTrackUriRef.current) {
        currentTrackUriRef.current = data.track.uri;
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
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-foreground">
              Your Music
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Currently playing from Spotify
            </p>
          </div>
          <Button
            onClick={handleBackToLogin}
            size="sm"
            className="bg-muted text-muted-foreground border border-border hover:bg-accent"
          >
            Back
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/20 border border-destructive rounded-lg">
            <p className="text-sm text-destructive-foreground">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center space-y-4">
              <Disc3 className="h-12 w-12 text-muted-foreground mx-auto animate-spin opacity-50" />
              <p className="text-muted-foreground">
                Loading your music data...
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {playback?.track ? (
                <div className="bg-card rounded-2xl p-8 space-y-6 shadow-lg">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        ► NOW PLAYING
                      </p>
                      <h2 className="text-3xl md:text-5xl font-black text-foreground leading-tight">
                        {playback.track.name}
                      </h2>
                      <p className="text-lg text-muted-foreground">
                        {playback.track.artists}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {playback.track.album}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {playback.isPlaying ? (
                        <Pause className="h-8 w-8 text-foreground" />
                      ) : (
                        <Play className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {playback.track.image && (
                    <div className="flex justify-center">
                      <div
                        className="relative cursor-pointer group"
                        onClick={() =>
                          handleOpenSpotify(playback.track?.uri || "")
                        }
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
                      <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                        <div
                          className="h-1 rounded-full transition-all"
                          style={{
                            width: `${
                              (smoothProgress / playback.duration) * 100
                            }%`,
                            backgroundColor: accentColor,
                            willChange: "width",
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground font-semibold">
                        <span>{formatTime(smoothProgress)}</span>
                        <span>{formatTime(playback.duration)}</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => handleOpenSpotify(playback.track?.uri || "")}
                    className="w-full font-bold py-3 rounded-full transition-all text-white hover:opacity-90"
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
                <div className="bg-card rounded-2xl p-8 text-center space-y-3 shadow-lg">
                  <Music className="h-12 w-12 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">
                    No track currently playing
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center gap-2 px-4">
                  <Music
                    className="h-5 w-5"
                    style={{ color: accentTextColor }}
                  />
                  <h3
                    className="text-xl font-bold"
                    style={{ color: accentTextColor }}
                  >
                    LYRICS
                  </h3>
                </div>

                <LyricsViewer
                  lyrics={lyrics || undefined}
                  accentColor={accentColor}
                  currentLine={0}
                />
              </div>

              <div className="bg-card rounded-2xl p-8 space-y-6 shadow-lg">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-foreground" />
                  <h3 className="text-xl font-bold text-foreground uppercase tracking-widest">
                    Recently Played
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {recentlyPlayed.map((track) => (
                    <div
                      key={track.id}
                      className={`group cursor-pointer rounded-xl p-4 transition-all space-y-3 ${
                        theme === "light"
                          ? "bg-gray-50 hover:bg-gray-200 hover:shadow-md"
                          : "bg-muted hover:bg-muted/80"
                      }`}
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
                        <p className="text-sm font-bold text-foreground truncate">
                          {track.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {track.artists[0]?.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-card rounded-2xl p-8 space-y-6 shadow-lg">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-foreground" />
                  <h3 className="text-xl font-bold text-foreground uppercase tracking-widest">
                    Top Artists
                  </h3>
                </div>

                <div className="space-y-3">
                  {topArtists.map((artist) => (
                    <div
                      key={artist.id}
                      className={`group cursor-pointer flex items-center gap-3 p-3 rounded-xl transition-all ${
                        theme === "light"
                          ? "bg-gray-50 hover:bg-gray-200 hover:shadow-sm"
                          : "bg-muted hover:bg-muted/80"
                      }`}
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
                        <p className="text-sm font-bold text-foreground truncate">
                          {artist.name}
                        </p>
                      </div>
                      <ExternalLink
                        className={`h-4 w-4 transition-colors flex-shrink-0 ${
                          theme === "light"
                            ? "text-gray-500 group-hover:text-gray-700"
                            : "text-muted-foreground group-hover:text-foreground"
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card rounded-2xl p-8 space-y-6 shadow-lg">
                <div className="flex items-center gap-2">
                  <Disc3 className="h-5 w-5 text-foreground" />
                  <h3 className="text-xl font-bold text-foreground uppercase tracking-widest">
                    Top Tracks
                  </h3>
                </div>

                <div className="space-y-2">
                  {topTracks.map((track, index) => (
                    <div
                      key={track.id}
                      className={`group cursor-pointer flex items-center gap-3 p-3 rounded-lg transition-all ${
                        theme === "light"
                          ? "bg-gray-50 hover:bg-gray-200 hover:shadow-sm"
                          : "bg-muted hover:bg-muted/80"
                      }`}
                      onClick={() => handleOpenSpotify(track.uri)}
                    >
                      <span
                        className={`text-xs font-black w-5 text-center ${
                          theme === "light"
                            ? "text-gray-500"
                            : "text-muted-foreground"
                        }`}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">
                          {track.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {track.artists[0]?.name}
                        </p>
                      </div>
                      <ExternalLink
                        className={`h-4 w-4 transition-colors flex-shrink-0 ${
                          theme === "light"
                            ? "text-gray-500 group-hover:text-gray-700"
                            : "text-muted-foreground group-hover:text-foreground"
                        }`}
                      />
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
