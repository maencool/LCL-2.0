require("dotenv").config(); // <--- ADD THIS AT THE VERY TOP

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
// ... rest of the code
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "lcl-change-this-secret";
const DATA_DIR = path.join(__dirname, "data");
const LEVELS_FILE = path.join(DATA_DIR, "levels.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_ADMIN = {
  id: "admin-1",
  username: "officialmaencopra",
  email: "officialmaencopra@gmail.com",
  displayName: "Official Maencopra",
  password: "$2b$10$SSvH1y8CBNjcOnw1jVNLleTWsatMieXV/iikAw5iBeO.XonF18iEu",
  role: "admin"
};

const difficultyOrder = {
  Extreme: 4,
  Hard: 3,
  Medium: 2,
  Easy: 1
};

app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);
app.use(express.static(PUBLIC_DIR));

function createError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username || "",
    email: user.email || "",
    displayName: user.displayName || user.username || "User",
    role: user.role
  };
}

function slugifyUsername(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

function createUniqueUsername(baseValue, usedUsernames) {
  let base = slugifyUsername(baseValue);
  if (!base) {
    base = "user";
  }

  let candidate = base;
  let counter = 1;

  while (usedUsernames.has(candidate)) {
    const suffix = String(counter);
    const trimmedBase = base.slice(0, Math.max(1, 20 - suffix.length));
    candidate = `${trimmedBase}${suffix}`;
    counter += 1;
  }

  usedUsernames.add(candidate);
  return candidate;
}

function sanitizeSubmission(submission) {
  return {
    id: submission.id,
    levelName: submission.levelName,
    creator: submission.creator,
    difficulty: submission.difficulty,
    senderName: submission.senderName,
    youtubeUrl: submission.youtubeUrl,
    isChallenge: Boolean(submission.isChallenge),
    createdAt: submission.createdAt
  };
}

async function ensureJsonFile(filePath, fallbackData) {
  try {
    await fs.access(filePath);
  } catch (error) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(fallbackData, null, 2)}\n`, "utf8");
  }
}

async function readJsonArray(filePath, errorLabel) {
  const raw = await fs.readFile(filePath, "utf8");

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw createError(`Could not parse ${errorLabel}.`, 500);
  }
}

async function ensureLevelsFile() {
  await ensureJsonFile(LEVELS_FILE, []);
}

async function ensureSubmissionsFile() {
  await ensureJsonFile(SUBMISSIONS_FILE, []);
}

async function readLevels() {
  await ensureLevelsFile();
  return readJsonArray(LEVELS_FILE, "levels.json");
}

async function readSubmissions() {
  await ensureSubmissionsFile();
  return readJsonArray(SUBMISSIONS_FILE, "submissions.json");
}

function sortAndReposition(levels) {
  return [...levels]
    .sort((a, b) => (a.position || 999999) - (b.position || 999999))
    .map((level, index) => {
      // FIX: Permanently strip out 'points', 'text', and other unwanted fields from the DB
      const { points, text, ...rest } = level;
      
      return {
        ...rest,
        position: index + 1
      };
    });
}

async function writeLevels(levels) {
  const normalizedLevels = sortAndReposition(levels);
  await fs.writeFile(LEVELS_FILE, `${JSON.stringify(normalizedLevels, null, 2)}\n`, "utf8");
  return normalizedLevels;
}

async function writeSubmissions(submissions) {
  await fs.writeFile(SUBMISSIONS_FILE, `${JSON.stringify(submissions, null, 2)}\n`, "utf8");
  return submissions;
}

async function ensureUsersFile() {
  await ensureJsonFile(USERS_FILE, [DEFAULT_ADMIN]);
  const users = await readJsonArray(USERS_FILE, "users.json");
  const usedUsernames = new Set();
  const migratedUsers = users
    .map((user) => ({
      ...user,
      email: normalizeEmail(user.email || user.username),
      displayName: user.displayName || user.username || "User",
      username: createUniqueUsername(
        user.username || normalizeEmail(user.email).split("@")[0] || user.displayName,
        usedUsernames
      )
    }))
    .filter((user) => user.email);

  const adminIndex = migratedUsers.findIndex((user) => user.id === DEFAULT_ADMIN.id || user.role === "admin");

  if (adminIndex >= 0) {
    migratedUsers[adminIndex] = {
      ...migratedUsers[adminIndex],
      ...DEFAULT_ADMIN
    };
    usedUsernames.add(DEFAULT_ADMIN.username);
  } else {
    migratedUsers.unshift(DEFAULT_ADMIN);
  }

  await fs.writeFile(USERS_FILE, `${JSON.stringify(migratedUsers, null, 2)}\n`, "utf8");
}

async function readUsers() {
  await ensureUsersFile();
  return readJsonArray(USERS_FILE, "users.json");
}

async function writeUsers(users) {
  await fs.writeFile(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, "utf8");
  return users;
}

function normalizeDifficulty(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  const match = Object.keys(difficultyOrder).find(
    (difficulty) => difficulty.toLowerCase() === trimmed.toLowerCase()
  );

  return match || "";
}

function validateLevelInput(payload, existingLevels, currentId = null) {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const creator = typeof payload.creator === "string" ? payload.creator.trim() : "";
  const difficulty = normalizeDifficulty(payload.difficulty);
  const youtubeUrl = typeof payload.youtubeUrl === "string" ? payload.youtubeUrl.trim() : "";

  if (!name || name.length < 2 || name.length > 60) {
    throw createError("Level name must be between 2 and 60 characters.");
  }

  if (!creator || creator.length < 2 || creator.length > 60) {
    throw createError("Creator name must be between 2 and 60 characters.");
  }

  if (!difficulty) {
    throw createError("Difficulty must be one of: Easy, Medium, Hard, Extreme.");
  }

  if (youtubeUrl && !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(youtubeUrl)) {
    throw createError("Please enter a valid YouTube URL.");
  }

  const hasDuplicateName = existingLevels.some(
    (level) => level.id !== currentId && level.name.toLowerCase() === name.toLowerCase()
  );

  if (hasDuplicateName) {
    throw createError("A level with that name already exists.");
  }

  return {
    name,
    creator,
    difficulty,
    youtubeUrl
  };
}

function validatePosition(position, maxPosition) {
  const numericPosition = Number(position);

  if (!Number.isInteger(numericPosition) || numericPosition < 1) {
    throw createError("Position must be a whole number starting from 1.");
  }

  return Math.min(numericPosition, maxPosition);
}

function insertLevelAtPosition(levels, level, requestedPosition) {
  const orderedLevels = sortAndReposition(levels);
  const clampedPosition = validatePosition(requestedPosition, orderedLevels.length + 1);
  orderedLevels.splice(clampedPosition - 1, 0, level);

  return orderedLevels.map((entry, index) => ({
    ...entry,
    position: index + 1
  }));
}

function validateSubmissionInput(payload) {
  const levelName = typeof payload.levelName === "string" ? payload.levelName.trim() : "";
  const creator = typeof payload.creator === "string" ? payload.creator.trim() : "";
  const difficulty = normalizeDifficulty(payload.difficulty);
  const senderName = typeof payload.senderName === "string" ? payload.senderName.trim() : "";
  const youtubeUrl = typeof payload.youtubeUrl === "string" ? payload.youtubeUrl.trim() : "";
  const isChallenge = payload.isChallenge === true || payload.isChallenge === "true";

  if (!levelName || levelName.length < 2 || levelName.length > 60) {
    throw createError("Level name must be between 2 and 60 characters.");
  }

  if (!creator || creator.length < 2 || creator.length > 60) {
    throw createError("Creator name must be between 2 and 60 characters.");
  }

  if (!senderName || senderName.length < 2 || senderName.length > 40) {
    throw createError("Sender name must be between 2 and 40 characters.");
  }

  if (!difficulty) {
    throw createError("Difficulty must be one of: Easy, Medium, Hard, Extreme.");
  }

  if (!youtubeUrl || youtubeUrl.length > 300) {
    throw createError("A YouTube proof URL is required.");
  }

  if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(youtubeUrl)) {
    throw createError("Please enter a valid YouTube URL.");
  }

  return {
    levelName,
    creator,
    difficulty,
    senderName,
    youtubeUrl,
    isChallenge
  };
}

function validateEmail(email) {
  const normalized = normalizeEmail(email);

  if (!normalized || normalized.length > 120) {
    throw createError("Email is required and must be shorter than 120 characters.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw createError("Please enter a valid email address.");
  }

  return normalized;
}

function validateDisplayName(displayName) {
  const normalized = typeof displayName === "string" ? displayName.trim() : "";

  if (!normalized || normalized.length < 2 || normalized.length > 40) {
    throw createError("Display name must be between 2 and 40 characters.");
  }

  return normalized;
}

function validateUsername(username) {
  const normalized = typeof username === "string" ? username.trim().toLowerCase() : "";

  if (!normalized || normalized.length < 3 || normalized.length > 20) {
    throw createError("Username must be between 3 and 20 characters.");
  }

  if (!/^[a-z0-9_]+$/.test(normalized)) {
    throw createError("Username can only use lowercase letters, numbers, and underscores.");
  }

  return normalized;
}

function validatePassword(password) {
  const normalized = typeof password === "string" ? password : "";

  if (normalized.length < 6 || normalized.length > 72) {
    throw createError("Password must be between 6 and 72 characters.");
  }

  return normalized;
}

async function attachCurrentUser(req, res, next) {
  try {
    if (!req.session.userId) {
      req.currentUser = null;
      return next();
    }

    const users = await readUsers();
    const user = users.find((entry) => entry.id === req.session.userId);

    if (!user) {
      req.session.destroy(() => {});
      req.currentUser = null;
      return next();
    }

    req.currentUser = sanitizeUser(user);
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    return next(createError("You must be logged in to do that.", 401));
  }

  return next();
}

function requireAdmin(req, res, next) {
  if (!req.currentUser) {
    return next(createError("You must be logged in to do that.", 401));
  }

  if (req.currentUser.role !== "admin") {
    return next(createError("Admin access required.", 403));
  }

  return next();
}

app.use(attachCurrentUser);

app.get("/api/me", (req, res) => {
  res.json({ success: true, data: req.currentUser });
});

app.post("/api/register", async (req, res, next) => {
  try {
    const username = validateUsername(req.body.username);
    const email = validateEmail(req.body.email);
    const displayName = validateDisplayName(req.body.displayName);
    const password = validatePassword(req.body.password);
    const users = await readUsers();

    if (users.some((user) => (user.username || "").toLowerCase() === username)) {
      throw createError("That username is already in use.");
    }

    if (users.some((user) => normalizeEmail(user.email || user.username) === email)) {
      throw createError("That email is already in use.");
    }

    if (users.some((user) => (user.displayName || "").toLowerCase() === displayName.toLowerCase())) {
      throw createError("That display name is already used. Please choose another display name.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(),
      username,
      email,
      displayName,
      password: hashedPassword,
      role: "user"
    };

    await writeUsers([...users, newUser]);
    req.session.userId = newUser.id;

    res.status(201).json({ success: true, data: sanitizeUser(newUser) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const email = validateEmail(req.body.email);
    const password = validatePassword(req.body.password);
    const users = await readUsers();
    const user = users.find((entry) => normalizeEmail(entry.email || entry.username) === email);

    if (!user) {
      throw createError("Invalid email or password.", 401);
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      throw createError("Invalid email or password.", 401);
    }

    req.session.userId = user.id;
    res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/grant-admin", requireAdmin, async (req, res, next) => {
  try {
    const username = validateUsername(req.body.username);
    const users = await readUsers();
    const targetIndex = users.findIndex((user) => (user.username || "").toLowerCase() === username);

    if (targetIndex === -1) {
      throw createError("No user was found with that username.", 404);
    }

    if (users[targetIndex].role === "admin") {
      throw createError("That user is already an admin.");
    }

    const updatedUsers = [...users];
    updatedUsers[targetIndex] = {
      ...updatedUsers[targetIndex],
      role: "admin"
    };

    await writeUsers(updatedUsers);
    res.json({ success: true, data: sanitizeUser(updatedUsers[targetIndex]) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/logout", requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      return next(createError("Could not log out right now.", 500));
    }

    res.clearCookie("connect.sid");
    return res.json({ success: true, data: null });
  });
});

app.get("/api/levels", async (req, res, next) => {
  try {
    const levels = sortAndReposition(await readLevels());
    res.json({ success: true, data: levels });
  } catch (error) {
    next(error);
  }
});

app.post("/api/levels", requireAdmin, async (req, res, next) => {
  try {
    const levels = await readLevels();
    const validated = validateLevelInput(req.body, levels);
    
    // FIX: Removed "points: 0" so it stops getting created
    const newLevel = {
      id: Date.now().toString(),
      ...validated,
      position: 0
    };

    const updatedLevels = await writeLevels(
      insertLevelAtPosition(levels, newLevel, req.body.position || levels.length + 1)
    );
    const savedLevel = updatedLevels.find((level) => level.id === newLevel.id);

    res.status(201).json({ success: true, data: savedLevel });
  } catch (error) {
    next(error);
  }
});

app.put("/api/levels/:id", requireAdmin, async (req, res, next) => {
  try {
    const levels = await readLevels();
    const targetIndex = levels.findIndex((level) => level.id === req.params.id);

    if (targetIndex === -1) {
      throw createError("Level not found.", 404);
    }

    const validated = validateLevelInput(req.body, levels, req.params.id);
    const currentLevel = levels[targetIndex];
    const updatedLevel = {
      ...currentLevel,
      ...validated
    };

    const remainingLevels = levels.filter((level) => level.id !== req.params.id);
    const savedLevels = await writeLevels(
      insertLevelAtPosition(
        remainingLevels,
        updatedLevel,
        req.body.position || currentLevel.position || remainingLevels.length + 1
      )
    );
    const savedLevel = savedLevels.find((level) => level.id === req.params.id);

    res.json({ success: true, data: savedLevel });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/levels/:id", requireAdmin, async (req, res, next) => {
  try {
    const levels = await readLevels();
    const levelToDelete = levels.find((level) => level.id === req.params.id);

    if (!levelToDelete) {
      throw createError("Level not found.", 404);
    }

    const filteredLevels = levels.filter((level) => level.id !== req.params.id);
    await writeLevels(filteredLevels);

    res.json({ success: true, data: levelToDelete });
  } catch (error) {
    next(error);
  }
});

app.post("/api/submissions", async (req, res, next) => {
  try {
    const payload = validateSubmissionInput(req.body);
    const submissions = await readSubmissions();
    const levels = await readLevels();

    if (levels.some((level) => level.name.toLowerCase() === payload.levelName.toLowerCase())) {
      throw createError("That level already exists in the leaderboard.");
    }

    const submission = {
      id: Date.now().toString(),
      ...payload,
      createdAt: new Date().toISOString()
    };

    await writeSubmissions([submission, ...submissions]);
    res.status(201).json({ success: true, data: sanitizeSubmission(submission) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/submissions", requireAdmin, async (req, res, next) => {
  try {
    const submissions = await readSubmissions();
    res.json({ success: true, data: submissions.map(sanitizeSubmission) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/submissions/:id/approve", requireAdmin, async (req, res, next) => {
  try {
    const submissions = await readSubmissions();
    const levels = await readLevels();
    const submission = submissions.find((entry) => entry.id === req.params.id);

    if (!submission) {
      throw createError("Submission not found.", 404);
    }

    const validated = validateLevelInput(
      {
        name: submission.levelName,
        creator: submission.creator,
        difficulty: submission.difficulty,
        youtubeUrl: submission.youtubeUrl
      },
      levels
    );

    // FIX: Removed "points: 0" so it stops getting created
    const newLevel = {
      id: Date.now().toString(),
      ...validated,
      position: 0
    };

    await writeLevels(
      insertLevelAtPosition(levels, newLevel, req.body.position || levels.length + 1)
    );
    await writeSubmissions(submissions.filter((entry) => entry.id !== req.params.id));

    res.json({ success: true, data: newLevel });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/submissions/:id", requireAdmin, async (req, res, next) => {
  try {
    const submissions = await readSubmissions();
    const submission = submissions.find((entry) => entry.id === req.params.id);

    if (!submission) {
      throw createError("Submission not found.", 404);
    }

    await writeSubmissions(submissions.filter((entry) => entry.id !== req.params.id));
    res.json({ success: true, data: sanitizeSubmission(submission) });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "API route not found." });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, message: "API route not found." });
  }

  return res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const message =
    status === 500 ? "Internal server error." : error.message || "Request failed.";

  res.status(status).json({ success: false, message });
});

async function startServer() {
  await ensureLevelsFile();
  await ensureUsersFile();
  await ensureSubmissionsFile();
  
  // Running this on startup will instantly clean your database of existing points/texts
  await writeLevels(await readLevels());

  const server = app.listen(PORT, () => {
    console.log(`LCL server running at http://localhost:${PORT}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Stop the other server or set a different PORT.`);
      process.exit(1);
    }

    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});