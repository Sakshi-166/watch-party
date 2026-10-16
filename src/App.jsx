
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import {
  Clapperboard,
  CircleHelp,
  Copy,
  Film,
  Heart,
  LogOut,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  Users,
  Vote,
  Wifi,
  WifiOff,
  SkipForward
} from "lucide-react";
import { supabase } from "./lib/supabase";

const SAMPLE_VIDEO =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const MOVIES = [
  {
    id: "movie-1",
    title: "The Sample Adventure",
    genre: "Adventure",
    year: 2025,
    description: "A sample video for testing synchronized playback.",
    video_url: SAMPLE_VIDEO
  },
  {
    id: "movie-2",
    title: "Midnight Mystery",
    genre: "Mystery",
    year: 2024,
    description: "A mystery pick for your next watch party.",
    video_url: SAMPLE_VIDEO
  },
  {
    id: "movie-3",
    title: "Space Explorers",
    genre: "Sci-Fi",
    year: 2025,
    description: "A science-fiction themed demo selection.",
    video_url: SAMPLE_VIDEO
  },
  {
    id: "movie-4",
    title: "Laugh Together",
    genre: "Comedy",
    year: 2023,
    description: "A comedy-themed demo selection.",
    video_url: SAMPLE_VIDEO
  },
  {
    id: "movie-5",
    title: "The Last Journey",
    genre: "Drama",
    year: 2024,
    description: "A drama-themed demo selection.",
    video_url: SAMPLE_VIDEO
  },
  {
    id: "movie-6",
    title: "Wild Planet",
    genre: "Documentary",
    year: 2022,
    description: "A documentary-themed demo selection.",
    video_url: SAMPLE_VIDEO
  }
];

function getUserId() {
  const key = "watch-party-user-id";
  let id = localStorage.getItem(key);

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }

  return id;
}

function getUsername() {
  return localStorage.getItem("watch-party-username") || "";
}

function makeRoomCode() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}

function formatTime(seconds = 0) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function expectedPosition(room) {
  if (!room) return 0;

  const start = Number(room.position_seconds || 0);

  if (!room.is_playing) return start;

  const updatedAt = new Date(
    room.playback_updated_at || Date.now()
  ).getTime();

  return start + Math.max(0, (Date.now() - updatedAt) / 1000);
}

