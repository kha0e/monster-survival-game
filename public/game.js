(() => {
  const joinScreen = document.getElementById('join-screen');
  const gameScreen = document.getElementById('game-screen');
  const joinBtn = document.getElementById('join-btn');
  const nicknameInput = document.getElementById('nickname');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const nicknameDisplay = document.getElementById('nickname-display');
  const hungerFill = document.getElementById('hunger-fill');
  const scoreDisplay = document.getElementById('score-display');
  const inventoryList = document.getElementById('inventory-list');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');

  let socket;
  let playerId;
  let map;
  let mapWidth;
  let mapHeight;
  let players = {};
  let monsters = {};
  let foods = {};

  const TILE_SIZE = 20; // each tile is 20x20 pixels, canvas 600x600 for 30 tiles

  joinBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim() || 'Anonyme';
    startGame(nickname);
  });
  nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      joinBtn.click();
    }
  });

  function startGame(nickname) {
    joinScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    socket = io();
    socket.emit('join', { nickname });

    socket.on('init', (data) => {
      playerId = data.playerId;
      map = data.map;
      mapWidth = data.width;
      mapHeight = data.height;
      players = data.players;
      monsters = data.monsters;
      foods = data.foods;
      nicknameDisplay.textContent = 'Vous: ' + players[playerId].nickname;
      render();
    });
    socket.on('state', (data) => {
      players = data.players;
      monsters = data.monsters;
      foods = data.foods;
      render();
    });
    socket.on('message', (msg) => {
      addMessage(msg.from, msg.text);
    });
  }

  function addMessage(from, text) {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${from}:</strong> ${text}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== '') {
      socket.emit('chat', chatInput.value.trim());
      chatInput.value = '';
    }
  });

  // Keyboard controls
  document.addEventListener('keydown', (e) => {
    if (!socket) return;
    const key = e.key.toLowerCase();
    if (['arrowleft', 'q', 'a'].includes(key)) {
      socket.emit('move', 'left');
    } else if (['arrowright', 'd'].includes(key)) {
      socket.emit('move', 'right');
    } else if (['arrowup', 'z', 'w'].includes(key)) {
      socket.emit('move', 'up');
    } else if (['arrowdown', 's'].includes(key)) {
      socket.emit('move', 'down');
    } else if (key === ' ') {
      // space bar to catch monster
      socket.emit('catch');
    } else if (key === 'e') {
      // E to collect food
      socket.emit('collectFood');
    } else if (key === 'r') {
      // R to respawn if fainted
      socket.emit('respawn');
    }
  });

  function render() {
    if (!map) return;
    // clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // draw map
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tile = map[y][x];
        if (tile === 0) {
          ctx.fillStyle = '#2ecc71'; // grass: green
        } else if (tile === 1) {
          ctx.fillStyle = '#3498db'; // water: blue
        } else if (tile === 2) {
          ctx.fillStyle = '#7f8c8d'; // tree: grey
        }
        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    // draw foods
    for (const id in foods) {
      const f = foods[id];
      ctx.fillStyle = '#f1c40f'; // yellow for food
      ctx.fillRect(f.x * TILE_SIZE + 4, f.y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
    }
    // draw monsters
    for (const id in monsters) {
      const m = monsters[id];
      ctx.fillStyle = '#e74c3c'; // red for monsters
      ctx.beginPath();
      ctx.arc(m.x * TILE_SIZE + TILE_SIZE / 2, m.y * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // draw players
    for (const id in players) {
      const p = players[id];
      if (!p.alive) continue;
      ctx.fillStyle = id === playerId ? '#ffffff' : '#9b59b6';
      ctx.fillRect(p.x * TILE_SIZE + 2, p.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }
    // update status UI
    const me = players[playerId];
    if (me) {
      hungerFill.style.width = `${me.hunger}%`;
      scoreDisplay.textContent = `Monstres capturés : ${me.score}`;
      // update inventory list
      inventoryList.innerHTML = '';
      me.inventory.slice(-10).forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        inventoryList.appendChild(li);
      });
    }
  }
})();
