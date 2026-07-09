import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Shield, Moon, Sun, Crosshair, Users, MessageSquare, Activity, Clock, Info, X, Volume2, VolumeX } from 'lucide-react';
import './index.css';

const getRoleIcon = (role) => {
    switch (role) {
        case 'Werewolf': return '🐺';
        case 'Villager': return '🧑‍🌾';
        case 'Seer': return '👁️';
        case 'Guardian': return '🛡️';
        case 'Bodyguard': return '💂';
        case 'Hunter': return '🏹';
        case 'Witch': return '🧙‍♀️';
        default: return '';
    }
};

const BACKEND_URL = `http://${window.location.hostname}:3001`;
const socket = io(BACKEND_URL);

// Simple hash for distinct chat colors
const stringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = Math.floor(Math.abs((Math.sin(hash) * 10000) % 1 * 16777215)).toString(16);
  return '#' + '000000'.substring(0, 6 - color.length) + color;
};

const playSound = (filename, speed = 1.0, useFade = true) => {
    if (sessionStorage.getItem('werewolf_muted') === 'true') return;
    try {
        const audio = new Audio(`/sounds/${filename}`);
        audio.playbackRate = speed;
        audio.volume = useFade ? 0 : 1.0;
        
        audio.play().catch(err => {
            console.log("Audio auto-play blocked by browser (user hasn't interacted yet)", err);
        });

        if (useFade) {
            // 300ms Fade-in
            let fadeAmount = 0;
            const fadeInInterval = setInterval(() => {
                fadeAmount += 0.1;
                if (fadeAmount >= 1.0) {
                    audio.volume = 1.0;
                    clearInterval(fadeInInterval);
                } else {
                    audio.volume = fadeAmount;
                }
            }, 30);

            // 2-second Fade-out
            let isFadingOut = false;
            audio.addEventListener('timeupdate', () => {
                if (!isFadingOut && audio.duration && audio.currentTime >= audio.duration - 2.0) {
                    isFadingOut = true;
                    let currentVol = audio.volume;
                    const fadeOutInterval = setInterval(() => {
                        currentVol -= 0.05;
                        if (currentVol <= 0.05) {
                            audio.volume = 0;
                            clearInterval(fadeOutInterval);
                        } else {
                            audio.volume = currentVol;
                        }
                    }, 100); // 100ms * 20 steps = 2 seconds to fade out
                }
            });
        }
    } catch (err) {
        console.error("Failed to play sound:", err);
    }
};

