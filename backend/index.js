import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import querystring from "querystring";
import axios from "axios";
import * as cheerio from "cheerio";
import qs from "qs";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_REDIRECT_URI || "http://localhost:3000",
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;
let uptime = Date.now();

const db = new Database("spotify_tokens.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

const getSession = db.prepare("SELECT * FROM sessions WHERE session_id = ?");
const insertSession = db.prepare(`
  INSERT OR REPLACE INTO sessions (session_id, access_token, refresh_token, expires_at)
  VALUES (?, ?, ?, ?)
`);
const deleteSession = db.prepare("DELETE FROM sessions WHERE session_id = ?");
const updateSession = db.prepare(`
  UPDATE sessions
  SET access_token = ?, refresh_token = ?, expires_at = ?
  WHERE session_id = ?
`);

const frontendDistPath = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendDistPath));

app.get("*", (req, res) => {
  if (
    !req.url.startsWith("/api/") &&
    !req.url.startsWith("/socket.io/") &&
    !req.url.startsWith("/login") &&
    !req.url.startsWith("/callback")
  ) {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  }
});
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: process.env.FRONTEND_REDIRECT_URI || "http://localhost:3000",
    credentials: true,
  })
);

async function search(songname) {
  const searchUrl = `https://api.genius.com/search?${qs.stringify({
    q: songname,
  })}`;
  const searchResponse = await axios.get(searchUrl, {
    headers: {
      Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}`,
    },
  });

  const searchResults = searchResponse.data.response.hits;
  const results = searchResults.map(({ result }) => ({
    title: result.title,
    artist: result.primary_artist.name,
    image: result.song_art_image_url,
    url: result.url,
  }));

  return { results };
}

async function getLyrics(lyricsUrl) {
  const lyricsPageData = await axios.get(lyricsUrl);
  const $ = cheerio.load(lyricsPageData.data);

  const lyricsContainers = $('div[data-lyrics-container="true"]');
  let lyricsText = "";

  lyricsContainers.each((index, element) => {
    const $element = $(element);

    $element.find('[data-exclude-from-selection="true"]').remove();
    $element.find(".LyricsHeader__Container-sc-d6abeb2b-1").remove();
    $element.find(".ContributorsCreditSong__Container-sc-3ec5a79c-0").remove();
    $element.find(".SongBioPreview__Container-sc-8d233cbc-0").remove();
    $element.find(".LyricsHeader__SongBioPreview-sc-d6abeb2b-12").remove();

    $element.find("button").remove();
    $element.find("svg").remove();
    $element.find(".Dropdown__Container-sc-791290da-0").remove();
    $element.find('[class*="Header"]').remove();
    $element.find('[class*="Tooltip"]').remove();
    $element.find('[class*="Metadata"]').remove();

    $element.find('[style*="opacity:0"]').remove();
    $element.find('[style*="position:absolute"]').remove();
    $element.find('[tabindex="0"][style*="pointer-events:none"]').remove();

    $element
      .find(".ReferentFragment-desktop__Highlight-sc-96c7f1dd-1")
      .each((i, frag) => {
        const $frag = $(frag);

        $frag.html($frag.html().replace(/<br\s*\/?>/gi, "\n"));
      });

    let lyricsHtml = $element.html();
    if (lyricsHtml) {
      lyricsHtml = lyricsHtml.replace(/<br\s*\/?>/gi, "\n");

      const lyricsSection = cheerio.load(lyricsHtml).text();

      const lines = lyricsSection
        .split("\n")
        .map((line) => line.trim())
        .filter((line, index, array) => {
          if (line.length === 0) return true;

          return !(
            line.match(/^\d+\s+Contributors?$/i) ||
            line.match(/^.*Lyrics$/i) ||
            line.match(/^Read More/i) ||
            line.match(/^Translations/i) ||
            line.includes("is a melodic piece") ||
            line.includes("collaboration between") ||
            line.includes("See upcoming pop shows") ||
            line.includes("Get tickets for your favorite artists") ||
            line.includes("You might also like")
          );
        });

      if (lines.length > 0) {
        lyricsText += lines.join("\n") + "\n";
      }
    }
  });

  return { lyrics: lyricsText.trim() };
}

app.use(
  cors({
    origin: process.env.FRONTEND_REDIRECT_URI || "http://localhost:5173",
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.BACKEND_BASE_URI
  ? `${process.env.BACKEND_BASE_URI}/callback`
  : "http://localhost:3000/callback";
const FRONTEND_REDIRECT =
  process.env.FRONTEND_REDIRECT_URI || "http://localhost:5173";

const GENIUS_ACCESS_TOKEN =
  "ohCXKqz-spvgUf4Rq1lGNdJM-Lp2--eetb0VaR5WzROO4rxKFMMVHzTyN0Fsr64u";

const activeListeners = new Map();
const playbackCache = new Map();
const lyricsCache = new Map();

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("start-playback-sync", async ({ session }) => {
    if (!session) {
      socket.emit("error", { message: "No session provided" });
      return;
    }

    const sessionData = getSession.get(session);
    if (!sessionData) {
      socket.emit("error", { message: "Invalid session" });
      return;
    }

    if (activeListeners.has(socket.id)) {
      clearInterval(activeListeners.get(socket.id).apiInterval);
      clearInterval(activeListeners.get(socket.id).clientInterval);
    }

    let lastApiData = null;
    let lastApiCall = 0;

    const updatePlayback = async () => {
      try {
        if (Date.now() >= sessionData.expires_at - 60000) {
          await refreshAccessToken(session, sessionData);
        }

        const updatedSession = getSession.get(session);
        const response = await axios.get(
          "https://api.spotify.com/v1/me/player/currently-playing",
          {
            headers: { Authorization: `Bearer ${updatedSession.access_token}` },
          }
        );

        if (response.status === 204 || !response.data) {
          lastApiData = { isPlaying: false };
          socket.emit("playback-update", lastApiData);
          return;
        }

        const data = response.data;
        lastApiData = {
          isPlaying: data.is_playing,
          progress: data.progress_ms,
          duration: data.item?.duration_ms,
          track: {
            name: data.item?.name,
            artists: data.item?.artists?.map((a) => a.name).join(", "),
            album: data.item?.album?.name,
            image: data.item?.album?.images?.[0]?.url,
            uri: data.item?.uri,
          },
          timestamp: Date.now(),
        };
        lastApiCall = Date.now();
        playbackCache.set(session, lastApiData);
      } catch (err) {
        if (err.response?.status === 204) {
          lastApiData = { isPlaying: false };
        } else if (err.response?.status === 401) {
          socket.emit("error", {
            message: "Session expired",
            needsReauth: true,
          });
          clearInterval(activeListeners.get(socket.id)?.apiInterval);
          clearInterval(activeListeners.get(socket.id)?.clientInterval);
          activeListeners.delete(socket.id);
          return;
        } else if (err.response?.status === 429) {
          console.error("Rate limited! Using cached data");
        } else {
          console.error("Playback update error:", err.message);
        }
      }
    };

    const sendUpdate = () => {
      if (!lastApiData) return;

      if (lastApiData.isPlaying && lastApiData.progress !== undefined) {
        const timeSinceLastApi = Date.now() - lastApiCall;
        const estimatedProgress = lastApiData.progress + timeSinceLastApi;

        socket.emit("playback-update", {
          ...lastApiData,
          progress: Math.min(
            estimatedProgress,
            lastApiData.duration || estimatedProgress
          ),
          timestamp: Date.now(),
          estimated: true,
        });
      } else {
        socket.emit("playback-update", lastApiData);
      }
    };

    if (playbackCache.has(session)) {
      lastApiData = playbackCache.get(session);
      lastApiCall = lastApiData.timestamp;
      sendUpdate();
    } else {
      await updatePlayback();
    }

    const apiInterval = setInterval(updatePlayback, 2000);
    const clientInterval = setInterval(sendUpdate, 1000);

    activeListeners.set(socket.id, { apiInterval, clientInterval });
  });

  socket.on("stop-playback-sync", () => {
    if (activeListeners.has(socket.id)) {
      clearInterval(activeListeners.get(socket.id).apiInterval);
      clearInterval(activeListeners.get(socket.id).clientInterval);
      activeListeners.delete(socket.id);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    if (activeListeners.has(socket.id)) {
      clearInterval(activeListeners.get(socket.id).apiInterval);
      clearInterval(activeListeners.get(socket.id).clientInterval);
      activeListeners.delete(socket.id);
    }
  });
});

app.get("/", (req, res) => {
  const upt = Date.now() - uptime;
  const hours = Math.floor(upt / 3600000);
  const minutes = Math.floor((upt % 3600000) / 60000);
  const seconds = Math.floor((upt % 60000) / 1000);
  const humanReadableUptime = `${hours}h ${minutes}m ${seconds}s`;

  res.json({
    status: "running",
    uptime: humanReadableUptime,
    endpoints: {
      login: "/login",
      callback: "/callback",
      data: "/api/data",
      lyrics: "/api/lyrics",
    },
    websocket: "socket.io enabled",
  });
});

app.get("/login", (req, res) => {
  const scope = [
    "user-read-private",
    "user-read-email",
    "user-read-currently-playing",
    "user-read-playback-state",
    "user-read-recently-played",
    "user-top-read",
    "playlist-read-private",
    "playlist-read-collaborative",
  ].join(" ");

  const state = generateRandomString(16);

  const query = querystring.stringify({
    response_type: "code",
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state,
    show_dialog: false,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${query}`);
});

