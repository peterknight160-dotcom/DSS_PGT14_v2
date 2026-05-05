const express = require('express')
const app = express();
const port = 3000;
const bodyParser = require('body-parser');
const pgp = require('pg-promise')();
const bcrypt = require('bcrypt');
const fs = require('fs');
const session = require('express-session');
const { authenticateUser } = require('./authorizeuser.js');
const { getPosts } = require('./getposts.js');
const { get } = require('http');
const https = require('https');
const xss = require('xss');
require('dotenv').config();

// ── Stripe ──
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ── Existing login plans (for authenticated users) ──
const PLANS = {
  onetime: { name: 'One-time Access',      amount: 1999, currency: 'gbp', mode: 'payment'      },
  monthly: { name: 'Monthly Subscription', amount: 999,  currency: 'gbp', mode: 'subscription' },
  annual:  { name: 'Annual Subscription',  amount: 7999, currency: 'gbp', mode: 'subscription' }
};

// ── Registration plans (subscriber + contributor with discount) ──
const REG_PLANS = {
  sub_monthly:    { name: 'Subscriber — Monthly',  amount: 999,  currency: 'gbp', mode: 'subscription', interval: 'month', role: 'SUBSCRIBER'  },
  sub_annual:     { name: 'Subscriber — Annual',   amount: 7999, currency: 'gbp', mode: 'subscription', interval: 'year',  role: 'SUBSCRIBER'  },
  contrib_monthly:{ name: 'Contributor — Monthly', amount: 499,  currency: 'gbp', mode: 'subscription', interval: 'month', role: 'CONTRIBUTOR' },
  contrib_annual: { name: 'Contributor — Annual',  amount: 3999, currency: 'gbp', mode: 'subscription', interval: 'year',  role: 'CONTRIBUTOR' }
};

const pepper = 'yshlxehpyoxi';

// Session middleware
const store = new session.MemoryStore();
app.use(
  session({
    secret: "dvndjfdnjkd",
    cookie: {
      maxAge: 3600000,
      httpOnly: true,
      secure: true,
      sameSite: "lax"
    },
    resave: false,
    saveUninitialized: false,
    store
  })
);

// DB connections
const cn_posts = {
  host: 'db', port: 5432, database: 'blogapp',
  user: 'blogapp_user', password: 'blogapp_user_password', max: 30
};
const db_posts = pgp(cn_posts);

const cn = {
  host: 'db', port: 5432, database: 'blogapp',
  user: 'blogapp_admin', password: 'blogapp_admin_password', max: 30
};
const db = pgp(cn);

