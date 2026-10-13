const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

const statusText = document.getElementById("api-status");
const statusButton = document.getElementById("status-button");
const tierGrid = document.getElementById("tier-grid");
const tierNote = document.getElementById("tier-note");

async function checkApiStatus() {
  if (statusText) statusText.textContent = "Checking API…";
  try {
    const response = await fetch("/api/health", { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("API unavailable");
    if (statusText) statusText.textContent = "Application API is online.";
  } catch {
    if (statusText) statusText.textContent = "The API is not responding. Check the server deployment.";
  }
}

async function loadMembershipTiers() {
  try {
    const response = await fetch("/api/membership/tiers", { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok || !data.ok || !Array.isArray(data.tiers) || !data.tiers.length) return;
    if (tierGrid) {
      tierGrid.replaceChildren();
      for (const tier of data.tiers) {
        const card = document.createElement("article");
        card.className = `tier ${String(tier.tier_code || "").toLowerCase()}`;
        const gem = document.createElement("span");
        gem.className = "tier-gem";
        gem.textContent = "◆";
        const heading = document.createElement("h3");
        heading.textContent = tier.tier_name;
        const description = document.createElement("p");
        const orderCount = Number(tier.minimum_completed_orders || 0);
        const spend = Number(tier.minimum_completed_spend || 0);
        description.textContent = orderCount || spend
          ? `${orderCount} completed orders · ${spend.toLocaleString()} minimum spend`
          : "Welcome level";
        card.append(gem, heading, description);
        tierGrid.append(card);
      }
    }
    if (tierNote) tierNote.textContent = "Tier criteria are provided by the marketplace database; final thresholds can be set by an administrator.";
  } catch {
    // The static tier cards remain visible if the API/database is not configured yet.
  }
}

if (statusButton) statusButton.addEventListener("click", checkApiStatus);
checkApiStatus();
loadMembershipTiers();


const otpForm = document.getElementById("email-otp-form");
const emailInput = document.getElementById("registration-email");
const otpInput = document.getElementById("registration-otp");
const sendOtpButton = document.getElementById("send-otp-button");
const verifyOtpButton = document.getElementById("verify-otp-button");
const registrationMessage = document.getElementById("registration-message");
const registrationNextStep = document.getElementById("registration-next-step");
const authenticatorStage = document.getElementById("authenticator-stage");
const authenticatorQr = document.getElementById("authenticator-qr");
const authenticatorKey = document.getElementById("authenticator-manual-key");
const authenticatorCode = document.getElementById("authenticator-code");
const authenticatorMessage = document.getElementById("authenticator-message");
const verifyAuthenticatorButton = document.getElementById("verify-authenticator-button");
const copyAuthenticatorKey = document.getElementById("copy-authenticator-key");
let registrationUserId = "";

async function submitRegistrationRequest(url, payload, button, idleLabel) {
  button.disabled = true;
  button.textContent = "Please wait…";
  if (registrationMessage) registrationMessage.textContent = "";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const wait = data.retryAfterSeconds ? ` Wait ${data.retryAfterSeconds} seconds before retrying.` : "";
      throw new Error((data.message || "The request could not be completed.") + wait);
    }
    if (registrationMessage) registrationMessage.textContent = data.message || "Done.";
    if (data.userId && registrationNextStep) {
      registrationNextStep.hidden = false;
      registrationUserId = data.userId;
      registrationNextStep.textContent = "Email verified. Set up Google Authenticator below to continue.";
      if (authenticatorStage) authenticatorStage.hidden = false;
      startAuthenticatorSetup();
      if (otpInput) otpInput.disabled = true;
      if (sendOtpButton) sendOtpButton.disabled = true;
      if (verifyOtpButton) verifyOtpButton.disabled = true;
    }
    return data;
  } catch (error) {
    if (registrationMessage) registrationMessage.textContent = error.message || "A network error occurred.";
    return null;
  } finally {
    if (!registrationNextStep || registrationNextStep.hidden) {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  }
}

if (sendOtpButton && emailInput) {
  sendOtpButton.addEventListener("click", async () => {
    if (!emailInput.reportValidity()) return;
    await submitRegistrationRequest(
      "/api/auth/registration/send-otp",
      { email: emailInput.value },
      sendOtpButton,
      "Send verification code"
    );
  });
}

if (otpForm && emailInput && otpInput && verifyOtpButton) {
  otpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!emailInput.reportValidity() || !otpInput.reportValidity()) return;
    await submitRegistrationRequest(
      "/api/auth/registration/verify-otp",
      { email: emailInput.value, otp: otpInput.value },
      verifyOtpButton,
      "Verify email"
    );
  });
}

async function startAuthenticatorSetup() {
  if (!registrationUserId || !authenticatorMessage) return;
  authenticatorMessage.textContent = "Preparing secure setup…";
  try {
    const response = await fetch("/api/auth/registration/authenticator/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ userId: registrationUserId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || "Authenticator setup failed.");
    authenticatorQr.src = data.qrDataUrl;
    authenticatorQr.hidden = false;
    authenticatorKey.value = data.manualKey;
    authenticatorMessage.textContent = data.message;
  } catch (error) {
    authenticatorMessage.textContent = error.message || "Could not load authenticator setup.";
  }
}

if (copyAuthenticatorKey && authenticatorKey) {
  copyAuthenticatorKey.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(authenticatorKey.value);
      if (authenticatorMessage) authenticatorMessage.textContent = "Setup key copied.";
    } catch {
      authenticatorKey.select();
      if (authenticatorMessage) authenticatorMessage.textContent = "Select and copy the setup key manually.";
    }
  });
}

if (verifyAuthenticatorButton && authenticatorCode) {
  verifyAuthenticatorButton.addEventListener("click", async () => {
    if (!registrationUserId || !authenticatorCode.reportValidity()) return;
    verifyAuthenticatorButton.disabled = true;
    authenticatorMessage.textContent = "Verifying code…";
    try {
      const response = await fetch("/api/auth/registration/authenticator/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ userId: registrationUserId, code: authenticatorCode.value })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || "Authenticator verification failed.");
      authenticatorMessage.textContent = data.message + " Personal-information form is the next stage to implement.";
      authenticatorCode.disabled = true;
      verifyAuthenticatorButton.disabled = true;
    } catch (error) {
      authenticatorMessage.textContent = error.message || "A network error occurred.";
      verifyAuthenticatorButton.disabled = false;
    }
  });
}
