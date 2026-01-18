require('dotenv').config();

// server.js
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

const session = require('express-session');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { Strategy: FacebookStrategy } = require('passport-facebook');
const { Server } = require('socket.io');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// -----------------------------
//   RUTAS Y FICHEROS LOCALES
// -----------------------------
const VOTES_FILE = path.join(__dirname, 'votes.json');
const PHOTOS_FILE = path.join(__dirname, 'photos.json');
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Crear carpeta uploads si no existe
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Helpers votos
function loadVotes() {
  const data = fs.readFileSync(VOTES_FILE, 'utf-8');
  return JSON.parse(data);
}

function saveVotes(votes) {
  fs.writeFileSync(VOTES_FILE, JSON.stringify(votes, null, 2));
}

// Helpers fotos
function loadPhotos() {
  if (!fs.existsSync(PHOTOS_FILE)) return [];
  const data = fs.readFileSync(PHOTOS_FILE, 'utf-8');
  return JSON.parse(data);
}

function savePhotos(photos) {
  fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));
}

// Configuración de subida de archivos (solo imágenes)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Només es permeten imatges'));
    }
    cb(null, true);
  },
});

// -----------------------------
//   CONFIG BÁSICA EXPRESS
// -----------------------------
app.use(express.json());
app.use(express.static('../'));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// -----------------------------
//   SESIONES + PASSPORT
// -----------------------------
app.use(
  session({
    secret: 'cambia_esto_por_algo_mas_largo_y_secreto',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Guardamos solo lo mínimo en la sesión
passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// -----------------------------
//   ESTRATEGIA GOOGLE
// -----------------------------
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,          // <- desde .env
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,  // <- desde .env
      callbackURL: 'http://192.168.1.52.nip.io:3000/auth/google/callback',
    },
    (accessToken, refreshToken, profile, done) => {
      // Guardamos solo lo mínimo
      const user = {
        provider: 'google',
        id: profile.id,
        name: profile.displayName,
      };
      return done(null, user);
    }
  )
);

// -----------------------------
//   ESTRATEGIA FACEBOOK
// -----------------------------
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,          // <- desde .env
      clientSecret: process.env.FACEBOOK_APP_SECRET,  // <- desde .env
      callbackURL: 'http://localhost:3000/auth/facebook/callback',
      profileFields: ['id', 'displayName', 'emails'],
    },
    (accessToken, refreshToken, profile, done) => {
      const user = {
        provider: 'facebook',
        id: profile.id,
        name: profile.displayName,
      };
      return done(null, user);
    }
  )
);

// -----------------------------
//   RUTAS AUTH GOOGLE
// -----------------------------
app.get(
  '/auth/google',
  passport.authenticate('google', { scope: ['profile'] }) // solo perfil, sin email
);

app.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Vuelve a la página principal (directamente al concurso si quieres)
    res.redirect('/#concurs-fotos');
  }
);

// -----------------------------
//   RUTAS AUTH FACEBOOK
// -----------------------------
app.get(
  '/auth/facebook',
  passport.authenticate('facebook') // por defecto solo perfil público básico
);

app.get(
  '/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/#concurs-fotos');
  }
);

// -----------------------------
//   ENDPOINT /me
//   Para que el front sepa si está logueado
// -----------------------------
app.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ ok: false });
  }
  // Devolvemos solo lo necesario
  res.json({
    ok: true,
    user: {
      provider: req.user.provider,
      name: req.user.name,
    },
  });
});

// (Opcional) logout
app.post('/logout', (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

// -----------------------------
//   GESTIÓN DE FOTOS
// -----------------------------

// GET /photos → todas las fotos
app.get('/photos', (req, res) => {
  const photos = loadPhotos();
  res.json(photos);
});

// POST /upload → subir foto (requiere login)
app.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.user) {
    return res.status(401).send("Has d'iniciar sessió per pujar fotos.");
  }

  if (!req.file) {
    return res.status(400).send('No s’ha enviat cap imatge.');
  }

  const photos = loadPhotos();

  const newId = 'foto-' + Date.now();
  const publicPath = '/uploads/' + req.file.filename;

  const newPhoto = {
    id: newId,
    src: publicPath,
    uploader: {
      provider: req.user.provider,
      name: req.user.name,
    },
  };

  photos.push(newPhoto);
  savePhotos(photos);

  // Crear entrada de votos vacía para la nueva foto
  const votes = loadVotes();
  if (!votes[newId]) {
    votes[newId] = { voters: [] };
    saveVotes(votes);
  }

  // Notificar a todos los clientes que hay una foto nueva
  io.emit('photoAdded', {
    id: newId,
    src: publicPath,
    votes: 0,
    voted: false,
  });

  res.redirect('/#concurs-fotos');
});

// -----------------------------
//   GESTIÓN DE VOTOS
// -----------------------------

// Helper para ID único de usuario
function getUserId(req) {
  if (!req.user) return null;
  return `${req.user.provider}:${req.user.id}`;
}

// GET /votes → estado inicial
app.get('/votes', (req, res) => {
  const votes = loadVotes();
  const userId = getUserId(req);

  const response = {};

  for (const photoId in votes) {
    const voters = votes[photoId].voters || [];
    response[photoId] = {
      votes: voters.length,
      voted: userId ? voters.includes(userId) : false,
    };
  }

  res.json(response);
});

// POST /vote → votar / quitar voto (toggle)
app.post('/vote', (req, res) => {
  const { photo_id } = req.body;
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({ error: "Has d'iniciar sessió per votar." });
  }

  if (!photo_id) {
    return res.status(400).json({ error: 'photo_id requerit' });
  }

  const votes = loadVotes();
  if (!votes[photo_id]) {
    votes[photo_id] = { voters: [] };
  }

  const voters = votes[photo_id].voters;
  const index = voters.indexOf(userId);

  if (index === -1) {
    // No había votado → añadimos
    voters.push(userId);
  } else {
    // Ya había votado → quitamos
    voters.splice(index, 1);
  }

  saveVotes(votes);

  const dataForUser = {
    votes: voters.length,
    voted: voters.includes(userId),
  };

  // Emitir a todos el nuevo total
  io.emit('voteUpdated', { photo_id, data: dataForUser });

  res.json(dataForUser);
});

// -----------------------------
//   SOCKET.IO
// -----------------------------
io.on('connection', (socket) => {
  console.log('Cliente conectado');
});

// -----------------------------
//   ARRANQUE SERVIDOR
// -----------------------------
const os = require('os');

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost'; // fallback
}

const HOST = getLocalIP();
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escoltant a:`);
  console.log(` - http://localhost:${PORT}`);
  console.log(` - http://${HOST}:${PORT}`);
  console.log(` - http://${HOST}.nip.io:${PORT}  (domini per Google OAuth)`);
});

