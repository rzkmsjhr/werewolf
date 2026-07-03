import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Shield, Moon, Sun, Crosshair, Users, MessageSquare, Activity, Clock } from 'lucide-react';
import './index.css';

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

function App() {
  const [username, setUsername] = useState('');
  const [savedUsername, setSavedUsername] = useState(null);
  const [isJoined, setIsJoined] = useState(false);

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
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const [witchInfo, setWitchInfo] = useState(null);
  const [witchSave, setWitchSave] = useState(false);
  const [witchKill, setWitchKill] = useState('');

  const [myNightTarget, setMyNightTarget] = useState(null);
  const [wwTeam, setWwTeam] = useState([]);
  const [wwVotes, setWwVotes] = useState({});

  const chatEndRef = useRef(null);

  useEffect(() => {
    socket.on('game_state', (state) => {
      setGameState(state);
      if (state.phase !== 'NIGHT') {
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
        localStorage.setItem('werewolf_username', username);
        setSavedUsername(username);
      }
    });

    socket.on('join_error', (msg) => {
      setErrorMsg(msg);
    });

    socket.on('chat_message', (msg) => {
      setChatMessages(prev => [...prev, msg]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    socket.on('role_assigned', (role) => {
      setMyRole(role);
      setChatMessages(prev => [...prev, { system: true, text: `Role Assignment: You are a [${role}].` }]);
    });

    socket.on('metrics_updated', () => {
      fetchLeaderboard();
    });

    socket.on('timer_sync', (t) => {
        setTimer(t);
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

    socket.on('profile_deleted', (success) => {
      if (success) {
         localStorage.removeItem('werewolf_username');
         setSavedUsername(null);
         setUsername('');
         setIsJoined(false);
      } else {
         setErrorMsg('Failed to delete profile. Please try again.');
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

  const sendWitchAction = () => {
      socket.emit('player_action', { 
          type: 'witch', 
          save: witchSave, 
          killTarget: witchKill 
      });
      setChatMessages(prev => [...prev, { system: true, text: `Witch actions submitted.` }]);
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
  
  const canChat = me?.isAlive && (gameState?.phase === 'DAY_CHAT' || gameState?.phase === 'LOBBY' || gameState?.phase === 'END');
  
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
          return { bg: '#172b4d', border: '#091e42', text: '#ffffff' }; // dark mode for night/morning
      } else {
          return { bg: '#e3fcef', border: '#abf5d1', text: '#00875a' }; // default green
      }
  };

  return (
    <div className="app-container">
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

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {myRole && <span className="erp-badge" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}>Role: {myRole}</span>}
          <span className="hide-mobile">User: {username}</span>
          <button 
            className="erp-button" 
            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: 'transparent', border: '1px solid white' }}
            onClick={() => setShowLeaderboard(!showLeaderboard)}
          >
            <Activity size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/>
            {showLeaderboard ? 'Back to Game' : 'Leaderboard'}
          </button>
          <button 
            className="erp-button danger" 
            style={{ padding: '4px 8px', fontSize: '12px' }}
            onClick={handleLeaveGame}
          >
            Leave Game
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
                  else if (me?.isAlive && gameState?.phase === 'NIGHT') {
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
                  else if (me?.isAlive && myRole === 'Hunter' && gameState?.phase === 'HUNTER_REVENGE' && p.username !== username) {
                      actionBtn = <button className="erp-button danger" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => sendAction('target', p.username)}>Hunter Shoot</button>;
                  }

                  const votesAgainst = Object.values(gameState?.votes || {}).filter(v => v === p.username).length;
                  const wwTargetedBy = Object.entries(wwVotes).filter(([wwName, target]) => target === p.username).map(([wwName]) => wwName);

                  return (
                    <li key={i} className="roster-item" style={{ flexDirection: 'column', alignItems: 'flex-start', border: (isVoted || isNightTargeted) ? '1px solid var(--erp-warning)' : '1px solid transparent', backgroundColor: (isVoted || isNightTargeted) ? '#fff8eb' : '' }}>
                      <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px' }}>
                          <div className={`status-dot`} style={{ backgroundColor: !p.isAlive ? '#5e6c84' : (!p.connected ? '#ff991f' : 'var(--erp-success)') }} title={!p.isAlive ? 'Dead' : (!p.connected ? 'Offline/Disconnected' : 'Active')}></div>
                          <span style={{ flex: 1, color: p.isAlive ? 'inherit' : 'var(--erp-text-muted)', textDecoration: p.isAlive ? 'none' : 'line-through' }}>
                            {p.username}
                          </span>
                          {p.role && <span className="erp-badge" style={{fontSize:'9px', padding: '1px 4px'}}>{p.role}</span>}
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
              <div style={{ padding: '20px' }}>
                <table className="erp-table">
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
                          </div>
                        )}
                        <div className="chat-text" style={{ 
                            backgroundColor: !isSystem ? '#fff' : sysStyle.bg, 
                            border: !isSystem ? '1px solid #dfe1e6' : `1px solid ${sysStyle.border}`,
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

              {/* Witch Specific Panel */}
              {me?.isAlive && myRole === 'Witch' && gameState?.phase === 'NIGHT' && (
                  <div className="panel" style={{ marginTop: 'auto' }}>
                      <div className="panel-header" style={{ color: 'purple' }}>Witch Actions</div>
                      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          {witchInfo ? (
                              <>
                                {witchInfo.werewolfTarget ? (
                                    <div style={{ color: 'var(--erp-danger)', fontWeight: 'bold' }}>
                                        Werewolves are attacking: {witchInfo.werewolfTarget}
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--erp-text-muted)' }}>
                                        Werewolves have not decided on a target yet.
                                    </div>
                                )}
                                
                                {witchInfo.hasSave && witchInfo.hasKill ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div style={{ color: 'var(--erp-text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                                            Note: You must use BOTH potions together, or use none.
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <input type="checkbox" checked={witchSave} onChange={(e) => setWitchSave(e.target.checked)} />
                                                Use Save Potion on Target
                                            </label>
                                            <select className="erp-select" value={witchKill} onChange={(e) => setWitchKill(e.target.value)}>
                                                <option value="">-- Use Kill Potion on... --</option>
                                                {alivePlayers.filter(p => p.username !== username).map(p => (
                                                    <option key={p.username} value={p.username}>{p.username}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <button className="erp-button" disabled={(witchSave && !witchKill) || (!witchSave && witchKill)} onClick={sendWitchAction}>
                                            {(witchSave && witchKill) ? 'Confirm: Use Both Potions' : 'Confirm: Do Nothing'}
                                        </button>
                                    </div>
                                ) : (
                                     <div style={{ color: 'var(--erp-text-muted)', fontStyle: 'italic' }}>You have already used your potions.</div>
                                )}
                              </>
                          ) : (
                              <div>Waiting for werewolf synchronization...</div>
                          )}
                      </div>
                  </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