function App() {
  const [username, setUsername] = useState('');
  const [savedUsername, setSavedUsername] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(sessionStorage.getItem('werewolf_muted') === 'true');

  const toggleMute = () => {
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      sessionStorage.setItem('werewolf_muted', newMuted);
  };

  useEffect(() => {
    const saved = localStorage.getItem('werewolf_username');
    if (saved) {
      setSavedUsername(saved);
      setUsername(saved);
    }
  }, []);
  const [gameState, setGameState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [myRole, setMyRole] = useState(null);
  const [timer, setTimer] = useState(0);
  
  const [leaderboard, setLeaderboard] = useState([]);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const [witchInfo, setWitchInfo] = useState(null);
  const [witchSave, setWitchSave] = useState(false);
  const [witchKill, setWitchKill] = useState('');

  const [myNightTarget, setMyNightTarget] = useState(null);
  const [witchConfirmed, setWitchConfirmed] = useState(false);

  useEffect(() => {
    if (gameState?.phase === 'NIGHT_WITCH') {
        setWitchConfirmed(false);
        setWitchKill('');
        setWitchSave(true);
    }
  }, [gameState?.phase]);
  const [wwTeam, setWwTeam] = useState([]);
  const [wwVotes, setWwVotes] = useState({});

  const chatEndRef = useRef(null);

  useEffect(() => {
    socket.on('game_state', (state) => {
      setGameState(prevState => {
          if (prevState?.phase === 'LOBBY' && state.phase !== 'LOBBY') {
              playSound('game-start.mp3');
          }
          return state;
      });
      if (state.phase !== 'NIGHT' && state.phase !== 'NIGHT_WITCH') {
          setWitchInfo(null);
          setWitchSave(false);
          setWitchKill('');
          setMyNightTarget(null); // reset local target tracking
      }
    });

    socket.on('joined', (success) => {
      setIsJoined(success);
      setErrorMsg('');
      if (success) {
        const trimmedUsername = username.trim();
        localStorage.setItem('werewolf_username', trimmedUsername);
        setSavedUsername(trimmedUsername);
      }
    });

    socket.on('join_error', (msg) => {
      setErrorMsg(msg);
    });

    socket.on('chat_message', (msg) => {
      setChatMessages(prev => [...prev, msg]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

      // Sound triggers from chat
      if (msg.text?.includes('Night falls')) {
          playSound('wolf-howl.mp3');
      } else if (msg.text?.includes('Morning Announcement')) {
          setTimeout(() => playSound('morning-comes.mp3'), 2000);
      } else if (msg.text?.includes('Voting Phase:')) {
          playSound('vote-session.mp3');
      }

      // Kill triggers
      if (msg.text?.includes('has been executed') || 
          msg.text?.includes('died during the night') || 
          (msg.text?.includes('Hunter') && msg.text?.includes('shot'))) {
          
          if (msg.text?.includes('Hunter') && msg.text?.includes('shot')) {
              playSound('hunter-shot.mp3');
              // Delay dying sound slightly after gunshot
              setTimeout(() => playSound('dying.mp3', 2.0), 600);
          } else {
              playSound('dying.mp3', 2.0);
          }
      }
    });

    socket.on('role_assigned', (role) => {
      setMyRole(role);
      setChatMessages(prev => [...prev, { system: true, text: `Role Assignment: You are a [${getRoleIcon(role)} ${role}].` }]);
    });

    socket.on('metrics_updated', () => {
      fetchLeaderboard();
    });

    socket.on('timer_sync', (t) => {
        setTimer(t);
        // Play timer warning when timer hits 5
        if (t === 5) {
            playSound('timer-end.mp3', 1.0, false);
        }
    });

    socket.on('witch_info', (info) => {
        setWitchInfo(info); // { werewolfTarget, hasSave, hasKill }
    });

    socket.on('werewolf_team', (team) => {
        setWwTeam(team);
    });

    socket.on('werewolf_votes', (votes) => {
        setWwVotes(votes);
    });

    socket.on('profile_deleted', (success, errMsg) => {
      if (success) {
         localStorage.removeItem('werewolf_username');
         setSavedUsername(null);
         setUsername('');
         setIsJoined(false);
      } else {
         setErrorMsg(`Failed to delete profile: ${errMsg || 'Please try again.'}`);
      }
    });

    return () => {
      socket.off('game_state');
      socket.off('joined');
      socket.off('join_error');
      socket.off('chat_message');
      socket.off('role_assigned');
      socket.off('metrics_updated');
      socket.off('timer_sync');
      socket.off('witch_info');
      socket.off('werewolf_team');
      socket.off('werewolf_votes');
      socket.off('profile_deleted');
    };
  }, [username]);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/metrics`);
      const data = await res.json();
      setLeaderboard(data);
    } catch (e) {}
  };

  useEffect(() => {
    if (showLeaderboard) fetchLeaderboard();
  }, [showLeaderboard]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      socket.emit('join_game', username.trim());
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      socket.emit('chat_message', chatInput.trim());
      setChatInput('');
    }
  };

  const handleStartGame = () => {
    socket.emit('start_game');
  };

  const handleLeaveGame = () => {
      socket.emit('leave_game');
      setIsJoined(false);
  };

  const handleDeleteProfile = () => {
      if (window.confirm("Warning: Your record in the leaderboard will be permanently deleted. Are you sure?")) {
          socket.emit('delete_profile', savedUsername);
      }
  };

  const sendAction = (type, target) => {
      if (type === 'vote') {
          const isSelected = gameState?.votes && gameState.votes[username] === target;
          const finalTarget = isSelected ? null : target;
          socket.emit('player_action', { type, target: finalTarget });
      } else {
          const isSelected = myNightTarget === target;
          const finalTarget = isSelected ? null : target;
          socket.emit('player_action', { type, target: finalTarget });
          setMyNightTarget(finalTarget);
      }
  };

  const sendWitchAction = (doNothing = false) => {
      if (doNothing) {
          socket.emit('player_action', { type: 'witch', save: false, killTarget: null });
      } else {
          socket.emit('player_action', { type: 'witch', save: true, killTarget: witchKill });
      }
      setWitchConfirmed(true);
  };

  const undoWitchAction = () => {
      socket.emit('player_action', { type: 'witch_undo' });
      setWitchConfirmed(false);
  };

  if (!isJoined) {
    return (
      <div className="login-screen">
        <form className="login-box" onSubmit={handleJoin}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Moon size={24} color="var(--erp-primary)" />
            <h2>Werewolf Manager</h2>
          </div>
          <p style={{ color: 'var(--erp-text-muted)', fontSize: '13px', marginBottom: '16px' }}>Authenticate to access the Village Sync.</p>
          
          {errorMsg && <div style={{ color: 'var(--erp-danger)', fontSize: '13px', padding: '8px', background: '#ffebe6', borderRadius: '3px', marginBottom: '16px' }}>{errorMsg}</div>}
          
          {savedUsername ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '12px', border: '1px solid var(--erp-border)', borderRadius: '4px', backgroundColor: '#fafbfc' }}>
                    <div style={{ fontSize: '12px', color: 'var(--erp-text-muted)' }}>Welcome back,</div>
                    <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{savedUsername}</div>
                </div>
                <button type="submit" className="erp-button" style={{ width: '100%' }}>Continue as {savedUsername}</button>
                <button type="button" className="erp-button danger" style={{ width: '100%' }} onClick={handleDeleteProfile}>Delete Profile & Metrics</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--erp-text-muted)' }}>VILLAGER ID / USERNAME</label>
              <input 
                type="text" 
                className="erp-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g., jsmith"
                required
              />
              <button type="submit" className="erp-button" style={{ marginTop: '8px' }}>Login</button>
            </div>
          )}
        </form>
      </div>
    );
  }

  const me = gameState?.players?.find(p => p.username === username);
  const alivePlayers = gameState?.players?.filter(p => p.isAlive) || [];
  
  const canChat = !!me && (gameState?.phase === 'DAY_CHAT' || gameState?.phase === 'LOBBY' || gameState?.phase === 'END');
  
  const formatTime = (s) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const getSystemStyle = (text) => {
      if (text.includes('executed') || text.includes('died') || text.includes('shot') || text.includes('Game Over') || text.includes('dying')) {
          return { bg: '#ffebe6', border: '#ffbdad', text: '#de350b' }; // danger red
      } else if (text.startsWith('Role Assignment') || text.includes('joined')) {
          return { bg: '#eae6ff', border: '#c0b6f2', text: '#403294' }; // purple
      } else if (text.startsWith('Seer Vision')) {
          return { bg: '#e6fcff', border: '#b3f5ff', text: '#006580' }; // cyan
      } else if (text.startsWith('Night falls') || text.includes('Morning Announcement')) {
          return { bg: 'var(--erp-system-night-bg)', border: 'var(--erp-system-night-border)', text: 'var(--erp-system-night-text)' }; // dark mode for night/morning
      } else {
          return { bg: '#e3fcef', border: '#abf5d1', text: '#00875a' }; // default green
      }
  };

  const isNightPhase = gameState?.phase === 'NIGHT' || gameState?.phase === 'NIGHT_WITCH';

  return (
    <div className={`app-container ${isNightPhase ? 'theme-night' : ''}`}>
      {/* Top Bar */}
      <header className="top-bar">
        <div className="top-bar-title">
          <Moon size={18} />
          <span className="hide-mobile">Werewolf Village Sync v5.1</span>
        </div>
        
        {timer > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '16px', fontWeight: 'bold', color: timer <= 5 ? '#ff991f' : 'white' }}>
                <Clock size={18} /> {formatTime(timer)}
            </div>
        )}

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className="hide-mobile">User: {username}</span>
          {myRole && <span className="erp-badge" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}><span className="hide-mobile">Role: </span>{getRoleIcon(myRole)} <span className="hide-mobile">{myRole}</span></span>}
          <button 
            className="erp-button" 
            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: 'transparent', border: '1px solid white' }}
            onClick={() => setShowHowToPlay(true)}
            title="How to Play"
          >
            <Info size={14} style={{ display: 'inline', verticalAlign: 'middle' }}/>
            <span className="hide-mobile" style={{ marginLeft: '4px' }}>How to Play</span>
          </button>
          <button 
            className="erp-button" 
            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: 'transparent', border: '1px solid white' }}
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            title="Leaderboard"
          >
            <Activity size={14} style={{ display: 'inline', verticalAlign: 'middle' }}/>
            <span className="hide-mobile" style={{ marginLeft: '4px' }}>{showLeaderboard ? 'Back' : 'Leaderboard'}</span>
          </button>
          <button 
            className="erp-button" 
            style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}
            onClick={toggleMute}
            title={isMuted ? "Unmute Sound" : "Mute Sound"}
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <button 
            className="erp-button danger" 
            style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center' }}
            onClick={handleLeaveGame}
            title="Leave Game"
          >
            <X size={14} className="show-mobile-only" />
            <span className="hide-mobile">Leave Game</span>
          </button>
        </div>
      </header>

      <div className="main-content">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-title">Village Status</div>
            <div style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Shield size={14} color="var(--erp-primary)" /> Phase: <strong>{gameState?.phase}</strong>
            </div>
            {gameState?.phase !== 'LOBBY' && (
              <div style={{ fontSize: '13px', marginBottom: '16px' }}>Day/Cycle: {gameState?.dayCount}</div>
            )}
            
            {gameState?.phase === 'LOBBY' && (
              <button className="erp-button" style={{ width: '100%' }} disabled={(gameState?.players?.length || 0) < 7} onClick={handleStartGame}>
                {(gameState?.players?.length || 0) < 7 ? `Waiting for players (${gameState?.players?.length || 0}/7)` : 'Start Game'}
              </button>
            )}
          </div>

          <div className="sidebar-section" style={{ flex: 1, overflowY: 'auto' }}>
            <div className="sidebar-title">Team Roster ({gameState?.players?.length || 0})</div>
            <ul className="roster-list">
              {gameState?.phase === 'DAY_VOTE' && me?.isAlive && (
                  <li className="roster-item" style={{ flexDirection: 'column', alignItems: 'flex-start', border: (gameState?.votes && gameState.votes[username] === '__SKIP__') ? '1px solid var(--erp-warning)' : '1px dashed var(--erp-border)', marginBottom: '8px', backgroundColor: (gameState?.votes && gameState.votes[username] === '__SKIP__') ? 'var(--erp-highlight-bg)' : '' }}>
                      <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px' }}>
                          <span style={{ flex: 1, color: 'var(--erp-text-main)', fontStyle: 'italic' }}>Skip Execution</span>
                          <button className={`erp-button ${(gameState?.votes && gameState.votes[username] === '__SKIP__') ? '' : 'danger'}`} style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: (gameState?.votes && gameState.votes[username] === '__SKIP__') ? 'var(--erp-warning)' : '' }} onClick={() => sendAction('vote', '__SKIP__')}>
                              {(gameState?.votes && gameState.votes[username] === '__SKIP__') ? 'Cancel Vote' : 'Vote to Skip'}
                          </button>
                      </div>
                      {gameState?.votes && Object.values(gameState.votes).filter(v => v === '__SKIP__').length > 0 && (
                          <div style={{ fontSize: '10px', color: 'var(--erp-danger)', marginLeft: '8px', fontWeight: 'bold' }}>
                              Votes to Skip: {Object.values(gameState.votes).filter(v => v === '__SKIP__').length}
                          </div>
                      )}
                  </li>
              )}
              {gameState?.players?.map((p, i) => {
                  
                  // Logic to show inline action buttons
                  let actionBtn = null;
                  
                  // Is this player currently selected by me?
                  const isVoted = gameState?.phase === 'DAY_VOTE' && gameState?.votes && gameState.votes[username] === p.username;
                  const isNightTargeted = gameState?.phase === 'NIGHT' && myNightTarget === p.username;
                  const isHunterTargeted = gameState?.phase === 'HUNTER_REVENGE' && myNightTarget === p.username;

                  if (me?.isAlive && p.isAlive && gameState?.phase === 'DAY_VOTE' && p.username !== username) {
                      actionBtn = <button className={`erp-button ${isVoted ? '' : 'danger'}`} style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: isVoted ? 'var(--erp-warning)' : '' }} onClick={() => sendAction('vote', p.username)}>{isVoted ? 'Cancel Vote' : 'Vote (Execute)'}</button>;
                  }
                  else if (me?.isAlive && gameState?.phase === 'NIGHT' && p.isAlive) {
                      if (myRole === 'Werewolf' && p.username !== username && !wwTeam.includes(p.username)) {
                           actionBtn = <button className={`erp-button ${isNightTargeted ? 'warning' : 'danger'}`} style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: isNightTargeted ? 'var(--erp-warning)' : '' }} onClick={() => sendAction('target', p.username)}>{isNightTargeted ? 'Cancel Attack' : 'Werewolf Attack'}</button>;
                      } else if (myRole === 'Seer' && p.username !== username) {
                           const seerLocked = myNightTarget !== null;
                           actionBtn = <button className="erp-button" disabled={seerLocked} style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: isNightTargeted ? 'var(--erp-warning)' : '' }} onClick={() => sendAction('target', p.username)}>{isNightTargeted ? 'Checked' : 'Seer Check'}</button>;
                      } else if (myRole === 'Guardian') {
                           actionBtn = <button className="erp-button success" style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: isNightTargeted ? 'var(--erp-warning)' : 'var(--erp-success)' }} onClick={() => sendAction('target', p.username)}>{isNightTargeted ? 'Cancel Protect' : 'Guardian Protect'}</button>;
                      } else if (myRole === 'Bodyguard' && p.username !== username) {
                           actionBtn = <button className="erp-button success" style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: isNightTargeted ? 'var(--erp-warning)' : 'var(--erp-success)' }} onClick={() => sendAction('target', p.username)}>{isNightTargeted ? 'Cancel Defend' : 'Bodyguard Defend'}</button>;
                      }
                  }
                  else if (me?.isAlive && myRole === 'Witch' && gameState?.phase === 'NIGHT_WITCH' && !witchConfirmed && p.username !== username && witchInfo?.werewolfTarget && witchInfo?.hasSave && witchInfo?.hasKill && p.isAlive) {
                      const isTarget = witchKill === p.username;
                      const isWWTarget = witchInfo?.werewolfTarget === p.username;
                      if (!isWWTarget) {
                          actionBtn = <button className={`erp-button ${isTarget ? 'warning' : 'danger'}`} style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: isTarget ? 'var(--erp-warning)' : '' }} onClick={() => setWitchKill(isTarget ? '' : p.username)}>{isTarget ? 'Cancel Poison' : 'Select to Poison'}</button>;
                      } else {
                          actionBtn = <span className="erp-badge" style={{fontSize: '9px', backgroundColor: 'var(--erp-danger)', color: 'white'}}>Attacked</span>;
                      }
                  }
                  else if (myRole === 'Hunter' && gameState?.phase === 'HUNTER_REVENGE' && p.username !== username && p.isAlive) {
                      actionBtn = <button className="erp-button danger" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => sendAction('target', p.username)}>Hunter Shoot</button>;
                  }

                  const votesAgainst = Object.values(gameState?.votes || {}).filter(v => v === p.username).length;
                  const wwTargetedBy = Object.entries(wwVotes).filter(([wwName, target]) => target === p.username).map(([wwName]) => wwName);

                  return (
                    <li key={i} className="roster-item" style={{ flexDirection: 'column', alignItems: 'flex-start', border: (isVoted || isNightTargeted) ? '1px solid var(--erp-warning)' : '1px solid transparent', backgroundColor: (isVoted || isNightTargeted) ? 'var(--erp-highlight-bg)' : '' }}>
                      <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px' }}>
                          <div className={`status-dot`} style={{ backgroundColor: !p.isAlive ? '#5e6c84' : (!p.connected ? '#ff991f' : 'var(--erp-success)') }} title={!p.isAlive ? 'Dead' : (!p.connected ? 'Offline/Disconnected' : 'Active')}></div>
                          <span style={{ flex: 1, color: p.isAlive ? 'inherit' : 'var(--erp-text-muted)', textDecoration: p.isAlive ? 'none' : 'line-through' }}>
                            {p.username}
                          </span>
                          {p.role && <span className="erp-badge" style={{fontSize:'10px', padding: '2px 4px'}}>{getRoleIcon(p.role)} {p.role}</span>}
                          {actionBtn}
                      </div>
                      
                      {gameState?.phase === 'DAY_VOTE' && votesAgainst > 0 && (
                          <div style={{ fontSize: '10px', color: 'var(--erp-danger)', marginLeft: '16px', fontWeight: 'bold' }}>
                              Votes Received: {votesAgainst}
                          </div>
                      )}
                      
                      {gameState?.phase === 'DAY_VOTE' && gameState?.votes[p.username] && (
                          <div style={{ fontSize: '10px', color: 'var(--erp-text-muted)', marginLeft: '16px' }}>
                              Voted for: <strong>{gameState.votes[p.username]}</strong>
                          </div>
                      )}
                      
                      {gameState?.phase === 'NIGHT' && myRole === 'Werewolf' && wwTargetedBy.length > 0 && (
                          <div style={{ fontSize: '10px', color: 'var(--erp-danger)', marginLeft: '16px', fontWeight: 'bold' }}>
                              Targeted by: {wwTargetedBy.join(', ')}
                          </div>
                      )}
                    </li>
                  );
              })}
            </ul>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="workspace">
          
          {showLeaderboard ? (
            <div className="panel">
              <div className="panel-header">Leaderboard</div>
              <div style={{ padding: '20px', overflowX: 'auto' }}>
                <table className="erp-table" style={{ minWidth: '400px' }}>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Games Played</th>
                      <th>Success Rate</th>
                      <th>Wins</th>
                      <th>Losses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map(row => (
                      <tr key={row.username}>
                        <td>{row.username}</td>
                        <td>{row.games_played}</td>
                        <td>{Math.round((row.wins / row.games_played) * 100)}%</td>
                        <td>{row.wins}</td>
                        <td>{row.losses}</td>
                      </tr>
                    ))}
                    {leaderboard.length === 0 && <tr><td colSpan="5">No data available.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              {/* New Witch Panel */}
              {me?.isAlive && myRole === 'Witch' && gameState?.phase === 'NIGHT_WITCH' && (
                  <div className="panel" style={{ marginBottom: '16px', borderLeft: '4px solid #a371f7' }}>
                      <div className="panel-header" style={{ color: '#a371f7', paddingBottom: '8px' }}>Witch Action Required</div>
                      <div style={{ padding: '0 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {witchInfo?.werewolfTarget ? (
                              <div style={{ color: 'var(--erp-danger)', fontWeight: 'bold' }}>
                                  ⚠️ Werewolves attacked: {witchInfo.werewolfTarget}
                              </div>
                          ) : (
                              <div style={{ color: 'var(--erp-text-muted)' }}>
                                  Werewolves did not attack anyone.
                              </div>
                          )}
                          
                          {witchConfirmed ? (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--erp-success-bg, #e3fcef)', padding: '12px', borderRadius: '4px', border: '1px solid var(--erp-success, #00875a)' }}>
                                  <span style={{ color: 'var(--erp-success, #006644)', fontWeight: 'bold' }}>✓ Action Registered</span>
                                  <button className="erp-button" style={{ backgroundColor: 'transparent', color: 'var(--erp-text-main)', border: '1px solid var(--erp-border)' }} onClick={undoWitchAction}>Undo</button>
                              </div>
                          ) : !witchInfo?.werewolfTarget ? (
                              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                  <div style={{ flex: 1, fontSize: '13px', color: 'var(--erp-text-muted)', lineHeight: 1.4 }}>
                                      Werewolves failed to agree on a target! No one was attacked, so you don't need to use your potions tonight.
                                  </div>
                                  <button className="erp-button" style={{ flex: 1, backgroundColor: 'transparent', color: 'var(--erp-text-main)', border: '1px solid var(--erp-border)' }} onClick={() => sendWitchAction(true)}>
                                      Confirm: Do Nothing
                                  </button>
                              </div>
                          ) : (
                              <>
                                  <div style={{ fontSize: '13px', color: 'var(--erp-text-main)' }}>
                                      To save <strong style={{ color: 'var(--erp-danger)' }}>{witchInfo?.werewolfTarget}</strong>, you MUST poison someone else.<br/>
                                      <strong>Selected to Poison:</strong> {witchKill ? <span style={{ color: 'var(--erp-danger)', fontWeight: 'bold' }}>{witchKill}</span> : <span style={{ color: 'var(--erp-text-muted)' }}>None (Click a player on the left roster)</span>}
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                      <button className="erp-button warning" style={{ flex: 1 }} disabled={!witchKill} onClick={() => sendWitchAction(false)}>
                                          Confirm: Save & Poison
                                      </button>
                                      <button className="erp-button" style={{ flex: 1, backgroundColor: 'var(--erp-bg-main)', color: 'var(--erp-text-main)', border: '1px solid var(--erp-border)' }} onClick={() => sendWitchAction(true)}>
                                          Confirm: Do Nothing
                                      </button>
                                  </div>
                              </>
                          )}
                      </div>
                  </div>
              )}

              {/* Chat Panel */}
              <div className="panel chat-container" style={{ flex: 1 }}>
                <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageSquare size={16} /> Sync Channel
                </div>
                <div className="chat-messages">
                  {chatMessages.map((msg, i) => {
                    const isSystem = msg.system;
                    const avatarColor = !isSystem ? stringToColor(msg.username) : '';
                    let sysStyle = null;
                    if (isSystem) sysStyle = getSystemStyle(msg.text);

                    return (
                      <div key={i} className={`chat-message ${isSystem ? 'system' : ''}`} style={{ borderLeft: !isSystem ? `4px solid ${avatarColor}` : 'none', paddingLeft: !isSystem ? '8px' : '0' }}>
                        {!isSystem && (
                          <div className="chat-meta">
                            <span className="chat-author" style={{ color: avatarColor }}>{msg.username}</span>
                            {msg.team === 'Dead' && <span style={{ marginLeft: '6px', fontSize: '9px', color: '#de350b', border: '1px solid #de350b', padding: '1px 3px', borderRadius: '2px' }}>DEAD</span>}
                          </div>
                        )}
                        <div className="chat-text" style={{ 
                            backgroundColor: !isSystem ? 'var(--erp-chat-bg)' : sysStyle.bg, 
                            border: !isSystem ? '1px solid var(--erp-border)' : `1px solid ${sysStyle.border}`,
                            color: isSystem ? sysStyle.text : 'inherit'
                        }}>{msg.text}</div>
                      </div>
                    )
                  })}
                  <div ref={chatEndRef} />
                </div>
                <form className="chat-input-area" onSubmit={handleSendChat}>
                  <input 
                    type="text" 
                    className="erp-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={!canChat ? "Chat disabled..." : "Enter message to channel..."}
                    disabled={!canChat}
                  />
                  <button type="submit" className="erp-button" disabled={!canChat}>Send</button>
                </form>
              </div>


            </>
          )}
        </main>
      </div>

      {/* Game Over Popup Overlay */}
      {gameState?.phase === 'END' && (
        <div className="game-over-overlay">
          <div className={`game-over-popup ${gameState.winner === 'Werewolves' ? 'game-over-werewolves' : 'game-over-villagers'}`}>
            <span className="game-over-icon">{gameState.winner === 'Werewolves' ? '🐺' : '🛡️'}</span>
            <h2 className="game-over-title">
              {gameState.winner === 'Werewolves' ? 'The Village has Fallen' : 'The Evil is Purged'}
            </h2>
            <p className="game-over-subtitle">
              {gameState.winner === 'Werewolves' 
                ? 'The Werewolves have successfully taken over the village.'
                : 'The Villagers have successfully eliminated all Werewolves.'}
            </p>
            <div style={{ marginTop: '16px', textAlign: 'left', maxHeight: '200px', overflowY: 'auto', backgroundColor: 'var(--erp-bg-main)', color: 'var(--erp-text-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--erp-border)' }}>
              <h4 style={{ margin: '0 0 12px 0', borderBottom: '1px solid var(--erp-border)', paddingBottom: '8px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Role Reveal</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {gameState.players?.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '6px 8px', backgroundColor: 'var(--erp-bg-panel)', borderRadius: '4px', border: '1px solid var(--erp-border)' }}>
                    <span style={{ textDecoration: p.isAlive ? 'none' : 'line-through', opacity: p.isAlive ? 1 : 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }} title={p.username}>{p.username}</span>
                    <span style={{ fontWeight: 'bold', flexShrink: 0 }}>{getRoleIcon(p.role)} {p.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* How To Play Modal */}
      {showHowToPlay && (
        <div className="modal-overlay" onClick={() => setShowHowToPlay(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>How to Play</span>
              <button className="erp-button" style={{ padding: '2px 8px' }} onClick={() => setShowHowToPlay(false)}>Close</button>
            </div>
            <div className="modal-body">
              <h3>Game Overview</h3>
              <p>Werewolf Village Sync is a social deduction game. The village (good guys) wants to find and eliminate the Werewolves, while the Werewolves (bad guys) want to eliminate enough villagers to take over.</p>
              
              <h3>Roles</h3>
              <ul>
                <li><strong>🐺 Werewolf:</strong> Wakes up at NIGHT to secretly attack a player. Multiple werewolves must sync their votes to kill.</li>
                <li><strong>🧑‍🌾 Villager:</strong> Standard player. Uses daytime chat to figure out who the werewolves are.</li>
                <li><strong>👁️ Seer:</strong> Wakes up at NIGHT to check if one player is a Werewolf or not.</li>
                <li><strong>🛡️ Guardian:</strong> Wakes up at NIGHT to protect a player from being killed by werewolves.</li>
                <li><strong>💂 Bodyguard:</strong> Protects a player at NIGHT. If the protected player is attacked, they survive, but the Bodyguard dies in their place!</li>
                <li><strong>🏹 Hunter:</strong> If the Hunter is killed (by wolves or by village vote), they immediately shoot and drag one other player down with them.</li>
                <li><strong>🧙‍♀️ Witch:</strong> Wakes up at NIGHT. They know who the werewolves are attacking. They have two potions: Save and Kill. They can use BOTH potions at once to save the victim and kill someone else, or do nothing.</li>
              </ul>
              
              <h3>Phases</h3>
              <ul>
                <li><strong>LOBBY:</strong> Wait for at least 7 players (Max 14), then host clicks Start Game.</li>
                <li><strong>NIGHT:</strong> Village sleeps. Evil and Special roles wake up to perform actions. Chat is disabled to prevent "typing sounds" from giving away wolves.</li>
                <li><strong>DAY CHAT:</strong> Village wakes up. Night deaths are announced. Debate and accuse in chat!</li>
                <li><strong>DAY VOTE:</strong> Click on a player's name in the Team Roster on the left to cast your vote to execute them. If you prefer a peaceful day, you can vote to <strong>Skip Execution</strong>.</li>
                <li><strong>REVEAL:</strong> The execution (or skip) is carried out. The executed player's true role is revealed.</li>
              </ul>
              
              <h3>Death Rules</h3>
              <p>When you die, your true role is revealed on the roster for everyone to see. Dead players cannot vote or use abilities, but they CAN still type in the chat to influence the living players!</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
