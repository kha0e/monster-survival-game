const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static assets from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game settings
const MAP_WIDTH = 30;
const MAP_HEIGHT = 30;
const HUNGER_DECAY = 1;
const TICK_INTERVAL = 1000;

// Tile types: grass, water, tree
const TILE_TYPES = {
  GRASS: 0,
  WATER: 1,
  TREE: 2,
};

// Create a random map
function generateMap() {
  const map = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      const r = Math.random();
      if (r < 0.1) {
        row.push(TILE_TYPES.WATER);
      } else if (r < 0.2) {
        row.push(TILE_TYPES.TREE);
      } else {
        row.push(TILE_TYPES.GRASS);
      }
    }
    map.push(row);
  }
  return map;
}

const gameMap = generateMap();

// State stores
const players = {};
const monsters = {};
const foods = {};

let nextMonsterId = 0;
let nextFoodId = 0;

function spawnMonster() {
  let x, y;
  do {
    x = Math.floor(Math.random() * MAP_WIDTH);
    y = Math.floor(Math.random() * MAP_HEIGHT);
  } while (gameMap[y][x] !== TILE_TYPES.GRASS);
  const id = `m${nextMonsterId++}`;
  monsters[id] = { id, x, y };
}

function spawnFood() {
  let x, y;
  do {
    x = Math.floor(Math.random() * MAP_WIDTH);
    y = Math.floor(Math.random() * MAP_HEIGHT);
  } while (gameMap[y][x] !== TILE_TYPES.GRASS);
  const id = `f${nextFoodId++}`;
  foods[id] = { id, x, y };
}

// Initialize some monsters and food
for (let i = 0; i < 5; i++) {
  spawnMonster();
}
for (let i = 0; i < 10; i++) {
  spawnFood();
}

// Broadcast the current game state
function broadcastState() {
  io.emit('state', {
    players,
    monsters,
    foods,
  });
}

io.on('connection', (socket) => {
  // A player joins the game
  socket.on('join', ({ nickname }) => {
    // choose a random grass tile for spawn
    let x, y;
    do {
      x = Math.floor(Math.random() * MAP_WIDTH);
      y = Math.floor(Math.random() * MAP_HEIGHT);
    } while (gameMap[y][x] !== TILE_TYPES.GRASS);
    players[socket.id] = {
      id: socket.id,
      nickname: nickname || 'Anonyme',
      x,
      y,
      hunger: 100,
      score: 0,
      inventory: [],
      alive: true,
    };
    socket.emit('init', {
      map: gameMap,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      playerId: socket.id,
      players,
      monsters,
      foods,
    });
    broadcastState();
  });

  // Move the player
  socket.on('move', (direction) => {
    const player = players[socket.id];
    if (!player || !player.alive) return;
    let { x, y } = player;
    if (direction === 'left') x--;
    if (direction === 'right') x++;
    if (direction === 'up') y--;
    if (direction === 'down') y++;
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return;
    const tile = gameMap[y][x];
    if (tile === TILE_TYPES.WATER || tile === TILE_TYPES.TREE) return;
    player.x = x;
    player.y = y;
    broadcastState();
  });

  // Catch monsters
  socket.on('catch', () => {
    const player = players[socket.id];
    if (!player || !player.alive) return;
    for (const id in monsters) {
      const m = monsters[id];
      if (m.x === player.x && m.y === player.y) {
        player.score++;
        player.hunger = Math.min(100, player.hunger + 20);
        player.inventory.push('Monster');
        delete monsters[id];
        spawnMonster();
        broadcastState();
        io.to(socket.id).emit('message', { from: 'System', text: 'Vous avez capturé un monstre !' });
        return;
      }
    }
  });

  // Collect food
  socket.on('collectFood', () => {
    const player = players[socket.id];
    if (!player || !player.alive) return;
    for (const id in foods) {
      const f = foods[id];
      if (f.x === player.x && f.y === player.y) {
        player.hunger = Math.min(100, player.hunger + 30);
        player.inventory.push('Food');
        delete foods[id];
        spawnFood();
        broadcastState();
        io.to(socket.id).emit('message', { from: 'System', text: 'Vous avez mangé de la nourriture !' });
        return;
      }
    }
  });

  // Chat
  socket.on('chat', (text) => {
    const player = players[socket.id];
    if (!player) return;
    const msg = { from: player.nickname, text: String(text).slice(0, 200) };
    io.emit('message', msg);
  });

  // Respawn after fainting
  socket.on('respawn', () => {
    const player = players[socket.id];
    if (!player || player.alive) return;
    let x, y;
    do {
      x = Math.floor(Math.random() * MAP_WIDTH);
      y = Math.floor(Math.random() * MAP_HEIGHT);
    } while (gameMap[y][x] !== TILE_TYPES.GRASS);
    player.x = x;
    player.y = y;
    player.hunger = 100;
    player.alive = true;
    io.to(socket.id).emit('message', { from: 'System', text: 'Vous êtes réapparu !' });
    broadcastState();
  });

  // Disconnect
  socket.on('disconnect', () => {
    delete players[socket.id];
    broadcastState();
  });
});

// Game loop updates monsters, hunger, spawns new items
function gameLoop() {
  // Move monsters randomly
  for (const id in monsters) {
    const m = monsters[id];
    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: 0 },
    ];
    const { dx, dy } = dirs[Math.floor(Math.random() * dirs.length)];
    const nx = m.x + dx;
    const ny = m.y + dy;
    if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
      if (gameMap[ny][nx] === TILE_TYPES.GRASS) {
        m.x = nx;
        m.y = ny;
      }
    }
  }
  // Decrease hunger and handle fainting
  for (const id in players) {
    const player = players[id];
    if (!player.alive) continue;
    player.hunger -= HUNGER_DECAY;
    if (player.hunger <= 0) {
      player.hunger = 0;
      player.alive = false;
      io.to(id).emit('message', { from: 'System', text: 'Vous vous êtes évanoui de faim ! Appuyez sur R pour réapparaître.' });
    }
  }
  // Maintain counts of monsters and food
  if (Object.keys(monsters).length < 5) spawnMonster();
  if (Object.keys(foods).length < 10) spawnFood();
  broadcastState();
}

setInterval(gameLoop, TICK_INTERVAL);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
