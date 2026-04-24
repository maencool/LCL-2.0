const globalMessageEl = document.getElementById("globalMessage");
const leaderboardEl = document.getElementById("leaderboard");
const emptyStateEl = document.getElementById("emptyState");
const formEl = document.getElementById("levelForm");
const formTitleEl = document.getElementById("formTitle");
const submitBtnEl = document.getElementById("submitBtn");
const cancelEditBtnEl = document.getElementById("cancelEditBtn");
const refreshBtnEl = document.getElementById("refreshBtn");
const currentUserLabelEl = document.getElementById("currentUserLabel");
const logoutBtnEl = document.getElementById("logoutBtn");
const adminPanelEl = document.getElementById("adminPanel");
const actionsHeaderEl = document.getElementById("actionsHeader");
const loginFormEl = document.getElementById("loginForm");
const registerFormEl = document.getElementById("registerForm");
const grantAdminFormEl = document.getElementById("grantAdminForm");
const submissionFormEl = document.getElementById("submissionForm");
const submissionListEl = document.getElementById("submissionList");
const submissionEmptyStateEl = document.getElementById("submissionEmptyState");
const submissionBadgeEl = document.getElementById("submissionBadge");
const submissionCountTextEl = document.getElementById("submissionCountText");

// Sidebar Elements
const menuToggleBtn = document.getElementById("menuToggleBtn");
const closeMenuBtn = document.getElementById("closeMenuBtn");
const sidebarMenu = document.getElementById("sidebarMenu");
const menuOverlay = document.getElementById("menuOverlay");
const navButtons = document.querySelectorAll("[data-view]");

const views = {
  leaderboard: document.getElementById("leaderboardView"),
  sendLevel: document.getElementById("sendLevelView"),
  rules: document.getElementById("rulesView"),
  login: document.getElementById("loginView"),
  register: document.getElementById("registerView"),
  adminReview: document.getElementById("adminReviewView")
};

const fields = {
  id: document.getElementById("levelId"),
  name: document.getElementById("name"),
  creator: document.getElementById("creator"),
  difficulty: document.getElementById("difficulty"),
  position: document.getElementById("position"),
  youtubeUrl: document.getElementById("youtubeUrl")
};

let levels = [];
let submissions = [];
let currentUser = null;
let isSubmittingLevel = false;

// --- Sidebar Sliding Logic ---
function openMenu() {
  sidebarMenu.classList.add("open");
  menuOverlay.classList.add("open");
}

function closeMenu() {
  sidebarMenu.classList.remove("open");
  menuOverlay.classList.remove("open");
}

menuToggleBtn.addEventListener("click", openMenu);
closeMenuBtn.addEventListener("click", closeMenu);
menuOverlay.addEventListener("click", closeMenu);
// -----------------------------

function showMessage(message, type = "success") {
  globalMessageEl.textContent = message;
  globalMessageEl.className = `message ${type}`;
  globalMessageEl.classList.remove("hidden");
}

function clearMessage() {
  globalMessageEl.textContent = "";
  globalMessageEl.className = "message hidden";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getYouTubeThumbnail(url) {
  if (!url) {
    return "";
  }

  const shortMatch = url.match(/youtu\.be\/([^?&/]+)/i);
  if (shortMatch) {
    return `https://img.youtube.com/vi/${shortMatch[1]}/mqdefault.jpg`;
  }

  const watchMatch = url.match(/[?&]v=([^?&/]+)/i);
  if (watchMatch) {
    return `https://img.youtube.com/vi/${watchMatch[1]}/mqdefault.jpg`;
  }

  const embedMatch = url.match(/youtube\.com\/embed\/([^?&/]+)/i);
  if (embedMatch) {
    return `https://img.youtube.com/vi/${embedMatch[1]}/mqdefault.jpg`;
  }

  return "";
}

function isAdmin() {
  return currentUser?.role === "admin";
}

function isLoggedIn() {
  return Boolean(currentUser);
}

const response = await fetch(url, {
  headers: {
    "Content-Type": "application/json"
  },
  credentials: "include",
  ...options
});

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("The server returned an invalid JSON response.");
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

function resetLevelForm() {
  formEl.reset();
  fields.id.value = "";
  fields.difficulty.value = "Easy";
  fields.position.value = "";
  formTitleEl.textContent = "Add Level";
  submitBtnEl.textContent = "Add Level";
  cancelEditBtnEl.classList.add("hidden");
}

function setLevelSubmittingState(state) {
  isSubmittingLevel = state;
  submitBtnEl.disabled = state;
  refreshBtnEl.disabled = state;
}

function updateSubmissionBadge() {
  submissionCountTextEl.textContent = `${submissions.length} submission${submissions.length === 1 ? "" : "s"}`;
  submissionBadgeEl.textContent = String(submissions.length);
  submissionBadgeEl.classList.toggle("hidden", !isAdmin() || submissions.length === 0);
}

function updateAuthUi() {
  document.querySelectorAll(".guest-only").forEach((element) => {
    element.classList.toggle("hidden", isLoggedIn());
  });

  document.querySelectorAll(".auth-only").forEach((element) => {
    element.classList.toggle("hidden", !isLoggedIn());
  });

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !isAdmin());
  });

  currentUserLabelEl.textContent = currentUser
    ? `${currentUser.displayName} (${currentUser.role})`
    : "Guest";

  logoutBtnEl.classList.toggle("hidden", !isLoggedIn());
  adminPanelEl.classList.toggle("hidden", !isAdmin());
  actionsHeaderEl.classList.toggle("hidden", !isAdmin());

  if (!isAdmin()) {
    submissions = [];
    renderSubmissions();
    resetLevelForm();
  }

  updateSubmissionBadge();
}

