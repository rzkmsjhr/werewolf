# Werewolf Village Sync

Werewolf Village Sync is a real-time, web-based multiplayer adaptation of the classic social deduction game "Werewolf" (also known as Mafia). Built with React, Node.js, Express, and Socket.io, this game is designed to be hosted on a local network for coworkers or friends to play together using their mobile phones or laptops.

## 🚀 Features

- **Real-Time Multiplayer:** Instant synchronization of game phases, voting, and chat via Socket.io. Supports 7 to 14 players.
- **Immersive Audiovisual Experience:** Features automatic Day/Night dark mode theme switching, synchronized sound effects (clock ticks, wolf howls, gunshots), and stunning animated Game Over popups.
- **Enterprise-Themed UI:** A clean, responsive, and dynamic UI that automatically scales for both desktop and mobile devices.
- **Persistent Sessions & Reconnection:** If you accidentally close your browser tab or lose connection, your spot is saved in your browser's local storage. Rejoining brings you right back into the action!
- **Persistent Leaderboard:** Integrated SQLite database automatically tracks player metrics (Games Played, Win Rates, Wins, and Losses) across multiple sessions.
- **Smart Anti-Cheating:** Features IP tracking to prevent players from joining with multiple accounts from the same network, and disables night-time chat to prevent "typing sounds" from giving away the Werewolves.
- **Dynamic Role Management:** Fully automated role distribution and night-action resolution, including complex edge cases for the Witch and Hunter.
- **Skip Vote Mechanic:** During the Day Vote, the village can collectively vote to "Skip Execution", letting the day pass peacefully without casualties.

---

## 🎭 Roles

A game requires a minimum of **7 players** to start. The system will automatically deal roles depending on the total player count.

### Evil Team (Win by eliminating enough villagers to reach parity)
- **🐺 Werewolf:** Wakes up during the `NIGHT` phase to secretly attack a target. Multiple werewolves can see each other's votes and must synchronize their attacks. Werewolves cannot attack other werewolves.

### Village Team (Win by eliminating all werewolves)
- **🧑‍🌾 Villager:** A standard player with no special abilities. Their power lies in day-time communication and voting.
- **👁️ Seer:** Wakes up at night to check the identity of one player to see if they are a Werewolf or a Villager.
- **🛡️ Guardian:** Wakes up at night to protect a player. If the Werewolves attack the protected player, they survive.
- **💂 Bodyguard:** Wakes up at night to defend a player from Werewolf attacks. Unlike the Guardian, if the protected player is attacked, they survive, but the **Bodyguard dies in their place**. The Bodyguard cannot protect themselves.
- **🏹 Hunter:** If the Hunter is killed (either by the Werewolves at night or by the village vote during the day), they immediately enter the `HUNTER_REVENGE` phase, allowing them to shoot and drag one other player down with them.
- **🧙‍♀️ Witch:** Has two potions: a **Save Potion** and a **Kill Potion**. At night, the Witch learns who the Werewolves are attacking. They can choose to use BOTH potions at once (saving the victim and killing someone else), or do nothing and save the potions for another night.

---

## ⏱️ Game Phases

The game automatically cycles through phases based on a strict timer:

1. **LOBBY:** Players join the game. The host can start the game once the 7-player minimum is reached.
2. **DAY CHAT:** The first day begins immediately after roles are assigned. Players use the Sync Channel to debate, accuse, and strategize.
3. **DAY VOTE:** Chatting continues, but the voting system unlocks. Players click on the Team Roster to cast their vote to execute a suspected Werewolf.
4. **REVEAL:** The execution is carried out based on majority votes, and the executed player's true role is revealed.
5. **NIGHT:** The village sleeps. Evil roles and special village roles wake up to perform their actions in secret. The general chat is disabled.
6. **HUNTER REVENGE (Conditional):** If the Hunter dies, time freezes and they have a few seconds to choose a target to shoot.
7. **END:** The game concludes when a win condition is met. The winning team is announced, metrics are updated, and the lobby resets.

---

## 🛠️ How to Run Locally (LAN Play)

To host the game for players on your local Wi-Fi network:

### 1. Start the Backend Server
Open a terminal, navigate to the `server` directory, and start Node:
```bash
cd d:\werewolf\server
npm install
node index.js
```
*The server will run on port 3001 and will automatically bind to your local IP address.*

### 2. Start the Frontend Client
Open a second terminal, navigate to the `client` directory, and start Vite with the `--host` flag:
```bash
cd d:\werewolf\client
npm install
npm run dev
```
*The `--host` flag exposes your Vite development server to your local network.*

### 3. Join the Game
1. Find your hosting computer's local IPv4 Address (e.g., run `ipconfig` on Windows). Let's assume it is `192.168.1.50`.
2. Tell your friends to connect their mobile phones or laptops to the exact same Wi-Fi router.
3. Have them open their web browser and navigate to: **`http://192.168.1.50:5173`**
4. They simply enter a username to join!

---

## 🗄️ Database Management
- The game automatically creates and maintains a `metrics.sqlite` database in the `server` folder.
- If a user wishes to wipe their stats, they can log in and click the red **"Delete Profile & Metrics"** button from the Welcome screen.
- To completely reset the leaderboard for everyone, simply delete the `metrics.sqlite` file and restart the backend server.

---

*Enjoy the paranoia!*
