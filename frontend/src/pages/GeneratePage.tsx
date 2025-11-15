import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { io, type Socket } from "socket.io-client";
import { useAppSelector } from "@/store/hooks";
import { useTheme } from "next-themes";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  lyrics = undefined,
  artist = "",
  trackName = "",
  accentColor = "#243b1d",
  currentLine = 0,
}: {
  lyrics?: string;
  artist?: string;
  trackName?: string;
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
    const thumbHeight = 200;

    const maxTop = Math.max(0, visible - thumbHeight);
    const scrollable = total - visible;

    if (scrollable <= 0) {
      thumbEl.style.top = "0px";
    } else {
      const scrollRatio = Math.min(
        1,
        Math.max(0, scrollEl.scrollTop / scrollable)
      );
      const top = Math.round(scrollRatio * maxTop);
      thumbEl.style.top = top + "px";
    }

    thumbEl.style.height = thumbHeight + "px";
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
      const thumbHeight = 200;
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

  const defaultLyricsText = useMemo(() => {
    const fallbackMessages = [
      "Looks like you have to guess the lyrics for this song.",
      "Hmm. We don't know the lyrics for this one.",
      "You caught us, we're still working on getting lyrics for this one.",
    ];

    const seed = (trackName + artist).split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

    const index = Math.abs(seed) % fallbackMessages.length;
    return fallbackMessages[index];
  }, [trackName, artist]);

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
    const fallbackLyrics =
      lyrics === undefined && defaultLyricsText && text.trim();
    const baseClasses =
      "py-1 px-8 transition-all duration-300 text-center leading-relaxed select-none";

    if (fallbackLyrics) {
      return `${baseClasses} text-[#bad5b1] text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold opacity-40 flex justify-center items-center min-h-[200px]`;
    }

    if (isEmpty) {
      return `${baseClasses} opacity-0 pointer-events-none`;
    }

    if (index === activeLineIndex) {
      return `${baseClasses} text-white text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold opacity-100`;
    }

    if (index < activeLineIndex) {
      return `${baseClasses} text-white/70 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold opacity-50 cursor-pointer hover:opacity-70`;
    }

    return `${baseClasses} text-[#bad5b1] text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold opacity-40 cursor-pointer hover:opacity-60`;
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
          <div className="py-5 px-3 min-h-full flex flex-col items-center justify-center">
            {lyrics ? (
              linesArray.map((line, index) => (
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
              ))
            ) : (
              <div className="text-[#bad5b1] text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold opacity-40 text-center">
                {defaultLyricsText}
              </div>
            )}
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
  import.meta.env.VITE_API_BASE_URL || "https://spotifycardgen.vercel.app";

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
          const recentTracks =
            response.data.recentlyPlayed.items?.map(
              (item: any) => item.track
            ) || [];
          setRecentlyPlayed(recentTracks.slice(0, 6));
        }
        if (response.data.topArtists) {
          setTopArtists(response.data.topArtists.items?.slice(0, 6) || []);
        }
        if (response.data.topTracks) {
          setTopTracks(response.data.topTracks.items?.slice(0, 14) || []);
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
    if (!session || socket) return;

    const newSocket = io(API_BASE_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ["websocket", "polling"],
    });

    const handleConnect = () => {
      console.log("Connected to WebSocket:", newSocket.id);
      newSocket.emit("start-playback-sync", { session });
    };

    const handlePlaybackUpdate = (data: PlaybackUpdate) => {
      playbackRef.current = data;
      setPlayback(data);
      setSmoothProgress(data.progress || 0);
      lastUpdateRef.current = Date.now();
      setError(null);

      if (data.track && data.track.uri !== currentTrackUriRef.current) {
        currentTrackUriRef.current = data.track.uri;

        setLyrics(null);
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
    };

    const handleError = (err: { message: string; needsReauth?: boolean }) => {
      console.error("Socket error:", err.message);
      if (err.needsReauth) {
        navigate({ to: "/" });
      }
      setError(err.message);
    };

    const handleDisconnect = () => {
      console.log("Disconnected from WebSocket");
    };

    const handleConnectError = (err: Error) => {
      console.error("Socket connection error:", err);
      setError(`Connection failed: ${err.message}`);
    };

    newSocket.on("connect", handleConnect);
    newSocket.on("playback-update", handlePlaybackUpdate);
    newSocket.on("error", handleError);
    newSocket.on("disconnect", handleDisconnect);
    newSocket.on("connect_error", handleConnectError);

    setSocket(newSocket);

    return () => {
      newSocket.off("connect", handleConnect);
      newSocket.off("playback-update", handlePlaybackUpdate);
      newSocket.off("error", handleError);
      newSocket.off("disconnect", handleDisconnect);
      newSocket.off("connect_error", handleConnectError);

      if (newSocket.connected) {
        newSocket.emit("stop-playback-sync");
      }
      newSocket.disconnect();
    };
  }, [session, navigate]);

  const formatTime = (ms: number | undefined): string => {
    if (!ms) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const spotifyURIToURL = (uri: string): string => {
    if (!uri || typeof uri !== "string") {
      console.warn("Invalid URI provided:", uri);
      return "https://open.spotify.com";
    }

    let url = uri;

    if (url.startsWith("spotify:")) {
      url = url.substring(8);
    } else if (url.startsWith("https://open.spotify.com/")) {
      return url;
    }

    const parts = url.split(":");
    if (parts.length >= 2) {
      const type = parts[0];
      const id = parts[1];
      url = `https://open.spotify.com/${type}/${id}`;
    } else {
      url = `https://open.spotify.com/track/${url}`;
    }

    try {
      const validatedUrl = new URL(url);
      console.log("Generated Spotify URL:", validatedUrl.toString());
      return validatedUrl.toString();
    } catch (error) {
      console.error("Invalid Spotify URL generated:", url, error);
      return "https://open.spotify.com";
    }
  };

  const handleOpenSpotify = (uri: string) => {
    console.log("Opening Spotify with URI:", uri);
    const spotifyUrl = spotifyURIToURL(uri);
    console.log("Generated URL:", spotifyUrl);

    if (!spotifyUrl.startsWith("http")) {
      console.error("Generated URL is not absolute:", spotifyUrl);
      return;
    }

    try {
      const url = new URL(spotifyUrl);
      const finalUrl = url.toString();
      console.log("Final URL to open:", finalUrl);

      const newWindow = window.open(finalUrl, "_blank", "noopener,noreferrer");

      if (!newWindow) {
        console.error("Failed to open window. Popup blocker might be enabled.");
      }
    } catch (error) {
      console.error("Error opening Spotify URL:", error);
    }
  };

  return (
    <div
      className={`min-h-screen ${
        theme === "light" ? "bg-gray-50" : "bg-background"
      } text-foreground py-10 md:p-8`}
    >
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 p-5">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl md:text-5xl font-black text-foreground">
              Your Music
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate({ to: "/" })}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  theme === "light"
                    ? "bg-gray-300 hover:bg-gray-400 text-gray-600 hover:text-gray-800"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                }`}
                title="Home"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </button>
              <ThemeToggle />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Currently playing from Spotify
          </p>
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
          <div
            className={`${
              theme === "light" ? "bg-white shadow-xl" : "bg-card"
            } rounded-2xl shadow-lg overflow-hidden`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
              <div className="lg:col-span-2 space-y-0">
                <div
                  className={`p-6 lg:p-8 border-b ${
                    theme === "light" ? "border-gray-200" : "border-border"
                  }`}
                >
                  {playback?.track ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          ► NOW PLAYING
                        </p>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-4">
                            {playback.isPlaying ? (
                              <Pause className="h-10 w-10 text-foreground" />
                            ) : (
                              <Play className="h-10 w-10 text-muted-foreground" />
                            )}
                          </div>
                          <button
                            onClick={() =>
                              handleOpenSpotify(playback.track?.uri || "")
                            }
                            className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-lg"
                            style={{ backgroundColor: accentColor }}
                            title="Open in Spotify"
                          >
                            <ExternalLink className="h-3 w-3 text-white" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col lg:flex-row items-center gap-8">
                        <div className="shrink-0">
                          <img
                            src={playback.track.image}
                            alt={playback.track.name}
                            className="w-90 h-90 md:w-90 md:h-90 rounded-2xl shadow-2xl object-cover"
                          />
                        </div>

                        <div className="flex-1 text-center lg:text-left space-y-4">
                          <div className="space-y-3">
                            <h2 className="text-2xl md:text-3xl font-black text-foreground leading-tight">
                              {playback.track.name}
                            </h2>
                            <p className="text-lg md:text-xl font-semibold text-muted-foreground">
                              {playback.track.artists}
                            </p>
                            <div className="flex justify-center lg:justify-start">
                              {playback.track.album.length > 40 ? (
                                <div className="relative overflow-hidden rounded-full" style={{ backgroundColor: accentColor, maxWidth: '364px' }}>
                                  <div className="px-3 py-1">
                                    <div className="whitespace-nowrap text-xs font-medium text-white">
                                      <div className="animate-marquee-container">
                                        {playback.track.album} &nbsp;&nbsp; {playback.track.album}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span
                                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
                                  style={{ backgroundColor: accentColor }}
                                  title={playback.track.album}
                                >
                                  {playback.track.album.length > 30 ? (
                                    <span className="truncate" style={{ maxWidth: '364px' }}>
                                      {playback.track.album}
                                    </span>
                                  ) : (
                                    playback.track.album
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          {playback.progress !== undefined &&
                            playback.duration && (
                              <div className="space-y-2 max-w-md mx-auto lg:mx-0">
                                <div className="flex items-center gap-5 md:hidden">
                                  <span className="text-xs text-muted-foreground font-semibold w-6 text-right">
                                    {formatTime(smoothProgress)}
                                  </span>
                                  <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden min-w-65">
                                    <div
                                      className="h-3 rounded-full transition-all duration-300 ease-linear"
                                      style={{
                                        width: `${
                                          (smoothProgress / playback.duration) *
                                          100
                                        }%`,
                                        backgroundColor: accentColor,
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground font-semibold w-6">
                                    {formatTime(playback.duration)}
                                  </span>
                                </div>

                                <div className="hidden md:block max-w-md">
                                  <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                                    <div
                                      className="h-4 rounded-full transition-all"
                                      style={{
                                        width: `${
                                          (smoothProgress / playback.duration) *
                                          100
                                        }%`,
                                        backgroundColor: accentColor,
                                        willChange: "width",
                                      }}
                                    />
                                  </div>
                                  <div className="flex justify-between text-xs text-muted-foreground font-semibold mt-2">
                                    <span>{formatTime(smoothProgress)}</span>
                                    <span>{formatTime(playback.duration)}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-3">
                      <Music className="h-12 w-12 text-muted-foreground mx-auto" />
                      <p className="text-muted-foreground">
                        No track currently playing
                      </p>
                    </div>
                  )}
                </div>

                <div
                  className={`p-6 lg:p-8 border-b ${
                    theme === "light" ? "border-gray-200" : "border-border"
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-2">
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
                      artist={playback?.track?.artists || ""}
                      trackName={playback?.track?.name || ""}
                      accentColor={accentColor}
                      currentLine={0}
                    />
                  </div>
                </div>

                <div className="p-6 lg:p-8">
                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#1DB954] flex items-center justify-center">
                        <Clock className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          Recently Played
                        </h3>
                        <p className="text-xs text-muted-foreground font-medium">
                          Your latest listening history
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {recentlyPlayed.map((track, index) => (
                        <div
                          key={`${track.id}-${index}`}
                          className={`group cursor-pointer rounded-lg p-3 transition-all duration-200 ${
                            theme === "light"
                              ? "hover:bg-gray-50 border border-transparent hover:border-gray-200"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => handleOpenSpotify(track.uri)}
                        >
                          {track.album.images[0] && (
                            <div className="relative mb-2">
                              <img
                                src={track.album.images[0].url}
                                alt={track.name}
                                className="w-full aspect-square object-cover rounded shadow-sm"
                              />
                            </div>
                          )}
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground line-clamp-2 leading-tight">
                              {track.name}
                            </p>
                            <p className="text-xs text-muted-foreground font-normal truncate">
                              {track.artists[0]?.name}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`${
                  theme === "light"
                    ? "bg-gray-50 border-l border-gray-200"
                    : "bg-card border-l border-border"
                }`}
              >
                <div
                  className={`p-6 lg:p-8 border-b ${
                    theme === "light" ? "border-gray-200" : "border-border"
                  }`}
                >
                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#1DB954] flex items-center justify-center">
                        <Users className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          Top Artists
                        </h3>
                        <p className="text-xs text-muted-foreground font-medium">
                          Your most listened to artists
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {topArtists.map((artist, index) => (
                        <div
                          key={`${artist.id}-${index}`}
                          className={`group cursor-pointer flex items-center gap-4 p-3 rounded-lg transition-all duration-200 ${
                            theme === "light"
                              ? "hover:bg-gray-100 border border-transparent hover:border-gray-200"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => handleOpenSpotify(artist.uri)}
                        >
                          <div className="w-8 text-center">
                            <span className="text-sm font-medium text-muted-foreground">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <div className="relative shrink-0">
                            {artist.images[0] && (
                              <img
                                src={artist.images[0].url}
                                alt={artist.name}
                                className="w-12 h-12 rounded-full object-cover"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate leading-tight">
                              {artist.name}
                            </p>
                            <p className="text-xs text-muted-foreground font-normal">
                              Artist
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-6 lg:p-8">
                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#1DB954] flex items-center justify-center">
                        <Disc3 className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          Top Tracks
                        </h3>
                        <p className="text-xs text-muted-foreground font-medium">
                          Your most played songs
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {topTracks.map((track, index) => (
                        <div
                          key={`${track.id}-${index}`}
                          className={`group cursor-pointer flex items-center gap-4 p-3 rounded-lg transition-all duration-200 ${
                            theme === "light"
                              ? "hover:bg-gray-100 border border-transparent hover:border-gray-200"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => handleOpenSpotify(track.uri)}
                        >
                          <div className="w-8 text-center">
                            <span className="text-sm font-medium text-muted-foreground">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <div className="relative shrink-0">
                            {track.album.images[0] && (
                              <img
                                src={track.album.images[0].url}
                                alt={track.name}
                                className="w-12 h-12 rounded object-cover"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate leading-tight">
                              {track.name}
                            </p>
                            <p className="text-xs text-muted-foreground font-normal truncate">
                              {track.artists[0]?.name}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
