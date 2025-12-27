<h1>🎁 Secret Santa</h1>

<p>
A simple Secret Santa web app built with Firebase.
Create a game, share a code, start the exchange, and privately reveal assignments.
</p>


<hr />

<h2>✨ Features</h2>

<ul>
  <li>🔐 Passwordless login (email link)</li>
  <li>👤 Usernames (emails never shown to others)</li>
  <li>🎟️ Create &amp; join games with a short code</li>
  <li>👥 Real-time lobby updates</li>
  <li>👑 Host-only game start</li>
  <li>🔒 Private assignments (each user sees only theirs)</li>
  <li>🚫 Locked reveal until the game starts</li>
  <li>🎨 Clean, modern UI</li>
  <li>🛡️ Secure Firestore rules</li>
</ul>

<hr />

<h2>🧠 How It Works</h2>

<ol>
  <li>Visit the site and log in using an email link</li>
  <li>Choose a username</li>
  <li>Create a game or join one using a 5-character code</li>
  <li>Players gather in the lobby</li>
  <li>The host starts the game (minimum 3 players)</li>
  <li>Each player privately sees who they’re buying for</li>
</ol>

<p>
Assignments are generated randomly and securely. No player can see anyone else’s assignment.
</p>

<hr />

<h2>🏗️ Tech Stack</h2>

<ul>
  <li><strong>Frontend:</strong> Vanilla HTML, CSS, JavaScript</li>
  <li><strong>Authentication:</strong> Firebase Authentication (passwordless email link)</li>
  <li><strong>Database:</strong> Firestore</li>
  <li><strong>Hosting:</strong> Firebase Hosting (recommended)</li>
</ul>

<hr />

<h2>📁 Project Structure</h2>

<pre>
public/
├── index.html        # Landing page
├── login.html        # Passwordless login
├── dashboard.html    # Profile + create/join
├── lobby.html        # Game lobby
├── reveal.html       # Assignment reveal
├── style.css         # Global styles
└── app.js            # Application logic
</pre>

<hr />

<h2>🔐 Security</h2>

<p>
Firestore security rules ensure:
</p>

<ul>
  <li>Users can only edit their own profile</li>
  <li>Only the host can start a game</li>
  <li>Players can only join as themselves</li>
  <li>Assignments are private (only the giver can read theirs)</li>
</ul>

<p>
These rules prevent cheating, snooping, and unauthorized access.
</p>

<hr />

<h2>✉️ Passwordless Email</h2>

<p>
Login emails are sent using Firebase’s built-in passwordless authentication system.
</p>

<hr />

<h2>📜 License</h2>

<p>
This project is licensed under the
<strong>Creative Commons Attribution–NonCommercial (CC BY-NC)</strong> license.
</p>

<p>
You are free to:
</p>

<ul>
  <li>Share — copy and redistribute the material</li>
  <li>Adapt — remix, transform, and build upon the material</li>
</ul>

<p>
Under the following terms:
</p>

<ul>
  <li>Attribution — You must give appropriate credit</li>
  <li>NonCommercial — You may not use the material for commercial purposes</li>
</ul>