function setActiveNav(viewName) {
  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
}

function showView(viewName) {
  let nextView = viewName;

  if (nextView === "adminReview" && !isAdmin()) {
    nextView = "leaderboard";
  }

  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle("active", key === nextView);
  });

  setActiveNav(nextView);
}

function renderLeaderboard() {
  leaderboardEl.innerHTML = "";

  if (levels.length === 0) {
    emptyStateEl.classList.remove("hidden");
    return;
  }

  emptyStateEl.classList.add("hidden");

  const adminMode = isAdmin();
  leaderboardEl.innerHTML = levels
    .map((level, index) => {
      const topClass = level.position <= 3 ? `top-${level.position}` : "";
      const itemClasses = ["leaderboard-item", topClass];

      if (!adminMode) {
        itemClasses.push("read-only");
      }

      const isFirst = index === 0;
      const isLast = index === levels.length - 1;

      const actionsMarkup = adminMode
        ? `
          <div class="actions">
            <button class="action-button icon-btn" type="button" data-action="move-up" data-id="${level.id}" ${isFirst ? 'disabled' : ''} title="Move Up">&#9650;</button>
            <button class="action-button icon-btn" type="button" data-action="move-down" data-id="${level.id}" ${isLast ? 'disabled' : ''} title="Move Down">&#9660;</button>
            <button class="action-button" type="button" data-action="edit" data-id="${level.id}">Edit</button>
            <button class="action-button" type="button" data-action="delete" data-id="${level.id}">Delete</button>
          </div>
        `
        : "";
      const thumbnailUrl = getYouTubeThumbnail(level.youtubeUrl);
      const thumbnailMarkup = thumbnailUrl
        ? `
          <a class="thumbnail-link" href="${escapeHtml(level.youtubeUrl)}" target="_blank" rel="noopener noreferrer">
            <img class="level-thumbnail" src="${thumbnailUrl}" alt="${escapeHtml(level.name)} thumbnail">
          </a>
        `
        : `<div class="level-thumbnail placeholder-thumbnail">No Video</div>`;

      return `
        <article class="${itemClasses.filter(Boolean).join(" ")}">
          <div class="rank-column">
            <div class="rank-badge">${level.position}</div>
          </div>
          <div class="level-main">
            ${thumbnailMarkup}
            <div>
              <div class="level-title-row">
                <span class="level-rank-label">#${level.position}</span>
                <h3 class="level-name">${escapeHtml(level.name)}</h3>
              </div>
              <div class="creator-name">by ${escapeHtml(level.creator)}</div>
            </div>
          </div>
          <div class="difficulty-wrap">
            <span class="difficulty-pill difficulty-${level.difficulty.toLowerCase()}">${escapeHtml(level.difficulty)}</span>
          </div>
          ${actionsMarkup}
        </article>
      `;
    })
    .join("");
}

