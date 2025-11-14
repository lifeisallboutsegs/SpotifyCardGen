import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useTheme } from "next-themes";
import {
  setSession,
  setUser,
  setLoading,
  setError,
  logout,
} from "@/store/authSlice";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CountryFlag } from "@/components/CountryFlag";
import {
  Music,
  Play,
  Disc3,
  ExternalLink,
  EyeOff,
  Users,
  Crown,
} from "lucide-react";
import { extractAverageColor, rgbToHex } from "@/lib/colorExtractor";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://spotifycardgen.vercel.app";

export default function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/" });
  const dispatch = useAppDispatch();
  const { theme } = useTheme();
  const { session, user, loading, error } = useAppSelector(
    (state) => state.auth
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState("#535353");
  const [topArtists, setTopArtists] = useState([]);
  const [topTracks, setTopTracks] = useState([]);
  const [showMiniHeader, setShowMiniHeader] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const mainThumbRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleSessionFromUrl = async () => {
      const sessionFromUrl = (search as any)?.session;

      if (sessionFromUrl) {
        dispatch(setSession(sessionFromUrl));
        window.history.replaceState({}, "", "/");
      }
    };

    handleSessionFromUrl();
  }, [search, dispatch]);

  useEffect(() => {
    if (session) {
      fetchUserData();
    } else {
      dispatch(setLoading(false));
    }
  }, [session]);

  useEffect(() => {
    if (user?.images?.[0]?.url) {
      extractAverageColor(user.images[0].url).then((color) => {
        setAccentColor(rgbToHex(color.r, color.g, color.b));
      });
    }
  }, [user]);

  const updateThumb = (
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
      const scrollRatio = Math.min(1, Math.max(0, scrollEl.scrollTop / scrollable));
      const top = Math.round(scrollRatio * maxTop);
      thumbEl.style.top = top + "px";
    }
    
    thumbEl.style.height = thumbHeight + "px";
  };

  useEffect(() => {
    const scrollEl = mainScrollRef.current;
    const thumbEl = mainThumbRef.current;
    if (scrollEl && thumbEl) {
      const onScroll = () => {
        updateThumb(scrollEl, thumbEl);
        setShowMiniHeader(scrollEl.scrollTop > 400);
      };
      const onResize = () => updateThumb(scrollEl, thumbEl);
      scrollEl.addEventListener("scroll", onScroll);
      window.addEventListener("resize", onResize);

      updateThumb(scrollEl, thumbEl);
      return () => {
        scrollEl.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
      };
    }
  }, [user, topArtists, topTracks, theme]);

  useEffect(() => {
    const attachDrag = (
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
        const thumbHeight = parseFloat(
          window.getComputedStyle(thumbEl).height || "32"
        );
        const maxThumbTop = Math.max(1, visible - thumbHeight);
        const scrollable = Math.max(1, total - visible);
        const scrollDelta = (delta / maxThumbTop) * scrollable;
        scrollEl.scrollTop = Math.min(
          Math.max(0, startScroll + scrollDelta),
          scrollable
        );
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

    const mainCleanup = attachDrag(mainScrollRef.current, mainThumbRef.current);
    return () => {
      if (typeof mainCleanup === "function") mainCleanup();
    };
  }, [user, topArtists, topTracks, theme]);

  const fetchUserData = async () => {
    dispatch(setLoading(true));
    try {
      const response = await fetch(`${API_BASE_URL}/api/data`, {
        headers: {
          Authorization: `Bearer ${session}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.needsReauth) {
          dispatch(logout());
          navigate({ to: "/" });
          setLocalError("Session expired. Please login again.");
          return;
        }
        throw new Error("Failed to fetch user data");
      }

      const data = await response.json();
      dispatch(setUser(data.user));
      setTopArtists(data.topArtists?.items || []);
      setTopTracks(data.topTracks?.items || []);
    } catch (err) {
      console.error("Error fetching user data:", err);
      const errorMsg = err instanceof Error ? err.message : "An error occurred";
      dispatch(setError(errorMsg));
      setLocalError(errorMsg);
      dispatch(logout());
    } finally {
      dispatch(setLoading(false));
    }
  };

  const handleLogin = () => {
    window.location.href = `${API_BASE_URL}/login`;
  };

  const handleGenerateCard = () => {
    navigate({ to: "/generate" });
  };

  const handleLogout = () => {
    dispatch(logout());
    setLocalError(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Disc3 className="h-12 w-12 text-muted-foreground mx-auto animate-spin opacity-50" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const displayError = error || localError;

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-6xl">
        {displayError && (
          <div className="mb-4 sm:mb-6">
            <div className="p-3 sm:p-4 bg-destructive/20 border border-destructive rounded-lg">
              <p className="text-xs sm:text-sm text-destructive-foreground">
                {displayError}
              </p>
            </div>
          </div>
        )}

        {user ? (
          <div
            className="rounded-xl overflow-hidden shadow-2xl max-h-[85vh] sm:max-h-[80vh] max-w-6xl mx-auto relative"
            style={{
              boxShadow:
                theme === "light"
                  ? `0 25px 50px -12px ${accentColor}20`
                  : `0 25px 50px -12px ${accentColor}30`,
            }}
          >
            <div className="h-[85vh] sm:h-[80vh]">
              <div className="custom-scroll-wrapper h-full relative">
                <div
                  ref={mainScrollRef}
                  className="overflow-y-auto h-full custom-scroll"
                >
                  <div className="relative">
                    <div
                      className="sticky top-0 z-50 pointer-events-none"
                      style={{
                        height: 0,
                        overflow: "visible",
                      }}
                    >
                      <div
                        className="py-3 sm:py-4 px-4 sm:px-8 transition-transform duration-300 ease-in-out pointer-events-auto"
                        style={{
                          background:
                            theme === "light"
                              ? `linear-gradient(180deg, ${accentColor}20 0%, ${accentColor}60 30%, ${accentColor}80 70%, ${accentColor}40 100%)`
                              : `linear-gradient(180deg, ${accentColor} 0%, ${accentColor}90 30%, ${accentColor}60 70%, ${accentColor}30 100%)`,
                          backdropFilter: "blur(20px)",
                          WebkitBackdropFilter: "blur(20px)",
                          boxShadow:
                            theme === "light"
                              ? `0 8px 32px 0 ${accentColor}15`
                              : `0 8px 32px 0 ${accentColor}20`,
                          border:
                            theme === "light"
                              ? `1px solid ${accentColor}30`
                              : `1px solid ${accentColor}40`,
                          transform: showMiniHeader
                            ? "translateY(0)"
                            : "translateY(-100%)",
                        }}
                      >
                        <h1 className="text-lg sm:text-1xl md:text-2xl font-bold tracking-tight">
                          {user.display_name}
                        </h1>
                      </div>
                    </div>

                    <div>
                      <div
                        className="relative"
                        style={{
                          background:
                            theme === "light"
                              ? `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}40 25%, ${accentColor}60 50%, ${accentColor}30 75%, ${accentColor}10 100%)`
                              : `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}95 25%, ${accentColor}70 50%, ${accentColor}40 75%, ${accentColor}20 100%)`,
                          backdropFilter: "blur(15px)",
                          WebkitBackdropFilter: "blur(15px)",
                          boxShadow:
                            theme === "light"
                              ? `inset 0 0 100px ${accentColor}5`
                              : `inset 0 0 100px ${accentColor}10`,
                        }}
                      >
                        <div className="px-4 sm:px-8 py-8 sm:py-10">
                          {/* Mobile-first layout */}
                          <div className="flex flex-col sm:flex-row sm:items-end gap-6 sm:gap-6">
                            <div className="flex flex-col items-center sm:items-start">
                              <div className="relative">
                                <Avatar className="h-40 w-40 sm:h-56 sm:w-56 shadow-2xl">
                                  <AvatarImage
                                    src={user.images?.[0]?.url}
                                    alt={user.display_name}
                                    className="object-cover"
                                  />
                                  <AvatarFallback className="text-4xl sm:text-6xl font-bold bg-muted text-muted-foreground">
                                    {user.display_name?.[0]?.toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                {user.country && (
                                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                                    <CountryFlag
                                      countryCode={user.country}
                                      className="h-8 w-10 sm:h-12 sm:w-16 rounded-xl border-0 object-cover shadow-lg"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex-1 text-center sm:text-left pb-4 w-full">
                              <p className="text-sm font-semibold mb-2 opacity-90 text-foreground">
                                Profile
                              </p>
                              <h1 className="text-4xl sm:text-7xl md:text-8xl font-black mb-4 tracking-tight wrap-break-word">
                                {user.display_name}
                              </h1>
                              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-0 sm:items-center text-sm">
                                <span className="flex items-center gap-1 font-medium text-base sm:text-lg text-foreground">
                                  <Users className="h-5 w-5" />
                                  {(
                                    user.followers?.total || 0
                                  ).toLocaleString()}{" "}
                                  followers
                                </span>
                                <div className="hidden sm:flex items-center">
                                  <span className="opacity-70 mx-2 text-muted-foreground">
                                    •
                                  </span>
                                  <div className="bg-muted rounded-full p-1">
                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <span className="opacity-70 mx-2 text-muted-foreground">
                                    •
                                  </span>
                                </div>
                                <span className="flex items-center gap-1 opacity-90 text-base sm:text-lg sm:ml-auto text-foreground">
                                  <Crown className="h-5 w-5" />
                                  {user.product
                                    ? user.product.charAt(0).toUpperCase() +
                                      user.product.slice(1)
                                    : "Free"}{" "}
                                  Plan
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div
                        className="relative"
                        style={{
                          background:
                            theme === "light"
                              ? `linear-gradient(180deg, ${accentColor}20 0%, ${accentColor}10 10%, #ffffff 20%, #ffffff 100%)`
                              : `linear-gradient(180deg, ${accentColor}30 0%, ${accentColor}15 10%, #121212 20%, #121212 100%)`,
                          backdropFilter: "blur(10px)",
                          WebkitBackdropFilter: "blur(10px)",
                        }}
                      >
                        <div className="px-4 sm:px-8 py-8 pb-20 sm:pb-28">
                          {topArtists.length > 0 && (
                            <section className="mb-8 sm:mb-12">
                              <div className="mb-4 sm:mb-6">
                                <h2 className="text-xl sm:text-2xl font-bold mb-1 text-foreground">
                                  Top artists this month
                                </h2>
                                <p className="text-xs sm:text-sm text-muted-foreground">
                                  Only visible to you
                                </p>
                              </div>

                              <div className="relative">
                                <div className="overflow-x-auto overflow-y-hidden pb-2">
                                  <div className="flex gap-3 sm:gap-2">
                                    {topArtists
                                      .slice(0, 6)
                                      .map((artist: any, index: number) => (
                                        <div
                                          key={artist.id || index}
                                          className={`rounded-xl transition-all cursor-pointer group flex flex-col shrink-0 bg-transparent ${
                                            theme === "light"
                                              ? "hover:bg-gray-300 hover:shadow-md"
                                              : "hover:bg-[#282828]"
                                          }`}
                                          style={{
                                            padding: "12px",
                                            minHeight: "220px",
                                            width: "160px",
                                          }}
                                        >
                                          <div className="relative mb-4 shrink-0">
                                            <div className="relative w-full pb-[100%] rounded-full overflow-hidden bg-muted">
                                              <img
                                                src={artist.images?.[0]?.url}
                                                alt={artist.name}
                                                className="absolute inset-0 w-full h-full object-cover"
                                              />
                                            </div>

                                            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all">
                                              {artist.external_urls?.spotify ? (
                                                <a
                                                  href={
                                                    artist.external_urls.spotify
                                                  }
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  aria-label={`View ${artist.name} on Spotify`}
                                                >
                                                  <button className="h-11 w-11 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] shadow-xl flex items-center justify-center">
                                                    <ExternalLink className="h-5 w-5 text-black" />
                                                  </button>
                                                </a>
                                              ) : (
                                                <button
                                                  className="h-11 w-11 rounded-full bg-[#6b6b6b] cursor-not-allowed shadow-xl flex items-center justify-center"
                                                  disabled
                                                >
                                                  <ExternalLink className="h-5 w-5 text-black" />
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                          <div className="mt-auto">
                                            <p className="font-semibold mb-1 truncate text-foreground">
                                              {artist.name}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                              Artist
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              </div>
                            </section>
                          )}

                          {topTracks.length > 0 && (
                            <section className="mb-8 sm:mb-12">
                              <div className="mb-4 sm:mb-6">
                                <h2 className="text-xl sm:text-2xl font-bold mb-1 text-foreground">
                                  Top tracks this month
                                </h2>
                                <p className="text-xs sm:text-sm text-muted-foreground">
                                  Only visible to you
                                </p>
                              </div>

                              <div className="space-y-2">
                                {topTracks
                                  .slice(0, 4)
                                  .map((track: any, index: number) => (
                                    <div key={track.id || index}>
                                      <a
                                        href={track.external_urls?.spotify}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`flex items-center gap-3 sm:gap-4 p-2 rounded-lg transition-colors group ${
                                          theme === "light"
                                            ? "hover:bg-gray-300 hover:shadow-sm"
                                            : "hover:bg-[#282828]"
                                        }`}
                                      >
                                        <div className="flex items-center justify-center w-8 sm:w-10 text-muted-foreground group-hover:text-foreground shrink-0">
                                          <span className="text-sm sm:text-base group-hover:hidden">
                                            {index + 1}
                                          </span>
                                          <Play className="hidden group-hover:block h-3 w-3 sm:h-4 sm:w-4" />
                                        </div>
                                        <img
                                          src={track.album?.images?.[0]?.url}
                                          alt={track.name}
                                          className="h-8 w-8 sm:h-10 sm:w-10 rounded shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium truncate text-sm sm:text-base text-foreground">
                                            {track.name}
                                          </p>
                                          <p className="text-xs sm:text-sm text-muted-foreground truncate">
                                            {track.artists
                                              ?.map((a: any) => a.name)
                                              .join(", ")}
                                          </p>
                                        </div>
                                        <div className="text-xs sm:text-sm text-muted-foreground hidden md:block shrink-0">
                                          {track.album?.name}
                                        </div>
                                        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                                          <span className="text-xs sm:text-sm text-muted-foreground">
                                            {Math.floor(
                                              track.duration_ms / 60000
                                            )}
                                            :
                                            {String(
                                              Math.floor(
                                                (track.duration_ms % 60000) /
                                                  1000
                                              )
                                            ).padStart(2, "0")}
                                          </span>
                                        </div>
                                      </a>
                                    </div>
                                  ))}
                              </div>
                            </section>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div
                ref={mainThumbRef}
                className="custom-scrollbar-thumb"
                aria-hidden="true"
              />

              <div className="absolute bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2 w-full px-4 sm:px-8 pointer-events-none">
                <div className="max-w-2xl mx-auto flex gap-3 sm:gap-4 pointer-events-auto">
                  <Button
                    onClick={handleGenerateCard}
                    className={`flex-1 h-12 sm:h-14 font-bold rounded-full transition-all text-xs sm:text-base px-4 sm:px-6 ${
                      theme === "light"
                        ? "bg-[#1ed760] hover:bg-[#1fdf64] text-white"
                        : "bg-white hover:bg-white/90 text-black"
                    }`}
                  >
                    <Play className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
                    Generate Card
                  </Button>
                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    className="flex-1 h-12 sm:h-14 border-border hover:border-foreground text-foreground font-bold rounded-full transition-all hover:bg-accent text-xs sm:text-base px-4 sm:px-6"
                  >
                    Log out
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden shadow-2xl bg-card">
            <div className="px-4 sm:px-8 py-12 sm:py-16 text-center">
              <div className="inline-flex items-center justify-center w-32 h-32 sm:w-40 sm:h-40 md:w-56 md:h-56 bg-muted rounded-full mb-6 sm:mb-8 shadow-2xl">
                <Music className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 text-muted-foreground" />
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black mb-4 sm:mb-6 tracking-tight text-foreground">
                Welcome
              </h1>
              <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-6 sm:mb-8 px-2">
                Connect your Spotify account to create beautiful cards
                showcasing your music taste. View your top tracks, artists, and
                currently playing songs with custom styling.
              </p>

              <Button
                onClick={handleLogin}
                className="h-12 sm:h-14 px-6 sm:px-8 bg-[#1ed760] hover:bg-[#1fdf64] hover:scale-105 text-black font-bold rounded-full transition-all text-sm sm:text-base shadow-lg"
              >
                <Music className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Log in with Spotify
              </Button>
            </div>

            <div className="px-4 sm:px-8 pb-12 sm:pb-16">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                <div
                  className={`p-4 sm:p-6 rounded-lg transition-colors ${
                    theme === "light"
                      ? "bg-gray-50 hover:bg-gray-300 hover:shadow-lg"
                      : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/20 rounded-lg flex items-center justify-center mb-3 sm:mb-4">
                    <Disc3 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold mb-2 text-foreground">
                    Top Tracks
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    View your most played songs and create stunning visual cards
                  </p>
                </div>

                <div
                  className={`p-4 sm:p-6 rounded-lg transition-colors ${
                    theme === "light"
                      ? "bg-gray-50 hover:bg-gray-300 hover:shadow-lg"
                      : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/20 rounded-lg flex items-center justify-center mb-3 sm:mb-4">
                    <Play className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold mb-2 text-foreground">
                    Live Status
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Real-time sync with your currently playing tracks
                  </p>
                </div>

                <div
                  className={`p-4 sm:p-6 rounded-lg transition-colors sm:col-span-2 md:col-span-1 ${
                    theme === "light"
                      ? "bg-gray-50 hover:bg-gray-300 hover:shadow-lg"
                      : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/20 rounded-lg flex items-center justify-center mb-3 sm:mb-4">
                    <Music className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold mb-2 text-foreground">
                    Favorite Artists
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Showcase your top artists with beautiful designs
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