export default function App() {
  const userId = useMemo(() => getUserId(), []);

  const [username, setUsername] = useState(getUsername);
  const [nameInput, setNameInput] = useState(getUsername);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All");
  const [playlist, setPlaylist] = useState([]);
  const [polls, setPolls] = useState([]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("Yes,No");
  const [chatInput, setChatInput] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const videoRef = useRef(null);
  const channelRef = useRef(null);
  const roomRef = useRef(null);
  const correctionRef = useRef(false);
  const noticeTimerRef = useRef(null);

  const isHost = room?.host_id === userId;

  const filteredMovies = useMemo(() => {
    const items =
      genre === "All"
        ? MOVIES
        : MOVIES.filter((movie) => movie.genre === genre);

    if (!search.trim()) return items;

    const fuse = new Fuse(items, {
      keys: ["title", "genre", "description"],
      threshold: 0.4
    });

    return fuse.search(search).map((result) => result.item);
  }, [search, genre]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    return () => window.clearTimeout(noticeTimerRef.current);
  }, []);

  const showNotice = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 3500);
  }, []);

  const saveUsername = () => {
    const clean = nameInput.trim().slice(0, 30);

    if (!clean) {
      showNotice("Please enter a display name.");
      return;
    }

    localStorage.setItem("watch-party-username", clean);
    setUsername(clean);
  };

  const enterRoom = useCallback(
    async (code) => {
      if (!supabase) {
        showNotice("Configure Supabase before joining a room.");
        return;
      }

      if (!username) {
        showNotice("Enter your display name first.");
        return;
      }

      const cleanCode = code.trim().toUpperCase();

      if (!cleanCode) {
        showNotice("Enter a room code.");
        return;
      }

      setLoading(true);

      try {
        const { data, error } = await supabase
          .from("rooms")
          .select("*")
          .eq("code", cleanCode)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          showNotice("Room not found. Check the room code.");
          return;
        }

        setRoom(data);
        setPlaylist(data.playlist || []);
        setPolls(data.polls || []);
        setMessages([]);

        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}?room=${cleanCode}`
        );
      } catch (error) {
        showNotice(error.message || "Unable to join room.");
      } finally {
        setLoading(false);
      }
    },
    [username, showNotice]
  );

  const createRoom = async () => {
    if (!supabase) {
      showNotice("Configure Supabase before creating a room.");
      return;
    }

    if (!username) {
      showNotice("Enter your display name first.");
      return;
    }

    setLoading(true);

    try {
      let created = null;

      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        const code = makeRoomCode();

        const { data, error } = await supabase
          .from("rooms")
          .insert({
            code,
            host_id: userId,
            video_title: "The Sample Adventure",
            video_url: SAMPLE_VIDEO,
            is_playing: false,
            position_seconds: 0,
            playback_updated_at: new Date().toISOString(),
            playlist: [],
            polls: []
          })
          .select()
          .single();

        if (!error) {
          created = data;
        } else if (error.code !== "23505") {
          throw error;
        }
      }

      if (!created) {
        throw new Error("Could not create a unique room. Please try again.");
      }

      setRoom(created);
      setPlaylist([]);
      setPolls([]);
      setMessages([]);

      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?room=${created.code}`
      );
    } catch (error) {
      showNotice(error.message || "Could not create room.");
    } finally {
      setLoading(false);
    }
  };

  // Restore a room from the URL when the page is refreshed.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room");

    if (code && username && supabase) {
      enterRoom(code);
    }
  }, [username, enterRoom]);

  // Subscribe to shared room changes, messages, reactions and presence.
  useEffect(() => {
    if (!room?.code || !supabase) return;

    let active = true;
    const code = room.code;

    const channel = supabase
      .channel(`watch-party-${code}`, {
        config: {
          presence: { key: userId },
          broadcast: { self: false }
        }
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `code=eq.${code}`
        },
        (payload) => {
          if (!active || !payload.new?.code) return;

          setRoom(payload.new);
          setPlaylist(payload.new.playlist || []);
          setPolls(payload.new.polls || []);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_code=eq.${code}`
        },
        (payload) => {
          if (!active) return;

          setMessages((old) => {
            if (old.some((message) => message.id === payload.new.id)) {
              return old;
            }

            return [...old, payload.new].slice(-200);
          });
        }
      )
      .on("broadcast", { event: "reaction" }, ({ payload }) => {
        if (!active) return;

        const reaction = {
          id: crypto.randomUUID(),
          emoji: payload.emoji,
          username: payload.username
        };

        setReactions((old) => [...old.slice(-15), reaction]);

        window.setTimeout(() => {
          setReactions((old) => old.filter((item) => item.id !== reaction.id));
        }, 2200);
      })
      .on("presence", { event: "sync" }, () => {
        if (!active) return;

        const state = channel.presenceState();
        const people = Object.values(state)
          .flat()
          .map((entry) => ({
            id: entry.user_id,
            username: entry.username
          }));

        setParticipants(people);
      })
      .subscribe(async (status) => {
        if (!active) return;

        setConnected(status === "SUBSCRIBED");

        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            username,
            online_at: new Date().toISOString()
          });
        }
      });

    channelRef.current = channel;

    const loadInitialData = async () => {
      const { data: currentRoom, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (!active) return;
      if (error) {
        showNotice("Unable to refresh room state.");
        return;
      }
      if (!currentRoom) return;

      setRoom(currentRoom);
      setPlaylist(currentRoom.playlist || []);
      setPolls(currentRoom.polls || []);

      const { data: existingMessages, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .eq("room_code", code)
        .order("created_at", { ascending: true })
        .limit(200);

      if (active && !messagesError && existingMessages) {
        setMessages(existingMessages);
      }
    };

    loadInitialData();

    return () => {
      active = false;
      supabase.removeChannel(channel);
      channelRef.current = null;
      setConnected(false);
      setParticipants([]);
    };
  }, [room?.code, userId, username, showNotice]);

  // Synchronize the video with the shared room state.
  useEffect(() => {
    const video = videoRef.current;

    if (!room || !video) return;

    const target = expectedPosition(room);

    if (Number.isFinite(target) && Math.abs(video.currentTime - target) > 0.5) {
      correctionRef.current = true;
      video.currentTime = target;

      window.setTimeout(() => {
        correctionRef.current = false;
      }, 300);
    }

    if (room.is_playing && video.paused) {
      video.play().catch(() => {
        showNotice("Press play on the video if your browser blocks autoplay.");
      });
    } else if (!room.is_playing && !video.paused) {
      video.pause();
    }
  }, [room, showNotice]);

  // Periodically correct playback drift and refresh the displayed clock.
  useEffect(() => {
    if (!room) return;

    const interval = window.setInterval(() => {
      const video = videoRef.current;
      const currentRoom = roomRef.current;

      if (!video || !currentRoom) return;

      setCurrentTime(video.currentTime || 0);

      if (!currentRoom.is_playing || video.paused) return;

      const target = expectedPosition(currentRoom);

      if (
        Math.abs(video.currentTime - target) > 0.5 &&
        !correctionRef.current
      ) {
        correctionRef.current = true;
        video.currentTime = target;

        window.setTimeout(() => {
          correctionRef.current = false;
        }, 300);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [room?.code]);

  const updatePlayback = async (playing, position) => {
    if (!room || !supabase) return;

    if (!isHost) {
      showNotice("Only the host can control playback.");
      return;
    }

    const { error } = await supabase
      .from("rooms")
      .update({
        is_playing: playing,
        position_seconds: Math.max(0, position),
        playback_updated_at: new Date().toISOString()
      })
      .eq("code", room.code)
      .eq("host_id", userId);

    if (error) showNotice(error.message);
  };

  const togglePlayback = async () => {
    if (!room) return;

    const video = videoRef.current;
    await updatePlayback(
      !room.is_playing,
      video?.currentTime ?? expectedPosition(room)
    );
  };

  const seekVideo = async (event) => {
    if (!isHost || !videoRef.current) return;

    const position = Number(event.target.value);
    videoRef.current.currentTime = position;
    setCurrentTime(position);

    await updatePlayback(room.is_playing, position);
  };

  const sendMessage = async (event) => {
    event.preventDefault();

    const content = chatInput.trim();
    if (!content || !room || !supabase) return;

    setChatInput("");

    const { error } = await supabase.from("messages").insert({
      room_code: room.code,
      user_id: userId,
      username,
      content: content.slice(0, 1000)
    });

    if (error) showNotice("Could not send message.");
  };

  const sendReaction = async (emoji) => {
    if (!channelRef.current) return;

    await channelRef.current.send({
      type: "broadcast",
      event: "reaction",
      payload: { emoji, username }
    });
  };

  // Host-only updates are the default.
  // Poll voting passes false, allowing prototype voting by participants.
  const saveRoomData = async (changes, hostOnly = true) => {
    if (!room || !supabase) return;

    if (hostOnly && !isHost) {
      showNotice("Only the host can make this change.");
      return;
    }

    let query = supabase
      .from("rooms")
      .update(changes)
      .eq("code", room.code);

    if (hostOnly) {
      query = query.eq("host_id", userId);
    }

    const { error } = await query;

    if (error) showNotice(error.message);
  };

  const addToPlaylist = async (movie) => {
    if (!room) return;

    if (!isHost) {
      showNotice("Only the host can edit the shared playlist.");
      return;
    }

    if (playlist.some((item) => item.id === movie.id)) {
      showNotice("That movie is already in the playlist.");
      return;
    }

    const next = [...playlist, movie];

    setPlaylist(next);
    await saveRoomData({ playlist: next });
    showNotice("Added to shared playlist.");
  };

  const playFromPlaylist = async (movie) => {
    if (!isHost) {
      showNotice("Ask the host to select a movie.");
      return;
    }

    await saveRoomData({
      video_title: movie.title,
      video_url: movie.video_url,
      is_playing: false,
      position_seconds: 0,
      playback_updated_at: new Date().toISOString()
    });
  };

  const createPoll = async (event) => {
    event.preventDefault();

    if (!isHost) return;

    const question = pollQuestion.trim();
    const options = pollOptions
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean)
      .slice(0, 6);

    if (!question || options.length < 2) {
      showNotice("Enter a question and at least two options.");
      return;
    }

    const poll = {
      id: crypto.randomUUID(),
      question,
      options: options.map((label) => ({ label, votes: [] })),
      created_by: userId
    };

    const next = [...polls, poll];

    setPolls(next);
    setPollQuestion("");

    await saveRoomData({ polls: next });
  };

  const votePoll = async (pollId, optionIndex) => {
    if (!room) return;

    const next = polls.map((poll) => {
      if (poll.id !== pollId) return poll;

      return {
        ...poll,
        options: poll.options.map((option, index) => {
          const votes = (option.votes || []).filter((id) => id !== userId);

          if (index === optionIndex) votes.push(userId);

          return { ...option, votes };
        })
      };
    });

    setPolls(next);
    await saveRoomData({ polls: next }, false);
  };

  const transferHost = async (person) => {
    if (!isHost || !person || person.id === userId) return;

    if (!window.confirm(`Transfer host control to ${person.username}?`)) {
      return;
    }

    await saveRoomData({ host_id: person.id });
    showNotice("Host transfer submitted.");
  };

  const leaveRoom = () => {
    if (channelRef.current && supabase) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setRoom(null);
    setMessages([]);
    setParticipants([]);
    setPlaylist([]);
    setPolls([]);
    setConnected(false);

    window.history.replaceState({}, "", window.location.pathname);
  };

  const copyInvite = async () => {
    const link =
      `${window.location.origin}${window.location.pathname}?room=${room.code}`;

    try {
      await navigator.clipboard.writeText(link);
      showNotice("Invite link copied.");
    } catch {
      showNotice(`Share this room code: ${room.code}`);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            leaveRoom();
          }}
        >
          <span className="brand-icon"><Film size={22} /></span>
          <span>watch<span className="accent">party</span></span>
        </a>

        <div className="topbar-right">
          {room && (
            <span className={`connection ${connected ? "online" : ""}`}>
              {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
              {connected ? "Connected" : "Connecting"}
            </span>
          )}
          <span className="avatar">
            {username ? username[0].toUpperCase() : "?"}
          </span>
        </div>
      </header>

      {!username ? (
        <main className="welcome-page">
          <div className="hero-badge"><span /> YOUR MOVIE NIGHT STARTS HERE</div>
          <h1>Movies are better<br /><span>together.</span></h1>
          <p className="hero-description">
            Watch in sync, share reactions, discover something new,
            and make every movie night a group experience.
          </p>

          <section className="setup-card">
            <h2>Let's get you started</h2>
            <label htmlFor="display-name">Your display name</label>
            <input
              id="display-name"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder="What should friends call you?"
              maxLength={30}
            />
            <button className="primary-button full-button" onClick={saveUsername}>
              Continue <SkipForward size={17} />
            </button>
          </section>
        </main>
      ) : !room ? (
        <main className="welcome-page">
          <div className="hero-badge"><span /> YOUR PRIVATE MOVIE LOUNGE</div>
          <h1>Movies are better<br /><span>together.</span></h1>
          <p className="hero-description">
            Create a room for friends or enter a room code to join a watch party.
          </p>

          {!supabase && (
            <div className="notice warning">
              <Settings size={18} />
              Supabase is not configured yet. Shared rooms require a backend connection.
            </div>
          )}

          <section className="setup-card">
            <h2>Create a watch party</h2>
            <p>Start a room and invite your friends with a link.</p>

            <button
              className="primary-button full-button"
              onClick={createRoom}
              disabled={loading || !supabase}
            >
              <Plus size={18} />
              {loading ? "Creating..." : "Create a room"}
            </button>

            <div className="separator"><span>OR JOIN YOUR FRIENDS</span></div>

            <label htmlFor="room-code">Room code</label>
            <div className="join-row">
              <input
                id="room-code"
                value={roomCodeInput}
                onChange={(event) =>
                  setRoomCodeInput(event.target.value.toUpperCase())
                }
                placeholder="E.G. A1B2C3"
                maxLength={6}
              />
              <button
                className="primary-button"
                onClick={() => enterRoom(roomCodeInput)}
                disabled={loading || !supabase}
              >
                Join <SkipForward size={16} />
              </button>
            </div>
          </section>

          <div className="feature-strip">
            <span><Users size={17} /> Group watch</span>
            <span><MessageCircle size={17} /> Live chat</span>
            <span><Heart size={17} /> Reactions</span>
          </div>
        </main>
      ) : (
        <main className="dashboard">
          <div className="room-heading">
            <div>
              <div className="eyebrow">YOUR WATCH ROOM</div>
              <h1>{room.video_title}</h1>
              <p>
                Room <strong>{room.code}</strong> ·{" "}
                {isHost ? "You're the host" : "You're watching together"}
              </p>
            </div>

            <div className="room-actions">
              <button className="secondary-button" onClick={copyInvite}>
                <Copy size={16} /> Invite
              </button>
              <button className="secondary-button" onClick={leaveRoom}>
                <LogOut size={16} /> Leave
              </button>
            </div>
          </div>

          <div className="watch-layout">
            <section className="main-column">
              <div className="video-card">
                <div className="video-topline">
                  <span className="live-dot" />
                  {room.is_playing ? "NOW PLAYING" : "READY WHEN YOU ARE"}
                  <span className="video-topline-spacer" />
                  <span><Users size={15} /> {participants.length} online</span>
                </div>

                <div className="video-wrapper">
                  <video
                    ref={videoRef}
                    src={room.video_url || SAMPLE_VIDEO}
                    controls={false}
                    playsInline
                    onTimeUpdate={(event) =>
                      setCurrentTime(event.currentTarget.currentTime)
                    }
                    onLoadedMetadata={(event) =>
                      setDuration(event.currentTarget.duration || 0)
                    }
                    onEnded={() => updatePlayback(false, 0)}
                    onError={() => showNotice("Video unavailable. Try another video URL.")}
                  />

                  {reactions.length > 0 && (
                    <div className="floating-reactions" aria-live="polite">
                      {reactions.slice(-6).map((reaction) => (
                        <span key={reaction.id} title={reaction.username}>
                          {reaction.emoji}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="video-controls">
                  <button
                    className="play-button"
                    onClick={togglePlayback}
                    title={isHost ? "Play or pause" : "Only the host can control playback"}
                  >
                    {room.is_playing ? <Pause size={21} /> : <Play size={21} />}
                  </button>

                  <span className="time-label">{formatTime(currentTime)}</span>

                  <input
                    className="seek-slider"
                    type="range"
                    min="0"
                    max={Math.max(duration, 1)}
                    step="0.5"
                    value={Math.min(currentTime, duration || 0)}
                    onChange={seekVideo}
                    disabled={!isHost}
                    aria-label="Seek video"
                  />

                  <span className="time-label">{formatTime(duration)}</span>
                </div>

                <div className="sync-status">
                  <span className="sync-dot" />
                  {connected ? "Room connected" : "Reconnecting to room"}
                  <span className="sync-note">Drift correction enabled</span>
                </div>
              </div>

              <section className="movie-section">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">FIND YOUR NEXT FILM</div>
                    <h2>Discover movies</h2>
                  </div>
                  <span className="result-count">{filteredMovies.length} titles</span>
                </div>

                <div className="search-row">
                  <Search size={18} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search movies, genres..."
                  />
                </div>

                <div className="genre-list">
                  {["All", ...new Set(MOVIES.map((movie) => movie.genre))].map((item) => (
                    <button
                      key={item}
                      className={`genre-chip ${genre === item ? "selected" : ""}`}
                      onClick={() => setGenre(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <div className="movie-grid">
                  {filteredMovies.map((movie, index) => (
                    <article className="movie-card" key={movie.id}>
                      <div className={`movie-art art-${index % 6}`}>
                        <Clapperboard size={34} />
                        <span>{movie.genre}</span>
                      </div>

                      <div className="movie-card-body">
                        <h3>{movie.title}</h3>
                        <p>{movie.year} · {movie.genre}</p>

                        <div className="movie-card-actions">
                          <button
                            className="small-button"
                            onClick={() => addToPlaylist(movie)}
                          >
                            <Plus size={15} /> Playlist
                          </button>

                          <button
                            className="small-button play-small"
                            onClick={() => playFromPlaylist(movie)}
                            disabled={!isHost}
                          >
                            <Play size={15} /> Play
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <p className="demo-note">
                  Demo catalog: titles and artwork are placeholders. Sample
                  selections currently use the same public test video.
                </p>
              </section>
            </section>

            <aside className="side-column">
              <section className="panel participants-panel">
                <div className="panel-title">
                  <Users size={18} />
                  <h2>In the room</h2>
                  <span className="count-pill">{participants.length}</span>
                </div>

                {participants.map((person) => (
                  <div className="participant" key={person.id}>
                    <span className="avatar small-avatar">
                      {(person.username || "?")[0].toUpperCase()}
                    </span>

                    <div className="participant-name">
                      <strong>{person.username}</strong>
                      {person.id === userId && <span>You</span>}
                    </div>

                    {person.id === room.host_id && (
                      <span className="host-tag">HOST</span>
                    )}

                    {isHost && person.id !== userId && (
                      <button
                        className="icon-button"
                        title="Transfer host"
                        onClick={() => transferHost(person)}
                      >
                        <Settings size={15} />
                      </button>
                    )}
                  </div>
                ))}

                {participants.length === 0 && (
                  <p className="muted-text">Waiting for participants...</p>
                )}
              </section>

              <section className="panel social-panel">
                <div className="tab-list">
                  <button
                    className={activeTab === "chat" ? "active" : ""}
                    onClick={() => setActiveTab("chat")}
                  >
                    <MessageCircle size={16} /> Chat
                  </button>

                  <button
                    className={activeTab === "playlist" ? "active" : ""}
                    onClick={() => setActiveTab("playlist")}
                  >
                    <Film size={16} /> Queue
                  </button>

                  <button
                    className={activeTab === "polls" ? "active" : ""}
                    onClick={() => setActiveTab("polls")}
                  >
                    <Vote size={16} /> Polls
                  </button>
                </div>

                {activeTab === "chat" && (
                  <div className="chat-content">
                    <div className="messages-list">
                      {messages.map((message) => (
                        <div className="chat-message" key={message.id}>
                          <span className="chat-avatar">
                            {(message.username || "?")[0].toUpperCase()}
                          </span>

                          <div>
                            <div className="chat-meta">
                              <strong>{message.username}</strong>
                              <time>
                                {new Date(message.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </time>
                            </div>
                            <p>{message.content}</p>
                          </div>
                        </div>
                      ))}

                      {messages.length === 0 && (
                        <div className="empty-state">
                          <MessageCircle size={24} />
                          <p>Start the conversation.</p>
                        </div>
                      )}
                    </div>

                    <form className="chat-form" onSubmit={sendMessage}>
                      <input
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        placeholder="Say something..."
                        maxLength={1000}
                      />
                      <button type="submit" title="Send message">
                        <Send size={17} />
                      </button>
                    </form>

                    <div className="reaction-bar">
                      <span>React</span>
                      {["❤️", "😂", "🔥", "😮", "👏", "🍿"].map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => sendReaction(emoji)}
                          title={`Send ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "playlist" && (
                  <div className="queue-content">
                    <div className="queue-heading">
                      <strong>Up next</strong>
                      <span>{playlist.length} movies</span>
                    </div>

                    {playlist.map((movie, index) => (
                      <div className="queue-item" key={movie.id}>
                        <span className="queue-number">{index + 1}</span>

                        <div className="queue-item-info">
                          <strong>{movie.title}</strong>
                          <span>{movie.genre}</span>
                        </div>

                        <button
                          className="icon-button"
                          onClick={() => playFromPlaylist(movie)}
                          disabled={!isHost}
                          title="Play this selection"
                        >
                          <Play size={15} />
                        </button>
                      </div>
                    ))}

                    {playlist.length === 0 && (
                      <div className="empty-state">
                        <Film size={24} />
                        <p>Your shared playlist is empty.</p>
                        <span>Add titles from Discover movies.</span>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "polls" && (
                  <div className="polls-content">
                    {polls.map((poll) => {
                      const total = poll.options.reduce(
                        (sum, option) => sum + (option.votes || []).length,
                        0
                      );

                      return (
                        <div className="poll-card" key={poll.id}>
                          <h3>{poll.question}</h3>

                          {poll.options.map((option, index) => {
                            const votes = option.votes || [];
                            const hasVoted = votes.includes(userId);

                            return (
                              <button
                                className="poll-option"
                                key={option.label}
                                onClick={() => votePoll(poll.id, index)}
                              >
                                <span>
                                  {option.label}{hasVoted ? " ✓" : ""}
                                </span>
                                <span>
                                  {votes.length} ·{" "}
                                  {total
                                    ? Math.round((votes.length / total) * 100)
                                    : 0}%
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}

                    {polls.length === 0 && (
                      <div className="empty-state">
                        <Vote size={24} />
                        <p>No group polls yet.</p>
                      </div>
                    )}

                    {isHost && (
                      <form className="poll-form" onSubmit={createPoll}>
                        <label>Question</label>
                        <input
                          value={pollQuestion}
                          onChange={(event) => setPollQuestion(event.target.value)}
                          placeholder="What should we watch?"
                          maxLength={150}
                        />

                        <label>Options, separated by commas</label>
                        <input
                          value={pollOptions}
                          onChange={(event) => setPollOptions(event.target.value)}
                          placeholder="Comedy, Thriller, Drama"
                        />

                        <button className="primary-button full-button" type="submit">
                          <Plus size={16} /> Create poll
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </section>

              <section className="panel room-info">
                <div className="panel-title">
                  <CircleHelp size={18} />
                  <h2>Room details</h2>
                </div>

                <div className="detail-row">
                  <span>Room code</span>
                  <strong>{room.code}</strong>
                </div>
                <div className="detail-row">
                  <span>Your role</span>
                  <strong>{isHost ? "Host" : "Participant"}</strong>
                </div>
                <div className="detail-row">
                  <span>Playback</span>
                  <strong>{room.is_playing ? "Playing" : "Paused"}</strong>
                </div>
              </section>
            </aside>
          </div>
        </main>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}

      <footer className="footer">
        <span>watch<span className="accent">party</span></span>
        <span>Made for movie nights with friends.</span>
      </footer>
    </div>
  );
}