function renderSubmissions() {
  submissionListEl.innerHTML = "";
  updateSubmissionBadge();

  if (!isAdmin() || submissions.length === 0) {
    submissionEmptyStateEl.classList.toggle("hidden", !isAdmin() || submissions.length !== 0);
    return;
  }

  submissionEmptyStateEl.classList.add("hidden");
  submissionListEl.innerHTML = submissions
    .map((submission) => `
      <article class="submission-item">
        <div class="submission-main">
          <h3>${escapeHtml(submission.levelName)}</h3>
          <p>Creator: ${escapeHtml(submission.creator)}</p>
          <p>Difficulty: ${escapeHtml(submission.difficulty)}</p>
          <p>Challenge: ${submission.isChallenge ? "Yes" : "No"}</p>
          <p>Sent by: ${escapeHtml(submission.senderName)}</p>
          <p><a href="${escapeHtml(submission.youtubeUrl)}" target="_blank" rel="noopener noreferrer">Open proof video</a></p>
        </div>
        <div class="actions">
          <input class="submission-position-input" type="number" min="1" step="1" placeholder="Position" data-position-id="${submission.id}">
          <button class="action-button" type="button" data-submission-action="approve" data-id="${submission.id}">Approve</button>
          <button class="action-button" type="button" data-submission-action="delete" data-id="${submission.id}">Delete</button>
        </div>
      </article>
    `)
    .join("");
}

