const { updateMetrics } = require('./db');

const PHASES = {
    LOBBY: 'LOBBY',
    DAY_CHAT: 'DAY_CHAT',
    DAY_VOTE: 'DAY_VOTE',
    REVEAL: 'REVEAL',
    NIGHT: 'NIGHT',
    HUNTER_REVENGE: 'HUNTER_REVENGE',
    END: 'END'
};

const ROLES = {
    WEREWOLF: 'Werewolf',
    VILLAGER: 'Villager',
    SEER: 'Seer',
    GUARDIAN: 'Guardian',
    BODYGUARD: 'Bodyguard',
    HUNTER: 'Hunter',
    WITCH: 'Witch'
};

class GameEngine {
    constructor(io) {
        this.io = io;
        this.players = {}; // socketId -> data
        this.phase = PHASES.LOBBY;
        
        this.dayCount = 1;
        this.timer = 0;
        this.interval = null;
        
        // Night Actions
        this.nightActions = {}; // socketId -> { action: 'target', target: username } or { action: 'witch', save: true/false, killTarget: username }
        this.werewolfTarget = null;
        this.witchState = { hasSave: true, hasKill: true, socketId: null };
        
        this.votes = {}; // username -> targetUsername
        this.winner = null;

        this.dyingHunter = null; // username of hunter taking revenge
        this.nextPhaseAfterHunter = null; // where to go after hunter shoots
    }

    addPlayer(socketId, username, ipAddress) {
        if (this.phase !== PHASES.LOBBY) return false;
        const exists = Object.values(this.players).find(p => p.username === username);
        if (exists) return false;

        // Prevent multiple users from the same IP
        const ipExists = Object.values(this.players).find(p => p.ipAddress === ipAddress);
        if (ipExists) return false;

        this.players[socketId] = {
            username,
            role: null,
            isAlive: true,
            socketId,
            ipAddress
        };
        this.broadcastState();
        return true;
    }

    removePlayer(socketId) {
        delete this.players[socketId];
        if (this.phase !== PHASES.LOBBY) {
            this.checkWinCondition();
        }
        this.broadcastState();
    }

    startGame() {
        if (this.phase !== PHASES.LOBBY) return;
        const playerIds = Object.keys(this.players);
        if (playerIds.length < 7) return; 

        this.assignRoles();
        this.dayCount = 1;
        this.winner = null;
        this.votes = {};
        
        // Find witch
        const witchPlayer = Object.values(this.players).find(p => p.role === ROLES.WITCH);
        this.witchState = { 
            hasSave: true, 
            hasKill: true, 
            socketId: witchPlayer ? witchPlayer.socketId : null 
        };

        this.startDayChat();
    }

    assignRoles() {
        const ids = Object.keys(this.players);
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }

        const len = ids.length;
        let wwCount = 1;
        if (len >= 6) wwCount = 2;
        if (len >= 12) wwCount = 3;

        const specials = [ROLES.GUARDIAN, ROLES.BODYGUARD, ROLES.HUNTER, ROLES.WITCH];
        // Shuffle specials
        for (let i = specials.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [specials[i], specials[j]] = [specials[j], specials[i]];
        }
        
        let specialCount = Math.max(1, Math.floor((len - wwCount - 1) / 2));
        if (specialCount > 4) specialCount = 4;

        ids.forEach((id, index) => {
            if (index < wwCount) this.players[id].role = ROLES.WEREWOLF;
            else if (index === wwCount) this.players[id].role = ROLES.SEER;
            else if (index > wwCount && index <= wwCount + specialCount) {
                this.players[id].role = specials[index - wwCount - 1];
            }
            else this.players[id].role = ROLES.VILLAGER;
            
            this.players[id].isAlive = true;
            this.io.to(id).emit('role_assigned', this.players[id].role);
        });

