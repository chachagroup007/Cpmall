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
      registrationNextStep.textContent = "Email verified. Your registration reference is " + data.userId + ". The authenticator setup and remaining registration stages are the next implementation step.";
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