app.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_REDIRECT}?error=${error}`);
  }

  if (!code) {
    return res.redirect(`${FRONTEND_REDIRECT}?error=no_code`);
  }

  try {
    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",
      querystring.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${CLIENT_ID}:${CLIENT_SECRET}`
          ).toString("base64")}`,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const sessionId = generateRandomString(32);
    const expiresAt = Date.now() + expires_in * 1000;

    insertSession.run(sessionId, access_token, refresh_token, expiresAt);

    setTimeout(
      () => refreshTokenSilently(sessionId),
      (expires_in - 300) * 1000
    );

    res.redirect(`${FRONTEND_REDIRECT}?session=${sessionId}`);
  } catch (err) {
    console.error("Token exchange error:", err.response?.data || err.message);
    res.redirect(`${FRONTEND_REDIRECT}?error=token_exchange_failed`);
  }
});

app.get("/api/data", async (req, res) => {
  const session =
    req.headers.authorization?.replace("Bearer ", "") || req.query.session;
  if (!session) return res.status(401).json({ error: "No session" });

  const sessionData = getSession.get(session);
  if (!sessionData) return res.status(401).json({ error: "Invalid session" });

  if (Date.now() >= sessionData.expires_at - 60000) {
    await refreshAccessToken(session, sessionData);
  }

  const updatedSession = getSession.get(session);
  const token = updatedSession.access_token;

  try {
    const [user, currentTrack, topTracks, topArtists, recentlyPlayed] =
      await Promise.all([
        axios
          .get("https://api.spotify.com/v1/me", {
            headers: { Authorization: `Bearer ${token}` },
          })
          .then((r) => r.data),

        axios
          .get("https://api.spotify.com/v1/me/player/currently-playing", {
            headers: { Authorization: `Bearer ${token}` },
          })
          .then((r) => r.data)
          .catch((e) =>
            e.response?.status === 204
              ? { isPlaying: false }
              : { isPlaying: false }
          ),

        axios
          .get(
            "https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=10",
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          )
          .then((r) => r.data),

        axios
          .get(
            "https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=10",
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          )
          .then((r) => r.data),

        axios
          .get(
            "https://api.spotify.com/v1/me/player/recently-played?limit=10",
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          )
          .then((r) => r.data),
      ]);

    res.json({
      user,
      currentTrack,
      topTracks,
      topArtists,
      recentlyPlayed,
    });
  } catch (err) {
    handleApiError(err, res, session);
  }
});

app.get("/api/lyrics", async (req, res) => {
  try {
    const { songname, artist } = req.query;

    if (!songname) {
      return res.status(400).json({ error: "Song name is required" });
    }

    const cacheKey = `${songname}-${artist || ""}`.toLowerCase().trim();

    if (lyricsCache.has(cacheKey)) {
      console.log(`Serving lyrics from cache for: ${cacheKey}`);
      return res.json(lyricsCache.get(cacheKey));
    }

    let cleanSongName = songname;
    let cleanArtist = artist;

    if (!artist && songname.toLowerCase().includes(" by ")) {
      const parts = songname.split(" by ");
      if (parts.length === 2) {
        cleanSongName = parts[0].trim();
        cleanArtist = parts[1].trim();
      }
    }

    let featuredArtist = null;

    const featuredMatch = songname.match(/\((?:feat\.?|ft\.?)\s+([^)]+)\)/i);
    if (featuredMatch) {
      featuredArtist = featuredMatch[1].trim();

      cleanSongName = songname
        .replace(/\s*\((?:feat\.?|ft\.?)\s+([^)]+)\)/i, "")
        .trim();
    }

    if (!featuredArtist) {
      const withMatch = songname.match(/\(with\s+([^)]+)\)/i);
      if (withMatch) {
        featuredArtist = withMatch[1].trim();

        cleanSongName = songname.replace(/\s*\(with\s+([^)]+)\)/i, "").trim();
      }
    }

    if (!featuredArtist) {
      const ftMatch = songname.match(
        /\s+(?:feat\.?|ft\.?)\s+([^-(\|]+?)(?:\s|$)/i
      );
      if (ftMatch) {
        featuredArtist = ftMatch[1].trim();

        cleanSongName = songname
          .replace(/\s+(?:feat\.?|ft\.?)\s+[^-(\|]+?(?:\s|$)/i, " ")
          .trim();
      }
    }

    if (artist && songname.includes("(") && songname.includes(")")) {
      const parentheticalContent = songname.match(/\(([^)]+)\)/g);
      if (parentheticalContent) {
        let shouldRemoveParentheses = false;

        for (const parenContent of parentheticalContent) {
          const cleanContent = parenContent.replace(/[()]/g, "").trim();

          const artistPatterns = [/[,&]/, /\s+&\s+/, /^[\w\s&,.']+$/];

          if (artistPatterns.some((pattern) => pattern.test(cleanContent))) {
            const words = cleanContent.split(/[,&]/).map((w) => w.trim());
            const artistWords = artist
              .toLowerCase()
              .split(/[,&]/)
              .map((w) => w.trim());

            let matchingWords = 0;
            for (const word of words) {
              if (
                word.length > 2 &&
                artistWords.some(
                  (artistWord) =>
                    artistWord.includes(word.toLowerCase()) ||
                    word.toLowerCase().includes(artistWord)
                )
              ) {
                matchingWords++;
              }
            }

            if (matchingWords >= Math.min(2, words.length)) {
              shouldRemoveParentheses = true;
              break;
            }
          }
        }

        if (shouldRemoveParentheses) {
          cleanSongName = songname.replace(/\s*\([^)]+\)\s*/g, " ").trim();
        }
      }
    }

    if (songname.includes("-")) {
      const parts = songname.split("-");
      cleanSongName = parts[0].trim();
    } else if (songname.includes("|")) {
      const parts = songname.split("|");
      cleanSongName = parts[0].trim();
    }

    if (!cleanArtist && featuredArtist) {
      cleanArtist = featuredArtist;
    }

    console.log(
      `Searching for: "${cleanSongName}" by "${cleanArtist || "unknown"}"`
    );

    const allResults = new Map();

    try {
      if (cleanArtist) {
        const artistResults = await search(cleanArtist);
        if (artistResults.results) {
          artistResults.results.forEach((result) => {
            allResults.set(result.url, result);
          });
        }
      }

      if (cleanArtist) {
        const artistSongResults = await search(
          `${cleanArtist} ${cleanSongName}`
        );
        if (artistSongResults.results) {
          artistSongResults.results.forEach((result) => {
            allResults.set(result.url, result);
          });
        }
      }

      if (cleanArtist) {
        const songArtistResults = await search(
          `${cleanSongName} ${cleanArtist}`
        );
        if (songArtistResults.results) {
          songArtistResults.results.forEach((result) => {
            allResults.set(result.url, result);
          });
        }
      }

      const songResults = await search(cleanSongName);
      if (songResults.results) {
        songResults.results.forEach((result) => {
          allResults.set(result.url, result);
        });
      }
    } catch (searchError) {
      console.error("Error during multiple searches:", searchError);
    }

    const combinedResults = Array.from(allResults.values());

    if (combinedResults.length === 0) {
      return res.status(404).json({ error: "No songs found in any search" });
    }

    const songWords = cleanSongName
      .toLowerCase()
      .replace(/[-()]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 0);
    const artistWords = cleanArtist
      ? cleanArtist
          .toLowerCase()
          .split(/\s+/)
          .filter((word) => word.length > 0)
      : [];

    let bestMatch = null;
    let bestScore = 0;

    for (const result of combinedResults) {
      const titleLower = result.title.toLowerCase();
      const resultArtistLower = result.artist.toLowerCase();
      let score = 0;

      const translationPatterns = [
        "traducción",
        "traduccion",
        "türkçe",
        "русский",
        "traduction",
        "tradução",
        "nederlandse",
        "deutsche",
        "תרגום",
        "español",
        "português",
        "svensk översättning",
        " traduction ",
        " traduction",
        "translation",
        "traducción al",
        "türkçe çeviri",
        "ruskiy perevod",
        "deutsche übersetzung",
      ];

      const isTranslation = translationPatterns.some(
        (pattern) =>
          titleLower.includes(pattern.toLowerCase()) ||
          resultArtistLower.includes(pattern.toLowerCase())
      );

      let isFullCollaborationTranslation = false;
      if (isTranslation && cleanArtist) {
        const cleanArtistWords = cleanArtist
          .toLowerCase()
          .split(/[,&]|\s+ft\.?\s+|\s+feat\.?\s+|\s+with\s+/)
          .map((word) => word.trim())
          .filter((word) => word.length > 2);

        const matchingArtists = cleanArtistWords.filter(
          (artistWord) =>
            titleLower.includes(artistWord) ||
            resultArtistLower.includes(artistWord)
        );

        if (matchingArtists.length >= Math.min(2, cleanArtistWords.length)) {
          isFullCollaborationTranslation = true;
        }
      }

      const isFullCollaborationTranslationLegacy =
        isTranslation &&
        cleanArtist &&
        titleLower.includes("metro boomin") &&
        titleLower.includes("travis scott") &&
        titleLower.includes("young thug");

      const coverPatterns = [
        "cover",
        "remix",
        "version",
        "acoustic",
        "live",
        "karaoke",
        "instrumental",
        "tribute",
        "feat.",
        "ft.",
        "with",
      ];

      const isCover = coverPatterns.some(
        (pattern) =>
          titleLower.includes(pattern) || resultArtistLower.includes(pattern)
      );

      const curatorPatterns = [
        "playlist",
        "mix",
        "spotify",
        "radio",
        "top hits",
        "best of",
        "compilation",
        "various artists",
        "genius",
      ];

      const isCurator = curatorPatterns.some((pattern) =>
        resultArtistLower.includes(pattern)
      );

      if (isTranslation) {
        score -= 15;
      }

      if (
        isFullCollaborationTranslation ||
        isFullCollaborationTranslationLegacy
      ) {
        score -= 25;
      }

      if (isCover) {
        score -= 8;
      }

      if (isCurator) {
        score -= 15;
      }

      for (const songWord of songWords) {
        if (titleLower.includes(songWord)) {
          score += 3;
        }
      }

      for (const artistWord of artistWords) {
        if (titleLower.includes(artistWord)) {
          score += 2;
        }
      }

      if (
        titleLower === cleanSongName.toLowerCase() &&
        cleanArtist &&
        resultArtistLower === cleanArtist.toLowerCase()
      ) {
        score += 15;
      } else if (titleLower === cleanSongName.toLowerCase()) {
        score += 8;
      }

      if (cleanArtist && resultArtistLower === cleanArtist.toLowerCase()) {
        score += 8;
      }

      if (cleanArtist) {
        const cleanArtistLower = cleanArtist.toLowerCase();
        const primaryArtist = cleanArtistLower
          .split(/[,&]|\s+ft\.?\s+|\s+feat\.?\s+/)[0]
          .trim();
        const featuredArtists = cleanArtistLower.match(
          /[,&]|\s+ft\.?\s+|\s+feat\.?\s+/g
        )
          ? cleanArtistLower
              .split(/[,&]|\s+ft\.?\s+|\s+feat\.?\s+/)
              .slice(1)
              .join(" ")
              .trim()
          : "";

        if (
          resultArtistLower.includes(primaryArtist) &&
          primaryArtist.length > 2
        ) {
          score += 5;
        }

        if (featuredArtists) {
          const featuredWords = featuredArtists.split(/\s+/);
          for (const featWord of featuredWords) {
            if (featWord.length > 2 && resultArtistLower.includes(featWord)) {
              score += 2;
            }
          }
        }

        const originalArtistVariations = [
          "charlie puth",
          "selena gomez",
          "charlie puth & selena gomez",
        ];

        for (const variation of originalArtistVariations) {
          if (
            cleanArtistLower.includes(variation.split(" ")[0]) &&
            resultArtistLower.includes(variation.split(" ")[0])
          ) {
            score += 3;
            break;
          }
        }
      }

      console.log(
        `Score for "${result.title}" by "${result.artist}": ${score} ${
          isTranslation ? "(TRANSLATION)" : ""
        } ${isCover ? "(COVER)" : ""} ${isCurator ? "(CURATOR)" : ""}`
      );

      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
      }
    }

    if (!bestMatch) {
      return res.status(404).json({ error: "No matching song found" });
    }

    console.log(
      `Best match: "${bestMatch.title}" by "${bestMatch.artist}" with score ${bestScore}`
    );

    const lyricsData = await getLyrics(bestMatch.url);

    const responseData = {
      title: bestMatch.title,
      artist: bestMatch.artist,
      image: bestMatch.image,
      lyrics: lyricsData.lyrics,
    };

    lyricsCache.set(cacheKey, responseData);
    console.log(`Cached lyrics for: ${cacheKey}`);

    res.json(responseData);
  } catch (error) {
    console.error("Error fetching lyrics:", error);
    res.status(500).json({ error: "Failed to fetch lyrics" });
  }
});

async function refreshAccessToken(sessionId, session) {
  const tokenResponse = await axios.post(
    "https://accounts.spotify.com/api/token",
    querystring.stringify({
      grant_type: "refresh_token",
      refresh_token: session.refresh_token,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${CLIENT_ID}:${CLIENT_SECRET}`
        ).toString("base64")}`,
      },
    }
  );

  const { access_token, expires_in, refresh_token } = tokenResponse.data;
  const expiresAt = Date.now() + expires_in * 1000;

  updateSession.run(
    access_token,
    refresh_token || session.refresh_token,
    expiresAt,
    sessionId
  );
}

async function refreshTokenSilently(sessionId) {
  const session = getSession.get(sessionId);
  if (!session) return;

  try {
    await refreshAccessToken(sessionId, session);
    setTimeout(() => refreshTokenSilently(sessionId), 3300000);
  } catch (err) {
    console.error("Silent refresh failed:", err.message);
  }
}

function handleApiError(err, res, sessionId) {
  console.error("API error:", err.response?.data || err.message);

  if (err.response?.status === 401) {
    deleteSession.run(sessionId);
    return res
      .status(401)
      .json({ error: "Session expired", needsReauth: true });
  }

  res.status(500).json({ error: "Request failed" });
}

function generateRandomString(length) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const allSessions = db.prepare("SELECT session_id, expires_at FROM sessions");
const sessions = allSessions.all();
sessions.forEach((session) => {
  const timeUntilExpiry = session.expires_at - Date.now();
  if (timeUntilExpiry > 300000) {
    setTimeout(
      () => refreshTokenSilently(session.session_id),
      timeUntilExpiry - 300000
    );
  }
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Redirect URI: ${REDIRECT_URI}`);
  console.log(`Frontend URI: ${FRONTEND_REDIRECT}`);
  console.log(`Database: spotify_tokens.db`);
  console.log(`WebSocket: enabled`);
});