        const wwUsernames = Object.values(this.players).filter(p => p.role === ROLES.WEREWOLF).map(p => p.username);
        Object.values(this.players).forEach(p => {
            if (p.role === ROLES.WEREWOLF) {
                this.io.to(p.socketId).emit('werewolf_team', wwUsernames);
            }
        });
    }

    setTimer(seconds, onTick, onComplete) {
        clearInterval(this.interval);
        this.timer = seconds;
        this.broadcastState();
        
        this.interval = setInterval(() => {
            this.timer--;
            if (onTick) onTick(this.timer);
            this.io.emit('timer_sync', this.timer);
            
            if (this.timer <= 0) {
                clearInterval(this.interval);
                onComplete();
            }
        }, 1000);
    }

    startDayChat() {
        this.phase = PHASES.DAY_CHAT;
        this.votes = {};
        this.io.emit('chat_message', { system: true, text: `Day ${this.dayCount}: Discussion time. (40s)` });
        
        this.setTimer(40, null, () => {
            this.startDayVote();
        });
    }

    startDayVote() {
        this.phase = PHASES.DAY_VOTE;
        this.votes = {};
        this.io.emit('chat_message', { system: true, text: 'Voting Phase: Select a player to eliminate. (10s)' });
        
        this.setTimer(10, null, () => {
            this.resolveVote();
        });
    }

    handleAction(socketId, actionData) {
        const player = this.players[socketId];
        if (!player || !player.isAlive) return;

        if (this.phase === PHASES.DAY_VOTE && actionData.type === 'vote') {
            if (actionData.target === player.username) return; // Cannot vote self
            if (actionData.target === null) {
                delete this.votes[player.username];
            } else {
                this.votes[player.username] = actionData.target;
            }
            this.broadcastState(); // To show who voted whom
        } 
        else if (this.phase === PHASES.NIGHT) {
            this.handleNightAction(player, actionData);
        }
        else if (this.phase === PHASES.HUNTER_REVENGE && player.role === ROLES.HUNTER) {
            if (actionData.target !== null) {
                this.resolveHunterKill(actionData.target);
            }
        }
    }

    handleNightAction(player, actionData) {
        if (player.role === ROLES.SEER && actionData.type === 'target') {
            if (actionData.target === null || this.nightActions[player.socketId]) return;
            const targetPlayer = Object.values(this.players).find(p => p.username === actionData.target);
            if (targetPlayer) {
                this.nightActions[player.socketId] = actionData.target;
                const isWolf = targetPlayer.role === ROLES.WEREWOLF;
                this.io.to(player.socketId).emit('chat_message', { system: true, text: `Seer Vision: ${targetPlayer.username} is ${isWolf ? 'a Werewolf' : 'NOT a Werewolf'}.` });
            }
        }
        else if (player.role === ROLES.WITCH && actionData.type === 'witch') {
            this.nightActions[player.socketId] = actionData; // { save: boolean, killTarget: string }
        }
        else {
            if (actionData.target === null) {
                delete this.nightActions[player.socketId];
            } else {
                if (player.role === ROLES.WEREWOLF) {
                    const targetPlayer = Object.values(this.players).find(p => p.username === actionData.target);
                    if (targetPlayer && targetPlayer.role === ROLES.WEREWOLF) return; // Werewolves cannot attack Werewolves
                }
                this.nightActions[player.socketId] = actionData.target;
            }
        }

        // Check if all werewolves voted to sync the target to show the Witch
        this.syncWerewolfTarget();
    }

    syncWerewolfTarget() {
        const wolves = Object.values(this.players).filter(p => p.role === ROLES.WEREWOLF && p.isAlive);
        let consensus = null;
        let allVoted = true;
        
        const wolfVotes = {};

        if (wolves.length > 0) {
            for (let w of wolves) {
                const vote = this.nightActions[w.socketId];
                if (vote) wolfVotes[w.username] = vote;
            }
            
            const uniqueVotes = new Set(Object.values(wolfVotes));
            if (uniqueVotes.size === 1 && Object.keys(wolfVotes).length === wolves.length) {
                consensus = Array.from(uniqueVotes)[0];
            } else {
                consensus = null;
            }
        }

        wolves.forEach(w => {
            this.io.to(w.socketId).emit('werewolf_votes', wolfVotes);
        });

        this.werewolfTarget = consensus;

        // Send to witch
        if (this.witchState.socketId && this.players[this.witchState.socketId]?.isAlive) {
            this.io.to(this.witchState.socketId).emit('witch_info', {
                werewolfTarget: this.werewolfTarget,
                hasSave: this.witchState.hasSave,
                hasKill: this.witchState.hasKill
            });
        }
    }

    resolveVote() {
        const voteCounts = {};
        let maxVotes = 0;
        let tied = false;
        let executedUser = null;

        Object.values(this.votes).forEach(target => {
            voteCounts[target] = (voteCounts[target] || 0) + 1;
            if (voteCounts[target] > maxVotes) {
                maxVotes = voteCounts[target];
                executedUser = target;
                tied = false;
            } else if (voteCounts[target] === maxVotes) {
                tied = true;
            }
        });

        this.phase = PHASES.REVEAL;
        
        if (!tied && executedUser) {
            this.io.emit('chat_message', { system: true, text: `Village Decision: ${executedUser} has been executed.` });
            this.killPlayer(executedUser, () => this.startNight());
        } else {
            this.io.emit('chat_message', { system: true, text: `No consensus. Nobody was executed.` });
            if (!this.checkWinCondition()) {
                this.setTimer(3, null, () => this.startNight());
            }
        }
    }

    killPlayer(username, nextPhaseCallback) {
        const player = Object.values(this.players).find(p => p.username === username);
        if (!player) return nextPhaseCallback();
        
        player.isAlive = false;
        
        if (this.checkWinCondition()) return;

        if (player.role === ROLES.HUNTER) {
            this.startHunterRevenge(player, nextPhaseCallback);
        } else {
            nextPhaseCallback();
        }
    }

    startHunterRevenge(hunterPlayer, nextPhaseCallback) {
        this.phase = PHASES.HUNTER_REVENGE;
        this.dyingHunter = hunterPlayer.username;
        this.nextPhaseAfterHunter = nextPhaseCallback;
        
        this.io.emit('chat_message', { system: true, text: `Hunter ${hunterPlayer.username} is dying! They have 10 seconds to shoot someone.` });
        this.broadcastState();

        this.setTimer(10, null, () => {
            this.io.emit('chat_message', { system: true, text: `Hunter died without shooting anyone.` });
            this.nextPhaseAfterHunter();
        });
    }

    resolveHunterKill(targetUsername) {
        if (this.phase !== PHASES.HUNTER_REVENGE) return;
        clearInterval(this.interval); // Stop hunter timer
        
        this.io.emit('chat_message', { system: true, text: `Hunter shot ${targetUsername} with their dying breath!` });
        
        // Recursive kill in case Hunter shoots another Hunter (rare but possible in custom setups, we only have 1 though)
        this.killPlayer(targetUsername, this.nextPhaseAfterHunter);
    }

    startNight() {
        this.phase = PHASES.NIGHT;
        this.nightActions = {};
        this.werewolfTarget = null;
        
        const wolves = Object.values(this.players).filter(p => p.role === ROLES.WEREWOLF && p.isAlive);
        wolves.forEach(w => {
            this.io.to(w.socketId).emit('werewolf_votes', {});
        });

        // Inform witch of their state again
        if (this.witchState.socketId && this.players[this.witchState.socketId]?.isAlive) {
            this.io.to(this.witchState.socketId).emit('witch_info', {
                werewolfTarget: null,
                hasSave: this.witchState.hasSave,
                hasKill: this.witchState.hasKill
            });
        }

        this.io.emit('chat_message', { system: true, text: 'Night falls. The village goes to sleep. (15s)' });
        
        this.setTimer(15, null, () => {
            this.resolveNight();
        });
    }

    resolveNight() {
        let diedUsers = [];
        let protectedUser = null;
        let bodyguardDiedFor = null;

        const wolves = Object.values(this.players).filter(p => p.role === ROLES.WEREWOLF && p.isAlive);
        const guardian = Object.values(this.players).find(p => p.role === ROLES.GUARDIAN && p.isAlive);
        const bodyguard = Object.values(this.players).find(p => p.role === ROLES.BODYGUARD && p.isAlive);
        const witch = Object.values(this.players).find(p => p.role === ROLES.WITCH && p.isAlive);

        if (guardian && this.nightActions[guardian.socketId]) {
            protectedUser = this.nightActions[guardian.socketId];
        }

        if (bodyguard && this.nightActions[bodyguard.socketId]) {
            // Cannot protect self
            if (this.nightActions[bodyguard.socketId] !== bodyguard.username) {
                protectedUser = this.nightActions[bodyguard.socketId];
                bodyguardDiedFor = protectedUser;
            }
        }

        let wwKillTarget = this.werewolfTarget;
        
        let witchKillTarget = null;
        let witchSaved = false;

        if (witch && this.nightActions[witch.socketId]) {
            const wAction = this.nightActions[witch.socketId];
            if (wAction.save && wAction.killTarget && this.witchState.hasSave && this.witchState.hasKill) {
                witchSaved = true;
                witchKillTarget = wAction.killTarget;
                this.witchState.hasSave = false;
                this.witchState.hasKill = false;
            }
        }

        let wasTargetProtected = false;

        // Resolve Werewolf Kill
        if (wwKillTarget) {
            if (witchSaved) {
                wasTargetProtected = true;
            } else if (protectedUser === wwKillTarget) {
                wasTargetProtected = true;
                if (bodyguardDiedFor === wwKillTarget) {
                    diedUsers.push(bodyguard.username);
                }
                // Guardian protects cleanly
            } else {
                diedUsers.push(wwKillTarget);
            }
        }

        // Resolve Witch Kill (bypasses protection for simplicity)
        if (witchKillTarget) {
            if (!diedUsers.includes(witchKillTarget)) {
                diedUsers.push(witchKillTarget);
            }
        }

        this.phase = PHASES.REVEAL;
        
        if (wasTargetProtected && wwKillTarget) {
            Object.values(this.players).forEach(p => {
                if (p.role === ROLES.WEREWOLF) {
                    this.io.to(p.socketId).emit('chat_message', {
                        system: true,
                        text: `Secret Notification: Your target (${wwKillTarget}) was protected or healed last night!`
                    });
                }
            });
        }

        if (diedUsers.length > 0) {
            this.io.emit('chat_message', { system: true, text: `Morning Announcement: ${diedUsers.join(' and ')} died during the night.` });
            
            // Need to process deaths sequentially in case of multiple hunters (though only 1 exists, safe practice)
            let i = 0;
            const processNextDeath = () => {
                if (i >= diedUsers.length) {
                    if (!this.checkWinCondition()) {
                        this.dayCount++;
                        this.setTimer(3, null, () => this.startDayChat());
                    }
                    return;
                }
                this.killPlayer(diedUsers[i], () => {
                    i++;
                    processNextDeath();
                });
            };
            processNextDeath();

        } else {
            this.io.emit('chat_message', { system: true, text: `Morning Announcement: Nobody died last night.` });
            if (!this.checkWinCondition()) {
                this.dayCount++;
                this.setTimer(3, null, () => this.startDayChat());
            }
        }
    }

    checkWinCondition() {
        const alivePlayers = Object.values(this.players).filter(p => p.isAlive);
        const aliveWolves = alivePlayers.filter(p => p.role === ROLES.WEREWOLF).length;
        const aliveVillagers = alivePlayers.length - aliveWolves;

        if (aliveWolves === 0) {
            this.endGame('Villagers');
            return true;
        } else if (aliveWolves >= aliveVillagers) {
            this.endGame('Werewolves');
            return true;
        }
        return false;
    }

    async endGame(winnerTeam) {
        clearInterval(this.interval);
        this.phase = PHASES.END;
        this.winner = winnerTeam;
        
        this.io.emit('chat_message', { system: true, text: `Game Over. The ${winnerTeam} win!` });
        
        // Update Metrics (Assume Villagers = Employee, Werewolf = Auditor for DB compat)
        // Or we can just use generic DB roles. I'll map them back for DB.
        const promises = Object.values(this.players).map(p => {
            const isWin = (winnerTeam === 'Werewolves' && p.role === ROLES.WEREWOLF) || 
                          (winnerTeam === 'Villagers' && p.role !== ROLES.WEREWOLF);
            return updateMetrics(p.username, isWin, p.role === ROLES.WEREWOLF ? 'Auditor' : 'Employee');
        });

        try {
            await Promise.all(promises);
            this.io.emit('metrics_updated');
        } catch (e) {}

        this.broadcastState();

        setTimeout(() => {
            this.phase = PHASES.LOBBY;
            Object.values(this.players).forEach(p => {
                p.role = null;
                p.isAlive = true;
            });
            this.broadcastState();
        }, 10000);
    }

    broadcastState() {
        const publicPlayers = Object.values(this.players).map(p => ({
            username: p.username,
            isAlive: p.isAlive,
            role: (this.phase === PHASES.END || !p.isAlive) ? p.role : null
        }));

        this.io.emit('game_state', {
            phase: this.phase,
            players: publicPlayers,
            dayCount: this.dayCount,
            winner: this.winner,
            votes: this.phase === PHASES.DAY_VOTE ? this.votes : {}
        });
    }

    getPublicState() {
         const publicPlayers = Object.values(this.players).map(p => ({
            username: p.username,
            isAlive: p.isAlive,
            role: (this.phase === PHASES.END || !p.isAlive) ? p.role : null
        }));

        return {
            phase: this.phase,
            players: publicPlayers,
            dayCount: this.dayCount,
            winner: this.winner,
            votes: this.phase === PHASES.DAY_VOTE ? this.votes : {}
        };
    }
}

module.exports = { GameEngine, PHASES, ROLES };
