// --- 🔧 Load Environment Variables ---
require('dotenv').config();

// --- 📦 Import Core Dependencies ---
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const audit = require('express-requests-logger');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

// --- 📦 Import Route Modules ---
const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const apiRouter = require('./routes/api');
const apiv1Router = require('./routes/apiv1');
const twoFactorAuthRouter = require('./routes/two_factor_auth');

// --- 🚀 Initialize App ---
const app = express();
app.disable("x-powered-by");

// --- 🌐 Static Assets ---
app.use(express.static('public'));

// --- 🛠️ View Engine Setup ---
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- 🌐 Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// --- 🔒 Content Security Policy (CSP) ---
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://code.jquery.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.datatables.net https://static.cloudflareinsights.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://cdn.datatables.net; " +
    "font-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://challenges.cloudflare.com https://cdn.jsdelivr.net; " +
    "frame-src 'self' https://challenges.cloudflare.com;"
  );
  next();
});

// --- ⚙️ Connect to MongoDB (for session + models) ---
mongoose.connect(process.env.MONGO_URI_TMP)
  .then(() => {
    console.log('✅ MongoDB connected for session store.');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
  });

// --- 🔐 Session Configuration ---
app.use(session({
  secret: process.env.TOKEN_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI_TMP,
    collectionName: 'sessions'
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 // 1 ชั่วโมง
  }
}));

// --- 🌍 Add user info to all views ---
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// --- 🌐 Domain Access Middleware ---
const ALLOWED_HOSTNAME_FOR_UI = process.env.DOMIN_NAME;

const domainAccessMiddleware = (req, res, next) => {
  const requestHost = req.hostname;

  const isAllowedHost =
    requestHost === ALLOWED_HOSTNAME_FOR_UI ||
    requestHost === 'localhost' ||
    requestHost === '127.0.0.1';

  if (isAllowedHost) {
    return next();
  }

  if (
    req.path.startsWith('/admin') ||
    req.path === '/login' ||
    req.path === '/'
  ) {
    return res
      .status(403)
      .send(
        '<h1>403 Forbidden</h1><p>You do not have permission to access this page from this domain.</p>'
      );
  }

  next();
};

app.use(domainAccessMiddleware);

// cloudflare TURNSTILE SITE KEY
app.use((req, res, next) => {
  res.locals.turnstile_sitekey = process.env.TURNSTILE_SITE_KEY;
  next();
});

// --- 🧭 Routers ---
app.use('/', indexRouter);
app.use('/2fa', twoFactorAuthRouter);
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/api', apiRouter);
app.use('/apiv1', apiv1Router);

// --- ❌ 404 Not Found ---
app.use((req, res, next) => {
  res.status(404).render('404', { url: req.originalUrl });
});

// --- 🚀 Start Server ---
const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});