// Static files
app.use('/css', express.static(__dirname + '/public/css'));
app.use('/js', express.static(__dirname + '/public/js'));
app.use('/imgs', express.static(__dirname + '/public/imgs'));
app.use('/json', express.static(__dirname + '/public/json'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ══════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════

// Landing page → login
app.get('/', async (req, res) => {
  res.sendFile(__dirname + '/public/html/login.html', (err) => {
    if (err) console.log(err);
  });
});

// Graphic page — LOGIN flow only
app.get('/graphic', (req, res) => {
  if (!req.session.pendingAuth) {
    return res.redirect('/login');
  }
  res.sendFile(__dirname + '/public/html/graphic-login.html', (err) => {
    if (err) console.log(err);
  });
});

// ── /graphic-mode — tells the frontend which flow is active ──
// graphic.js calls this to know whether to POST to /click or /register-click
app.get('/graphic-mode', (req, res) => {
  if (req.session.pendingRegistration) {
    return res.json({ mode: 'register' });
  }
  return res.json({ mode: 'login' });
});

// ── /click — LOGIN second factor (graphic) ──
app.post('/click', async (req, res) => {
  const { x, y, n } = req.body;
  console.log('Received:', x, y, n);
  console.log(' n is a ', typeof n);
  console.log('Session ID:', req.session.id);
  console.log('pendingAuth:', req.session.pendingAuth);
  console.log('pendingUser:', req.session.pendingUser);

  if (!req.session.pendingAuth) {
    console.log('BLOCKED: pendingAuth is false/missing — session lost between /password and /click');
    return res.status(403).json({ error: 'Unauthorised. Please log in first.' });
  }

  req.session.user_n = n;
  const ip_addr      = req.socket.remoteAddress?.replace('::ffff:', '');
  const username     = req.session.pendingUser?.username;

  if (!username) {
    return res.status(403).json({ error: 'Session expired. Please log in again.' });
  }

  try {
    const login_check = await db.one(
      'SELECT check_user_login2 ($1, $2, $3, $4, $5) AS check',
      [username, req.session.pendingPassword, 'localhost', ip_addr, n]
    );

    console.log(`check_user_login2 result: ${login_check.check}, username: ${username}, n: ${n}, ip: ${ip_addr}`);

    if (login_check.check !== 0) {
      req.session.pendingAuth     = false;
      req.session.pendingUser     = null;
      req.session.pendingPassword = null;
      req.session.user_n          = null;
      console.log('Login check FAILED — redirecting to login');
      return res.json({ redirect: '/login' });
    }

    const pendingUser = req.session.pendingUser;
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regen failed after graphic:', err);
        return res.status(500).json({ error: 'Session error. Please try again.' });
      }
      req.session.authenticated = true;
      req.session.user = { username: pendingUser.username, role: pendingUser.role };
      const redirectTo = pendingUser.role === 'CONTRIBUTOR' ? '/index.html' : '/index_subs.html';
      // Save session explicitly before responding
      req.session.save((saveErr) => {
        if (saveErr) console.error('Session save error:', saveErr);
        res.json({ redirect: redirectTo });
      });
    });

  } catch (err) {
    console.error('Graphic auth error:', err);
    req.session.pendingAuth     = false;
    req.session.pendingUser     = null;
    req.session.pendingPassword = null;
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

app.get('/login', (req, res) => {
  console.log('Got to login route');
  res.sendFile(__dirname + '/public/html/login.html', (err) => {
    if (err) console.log(err);
  });
});

// ══════════════════════════════════════════════
// REGISTRATION FLOW
// ══════════════════════════════════════════════

// Step 1 — Register page (GET)
app.get('/register', (req, res) => {
  res.sendFile(__dirname + '/public/html/register.html', (err) => {
    if (err) console.log(err);
  });
});

// Step 1 — Register init (POST) — validate credentials, store in session
app.post('/register-init', async (req, res) => {
  const username = req.body.username_input;
  const password = req.body.password_input;

  // Input validation
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Please fill in all fields.' });
  }
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ success: false, error: 'Username must be between 3 and 50 characters.' });
  }
  if (password.length < 8 || password.length > 100) {
    return res.status(400).json({ success: false, error: 'Password must be between 8 and 100 characters.' });
  }

  try {
    // Check if username already exists via the view
    const userExists = await db.oneOrNone(
      'SELECT 1 FROM user_vw WHERE username = $1',
      [username]
    );

    if (userExists) {
      return res.status(409).json({ success: false, error: 'Username already taken. Please choose another.' });
    }

    // Store plain password in session — enrole_user encrypts it with pgp_sym_encrypt
    // Do NOT hash with bcrypt — check_user_login2 decrypts and compares plaintext
    req.session.pendingRegistration = {
      username,
      hashedPassword: password,  // named hashedPassword for consistency but stored plain
      createdAt: Date.now()
    };

    // Send to graphic challenge (step 2)
    return res.json({ success: true, redirectTo: '/register-graphic' });

  } catch (err) {
    console.error('Register init error:', err);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// Step 2 — Registration graphic page (GET)
app.get('/register-graphic', (req, res) => {
  if (!req.session.pendingRegistration) {
    return res.redirect('/register');
  }
  res.sendFile(__dirname + '/public/html/graphic-register.html', (err) => {
    if (err) console.log(err);
  });
});

// Step 2 — Registration graphic click (POST)
// Different from /click — this is for registration, not login
app.post('/register-click', (req, res) => {
  const { n } = req.body;

  if (!req.session.pendingRegistration) {
    return res.status(403).json({ error: 'Session expired. Please register again.' });
  }

  // Store the graphic number in the pending registration
  req.session.pendingRegistration.graphic_n = n;

  // Move to plan selection (step 3)
  res.json({ redirect: '/register-plan' });
});

// Step 3 — Plan selection page (GET)
app.get('/register-plan', (req, res) => {
  if (!req.session.pendingRegistration) {
    return res.redirect('/register');
  }
  res.sendFile(__dirname + '/public/html/register-plan.html', (err) => {
    if (err) console.log(err);
  });
});

// Step 4 — Create Stripe checkout session for registration (POST)
app.post('/register-checkout', async (req, res) => {
  if (!req.session.pendingRegistration) {
    return res.status(403).json({ error: 'Session expired. Please register again.' });
  }

  const planKey = req.body.plan;
  const plan    = REG_PLANS[planKey];

  if (!plan) {
    return res.status(400).json({ error: 'Invalid plan selected.' });
  }

  // Store chosen plan and role in session
  req.session.pendingRegistration.plan = planKey;
  req.session.pendingRegistration.role = plan.role;

  try {
    // Create Stripe subscription price on the fly
    const price = await stripe.prices.create({
      unit_amount:  plan.amount,
      currency:     plan.currency,
      recurring:    { interval: plan.interval },
      product_data: { name: plan.name }
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode:                 'subscription',
      line_items:           [{ price: price.id, quantity: 1 }],
      // Pass all registration data in metadata so webhook can create account
      metadata: {
        username:      req.session.pendingRegistration.username,
        hashedPassword:req.session.pendingRegistration.hashedPassword,
        graphic_n:     String(req.session.pendingRegistration.graphic_n ?? 10),
        role:          plan.role,
        plan:          planKey
      },
      success_url: `${process.env.APP_URL || 'https://localhost:3000'}/register-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.APP_URL || 'https://localhost:3000'}/register-cancel`,
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error('Stripe registration error:', err.message);
    res.status(500).json({ error: 'Payment setup failed. Please try again.' });
  }
});

// Step 4 — Registration success (GET) — verify payment and create account
app.get('/register-success', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    if (session.payment_status === 'paid' || session.status === 'complete') {
      const { username, hashedPassword, graphic_n, role } = session.metadata;

      // Create the account in the DB now that payment is confirmed
      const result = await db.one(
        'SELECT enrole_user($1, $2, $3, $4) as result',
        [username, hashedPassword, role, parseInt(graphic_n) || 10]
      );

      console.log(`Registration complete: user=${username}, role=${role}, enrole_result=${result.result}`);

      if (result.result === 0) {
        // Account created successfully
        req.session.pendingRegistration = null;
        console.log(`Account created for ${username}`);
        return res.sendFile(__dirname + '/public/html/register-success.html', (err) => {
          if (err) console.log(err);
        });
      } else if (result.result === 1) {
        // Username already taken
        console.warn(`Username ${username} already existed`);
        return res.sendFile(__dirname + '/public/html/register-failed.html', (err) => {
          if (err) console.log(err);
        });
      } else {
        // enrole_user returned an error code (2=bad username chars, 3=bad password chars)
        console.error(`enrole_user returned error code: ${result.result}`);
        return res.sendFile(__dirname + '/public/html/register-failed.html', (err) => {
          if (err) console.log(err);
        });
      }
    } else {
      // Payment not confirmed by Stripe
      console.warn('Payment not confirmed by Stripe on register-success');
      return res.sendFile(__dirname + '/public/html/register-failed.html', (err) => {
        if (err) console.log(err);
      });
    }

  } catch (err) {
    console.error('Registration success error:', err.message);
    return res.sendFile(__dirname + '/public/html/register-failed.html', (err2) => {
      if (err2) console.log(err2);
    });
  }
});

// Registration cancelled
app.get('/register-cancel', (req, res) => {
  res.sendFile(__dirname + '/public/html/register-cancel.html', (err) => {
    if (err) console.log(err);
  });
});

// ══════════════════════════════════════════════
// LOGIN FLOW
// ══════════════════════════════════════════════

// Step 1 — Password check
app.post('/password', async (req, res) => {
  const username = req.body.username_input;
  const password = req.body.password_input;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Please fill in all fields.' });
  }
  if (username.length > 50 || password.length > 100) {
    return res.status(400).json({ success: false, error: 'Invalid input.' });
  }

  try {
    // Clear any stale registration session so login flow is clean
    req.session.pendingRegistration = null;

    const userExists = await db.oneOrNone(
      'SELECT role FROM user_vw WHERE username = $1',
      [username]
    );

    if (!userExists) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    req.session.pendingAuth     = true;
    req.session.pendingUser     = { username, role: userExists.role };
    req.session.pendingPassword = password;

    console.log('Session set in /password — ID:', req.session.id, 'pendingAuth:', req.session.pendingAuth);

    return res.json({ success: true, redirectTo: '/graphic' });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ══════════════════════════════════════════════
// PROTECTED ROUTES
// ══════════════════════════════════════════════

const refreshPosts = async (req, res, next) => {
  try {
    await getPosts(db_posts);
  } catch (err) {
    console.error('Failed to refresh posts:', err);
    res.status(500).send('Unable to get posts.');
  }
  next();
};

app.get('/index.html', authenticateUser, refreshPosts, (req, res) => {
  const role = req.session.user?.role;
  console.log('Line 184, role is ' + role);
  if (role === 'CONTRIBUTOR') {
    return res.sendFile(__dirname + '/public/html/index.html');
  }
  return res.redirect('/index_subs.html');
});

app.get('/index_subs.html', authenticateUser, refreshPosts, (req, res) => {
  res.sendFile(__dirname + '/public/html/index_subs.html');
});

app.get('/current-user', authenticateUser, (req, res) => {
  return res.json({ username: req.session.user.username });
});

app.get('/posts', authenticateUser, refreshPosts, (req, res) => {
  res.sendFile(__dirname + '/public/html/posts.html');
});

app.get('/my_posts', authenticateUser, (req, res) => {
  res.sendFile(__dirname + '/public/html/my_posts.html');
});

app.post('/makepost', authenticateUser, async (req, res) => {
  console.log('Makepost called ');
  const json  = fs.readFileSync(__dirname + '/public/json/posts.json');
  const posts = JSON.parse(json);
  let curDate = new Date();
  curDate = curDate.toLocaleString("en-GB");
  let maxId = 0;
  for (let i = 0; i < posts.length; i++) {
    if (posts[i].postId > maxId) maxId = posts[i].postId;
  }
  let newId = 0;
  if (req.body.postId == "") {
    newId = maxId + 1;
  } else {
    newId = req.body.postId;
    let index = posts.findIndex(item => item.postId == newId);
    posts.splice(index, 1);
  }
  var clean_title   = xss(req.body.title_field);
  var clean_content = xss(req.body.content_field);
  posts.push({ "username": req.session.user.username, "timestamp": curDate, "postId": newId, "title": clean_title, "content": clean_content });
  fs.writeFileSync(__dirname + '/public/json/posts.json', JSON.stringify(posts));
  await db_posts.proc('insert_post', [req.session.user.username, clean_title, clean_content]);
  res.sendFile(__dirname + "/public/html/my_posts.html");
});

app.post('/deletepost', authenticateUser, (req, res) => {
  const json  = fs.readFileSync(__dirname + '/public/json/posts.json');
  var posts   = JSON.parse(json);
  let index   = posts.findIndex(item => item.postId == req.body.postId);
  posts.splice(index, 1);
  fs.writeFileSync(__dirname + '/public/json/posts.json', JSON.stringify(posts));
  res.sendFile(__dirname + "/public/html/my_posts.html");
});

// ── Payment page (for existing users) ──
app.get('/payment', authenticateUser, (req, res) => {
  res.sendFile(__dirname + '/public/html/payment.html', (err) => {
    if (err) console.log(err);
  });
});

app.post('/create-checkout-session', authenticateUser, async (req, res) => {
  const planKey = req.body.plan;
  const plan    = PLANS[planKey];
  if (!plan) return res.status(400).json({ error: 'Invalid plan selected.' });
  try {
    let sessionConfig = {
      payment_method_types: ['card'],
      customer_email: req.session.user.username.includes('@') ? req.session.user.username : undefined,
      metadata: { username: req.session.user.username, plan: planKey },
      success_url: `${process.env.APP_URL || 'https://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.APP_URL || 'https://localhost:3000'}/payment-cancel`,
    };
    if (plan.mode === 'subscription') {
      const price = await stripe.prices.create({
        unit_amount: plan.amount, currency: plan.currency,
        recurring: { interval: planKey === 'monthly' ? 'month' : 'year' },
        product_data: { name: plan.name }
      });
      sessionConfig.mode       = 'subscription';
      sessionConfig.line_items = [{ price: price.id, quantity: 1 }];
    } else {
      sessionConfig.mode       = 'payment';
      sessionConfig.line_items = [{ price_data: { currency: plan.currency, unit_amount: plan.amount, product_data: { name: plan.name } }, quantity: 1 }];
    }
    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: 'Payment setup failed. Please try again.' });
  }
});

app.get('/payment-success', authenticateUser, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    if (session.payment_status === 'paid' || session.status === 'complete') {
      console.log(`Payment success: user=${req.session.user.username}, plan=${session.metadata.plan}`);
    }
  } catch (err) {
    console.error('Payment success verification error:', err.message);
  }
  res.sendFile(__dirname + '/public/html/payment_success.html', (err) => {
    if (err) console.log(err);
  });
});

app.get('/payment-cancel', authenticateUser, (req, res) => {
  res.sendFile(__dirname + '/public/html/payment_cancel.html', (err) => {
    if (err) console.log(err);
  });
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/');
  });
});

app.use((req, res, next) => {
  req.on('aborted', () => {
    console.error(`Request aborted: ${req.method} ${req.originalUrl}`);
  });
  next();
});

//app only runs if run directly, needed for test files
if (require.main === module) {
const sslOptions = {
key: fs.readFileSync(__dirname + '/../certs/localhost-key-pem'),
cert: fs.readFileSync(__dirname + '/../certs/localhost-cert.pem'),
};

// Main HTTPS server
https.createServer(sslOptions, app).listen(port, () => {
console.log('HTTPS app listening on port ' + port);
});

}

module.exports = app;