async function loadLevels(showFeedback = false) {
  try {
    const result = await request("/api/levels");
    levels = result.data;
    renderLeaderboard();

    if (showFeedback) {
      showMessage("Leaderboard refreshed.");
    }
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function loadSubmissions() {
  if (!isAdmin()) {
    submissions = [];
    renderSubmissions();
    return;
  }

  try {
    const result = await request("/api/submissions");
    submissions = result.data;
    renderSubmissions();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function loadCurrentUser() {
  try {
    const result = await request("/api/me");
    currentUser = result.data;
    updateAuthUi();
    renderLeaderboard();
    await loadSubmissions();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function moveLevel(levelId, direction) {
  if (!isAdmin()) return;
  const level = levels.find((entry) => entry.id === levelId);
  if (!level) return;

  const newPosition = level.position + direction;
  if (newPosition < 1 || newPosition > levels.length) return;

  const payload = {
    name: level.name,
    creator: level.creator,
    difficulty: level.difficulty,
    position: newPosition,
    youtubeUrl: level.youtubeUrl || ""
  };

  try {
    clearMessage();
    await request(`/api/levels/${level.id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    await loadLevels();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function startEditing(levelId) {
  if (!isAdmin()) {
    showMessage("Only admins can edit levels.", "error");
    return;
  }

  const level = levels.find((entry) => entry.id === levelId);
  if (!level) {
    showMessage("That level could not be found.", "error");
    return;
  }

  fields.id.value = level.id;
  fields.name.value = level.name;
  fields.creator.value = level.creator;
  fields.difficulty.value = level.difficulty;
  fields.position.value = level.position;
  fields.youtubeUrl.value = level.youtubeUrl || "";

  formTitleEl.textContent = "Edit Level";
  submitBtnEl.textContent = "Save Level";
  cancelEditBtnEl.classList.remove("hidden");
  showView("leaderboard");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteLevel(levelId) {
  if (!isAdmin()) {
    showMessage("Only admins can delete levels.", "error");
    return;
  }

  const level = levels.find((entry) => entry.id === levelId);
  if (!level) {
    showMessage("That level no longer exists.", "error");
    return;
  }

  if (!window.confirm(`Delete "${level.name}"?`)) {
    return;
  }

  try {
    clearMessage();
    await request(`/api/levels/${levelId}`, { method: "DELETE" });
    await loadLevels();
    showMessage(`Deleted "${level.name}".`);

    if (fields.id.value === levelId) {
      resetLevelForm();
    }
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function handleSubmissionAction(submissionId, action) {
  if (!isAdmin()) {
    return;
  }

  try {
    clearMessage();

    if (action === "approve") {
      const positionInput = submissionListEl.querySelector(`[data-position-id="${submissionId}"]`);
      const position = Number(positionInput?.value);

      if (!Number.isInteger(position) || position < 1) {
        showMessage("Enter a valid position before approving a submission.", "error");
        return;
      }

      await request(`/api/submissions/${submissionId}/approve`, {
        method: "POST",
        body: JSON.stringify({ position })
      });
      await loadLevels();
      showMessage("Submission approved and added to the leaderboard.");
    } else {
      await request(`/api/submissions/${submissionId}`, { method: "DELETE" });
      showMessage("Submission removed.");
    }

    await loadSubmissions();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function getLevelPayload() {
  return {
    name: fields.name.value.trim(),
    creator: fields.creator.value.trim(),
    difficulty: fields.difficulty.value,
    position: Number(fields.position.value),
    youtubeUrl: fields.youtubeUrl.value.trim()
  };
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSubmittingLevel || !isAdmin()) {
    return;
  }

  const payload = getLevelPayload();
  const isEditing = Boolean(fields.id.value);

  if (!payload.name || !payload.creator || !payload.difficulty || !Number.isInteger(payload.position) || payload.position < 1) {
    showMessage("Please complete all level fields with a valid position.", "error");
    return;
  }

  try {
    setLevelSubmittingState(true);
    clearMessage();

    await request(isEditing ? `/api/levels/${fields.id.value}` : "/api/levels", {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });

    await loadLevels();
    resetLevelForm();
    showMessage(isEditing ? "Level updated." : "Level added.");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setLevelSubmittingState(false);
  }
});

submissionFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    clearMessage();
    const payload = {
      senderName: document.getElementById("senderName").value.trim(),
      levelName: document.getElementById("submissionLevelName").value.trim(),
      creator: document.getElementById("submissionCreator").value.trim(),
      difficulty: document.getElementById("submissionDifficulty").value,
      isChallenge: document.getElementById("submissionIsChallenge").value === "true",
      youtubeUrl: document.getElementById("submissionYoutubeUrl").value.trim()
    };

    await request("/api/submissions", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    submissionFormEl.reset();
    showMessage("Level sent to the admin panel.");

    if (isAdmin()) {
      await loadSubmissions();
    }
  } catch (error) {
    showMessage(error.message, "error");
  }
});

loginFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    clearMessage();
    const payload = {
      email: document.getElementById("loginEmail").value.trim(),
      password: document.getElementById("loginPassword").value
    };

    await request("/api/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    loginFormEl.reset();
    await loadCurrentUser();
    await loadLevels();
    showView("leaderboard");
    showMessage("Logged in successfully.");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

registerFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    clearMessage();
    const payload = {
      username: document.getElementById("registerUsername").value.trim(),
      displayName: document.getElementById("registerDisplayName").value.trim(),
      email: document.getElementById("registerEmail").value.trim(),
      password: document.getElementById("registerPassword").value
    };

    await request("/api/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    registerFormEl.reset();
    await loadCurrentUser();
    showView("leaderboard");
    showMessage("Account created.");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

grantAdminFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    clearMessage();
    const payload = {
      username: document.getElementById("grantAdminUsername").value.trim()
    };

    await request("/api/admin/grant-admin", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    grantAdminFormEl.reset();
    showMessage(`"${payload.username}" is now an admin.`);
  } catch (error) {
    showMessage(error.message, "error");
  }
});

logoutBtnEl.addEventListener("click", async () => {
  try {
    clearMessage();
    await request("/api/logout", { method: "POST" });
    currentUser = null;
    updateAuthUi();
    renderLeaderboard();
    showView("leaderboard");
    showMessage("Logged out.");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

cancelEditBtnEl.addEventListener("click", () => {
  resetLevelForm();
  clearMessage();
});

refreshBtnEl.addEventListener("click", async () => {
  clearMessage();
  await loadLevels(true);
  await loadSubmissions();
});

leaderboardEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
const id = Number(button.dataset.id);

  if (action === "move-up") {
    moveLevel(id, -1);
    return;
  }
  
  if (action === "move-down") {
    moveLevel(id, 1);
    return;
  }

  if (action === "edit") {
    startEditing(id);
    return;
  }

  if (action === "delete") {
    deleteLevel(id);
  }
});

submissionListEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-submission-action]");
  if (!button) {
    return;
  }

  handleSubmissionAction(Number(button.dataset.id), button.dataset.submissionAction);
});

navButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    clearMessage();
    showView(button.dataset.view);
    
    // Automatically close the sliding menu when a link is clicked
    closeMenu(); 

    if (button.dataset.view === "adminReview") {
      await loadSubmissions();
    }
  });
});

resetLevelForm();
updateAuthUi();
showView("leaderboard");
Promise.all([loadCurrentUser(), loadLevels()]);
